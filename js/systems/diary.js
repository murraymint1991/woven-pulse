// js/systems/diary.js
// ===============================
// SECTION A — Imports & constants
// ===============================
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// If you ever change the cap, do it once here:
export const DIARY_STAGE_MAX = 10; // Aerith uses 0..10

// ===================================================
// Helper A: normalize "caught_others" (Dev data)
// dev shape  ->  witnessed[targetId][witnessId][path] = stage-indexed text[]
// ===================================================
function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const PATHS = ["love", "corruption", "hybrid"];
  const outByWitness = {};

  for (const [witnessId, itemsRaw] of Object.entries(caught || {})) {
    const items = (itemsRaw || [])
      .slice()
      .sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));

    const lanes = { love: [], corruption: [], hybrid: [] };

    for (let s = 0; s <= stageMax; s++) {
      // last item whose stageMin <= s
      const pick = items.filter(it => (it.stageMin ?? 0) <= s).pop() || null;

      for (const p of PATHS) {
        const prev = lanes[p][s - 1] || null;
        const applies = !pick || !pick.path || pick.path === "any" || pick.path === p;
        lanes[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
      }
    }
    outByWitness[witnessId] = lanes;
  }
  return outByWitness;
}

// ===================================================
// Helper B: quick check whether witnessed is normalized
// ===================================================
function isNormalizedWitnessed(obj, targetId) {
  const t = obj?.[targetId];
  if (!t || typeof t !== "object") return false;
  const anyWitness = Object.values(t)[0];
  return Array.isArray(anyWitness?.love);
}

// ===============================
// SECTION B — Loader + Normalizer
// ===============================
/**
 * Load and normalize a diary file so the rest of the app can rely on:
 * {
 *   id: string,
 *   characterId: string,
 *   targetId: string,
 *   desires: { [targetId]: { love:[], corruption:[], hybrid:[] } } | {},
 *   witnessed: { [targetId]: { [witnessId]: { love:[], corruption:[], hybrid:[] } } } | {},
 *   events: { [eventKey]: { [path]: string[] } } | {},   // optional, future use
 *   entries: Array<DiaryEntry>
 * }
 */
export async function loadDiary(url) {
  const r = await fetchJson(url);
  if (!r.ok) return null;

  const root = r.data || {};
  const diary = {
    id: String(root.id || "diary"),
    characterId: String(root.characterId || root.actorId || "unknown"),
    targetId: String(root.targetId || "unknown"),
    desires: {},
    witnessed: {},
    events: {},
    entries: Array.isArray(root.entries) ? root.entries.slice() : []
  };

  // Modular “sources” support (index.json that points to subfiles)
  if (root.sources && typeof root.sources === "object") {
    // desires
    if (root.sources.desires) {
      const rr = await fetchJson(root.sources.desires);
      if (rr.ok) diary.desires = rr.data || {};
    }
    // witnessed (flat dev "caught_others" format)
    if (root.sources.witnessed) {
      const rr = await fetchJson(root.sources.witnessed);
      if (rr.ok) {
        const flat = rr.data || {};
        diary.witnessed = {
          [diary.targetId]: normalizeCaughtOthers(flat, DIARY_STAGE_MAX)
        };
      }
    }
    // events (map of key -> url)
    if (root.sources.events && typeof root.sources.events === "object") {
      const ev = {};
      for (const [ekey, evUrl] of Object.entries(root.sources.events)) {
        const rr = await fetchJson(evUrl);
        if (rr.ok) ev[ekey] = rr.data || {};
      }
      diary.events = ev;
    }
  } else {
    // Legacy monolithic diary JSON support
    diary.desires = root.desires && typeof root.desires === "object" ? root.desires : {};
    diary.witnessed = root.witnessed && typeof root.witnessed === "object" ? root.witnessed : {};
    diary.events = root.events && typeof root.events === "object" ? root.events : {};

    // Legacy “caught_others” at root → normalize to witnessed[targetId]
    if ((!root.witnessed || !Object.keys(root.witnessed).length) && root.caught_others) {
      diary.witnessed = {
        [diary.targetId]: normalizeCaughtOthers(root.caught_others, DIARY_STAGE_MAX)
      };
    }
  }

  // If witnessed exists but isn’t nested/normalized yet, fix now.
  // (e.g., top-level { tifa:[], renna:[], … } without target nesting)
  if (diary.witnessed && !isNormalizedWitnessed(diary.witnessed, diary.targetId)) {
    if (diary.witnessed.tifa || diary.witnessed.renna || diary.witnessed.yuffie) {
      diary.witnessed = {
        [diary.targetId]: normalizeCaughtOthers(diary.witnessed, DIARY_STAGE_MAX)
      };
    }
  }

  // Make sure every timeline entry is minimally shaped
  diary.entries = diary.entries.map((e, i) => ({
    id: String(e.id || `${diary.characterId}-${i}`),
    date: e.date ? String(e.date) : currentISO(),
    text: String(e.text || ""),
    path: e.path ?? null,
    stage: typeof e.stage === "number" ? e.stage : null,
    mood: Array.isArray(e.mood) ? e.mood : [],
    tags: Array.isArray(e.tags) ? e.tags : [],
    asides: Array.isArray(e.asides) ? e.asides : []
  }));

  // Expose for quick sanity checks
  if (typeof window !== "undefined") {
    window.__diaryByPair = window.__diaryByPair || {};
    const key = `${diary.characterId}:${diary.targetId}`;
    window.__diaryByPair[key] = diary;
    console.log("[Diary loaded]", {
      key,
      characterId: diary.characterId,
      targetId: diary.targetId,
      keys: Object.keys(diary || {}),
      entriesCount: diary.entries.length
    });
  }

  return diary;
}

// ===============================
// SECTION C — Selectors
// ===============================
/** Desires: by target -> path -> up to current stage */
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

/** Witnessed: pick exactly one line for (target, witness, path, stage) */
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

/**
 * Optional (nice to have): pick an event line
 * Path-aware, stage-capped, from diary.events[eventKey][path] = string[]
 */
export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

// ===============================
// SECTION D — Timeline mutations
// ===============================
/** Append a new diary entry (stamped with current in-game time) */
export function appendDiaryEntry(diaryObj, {
  text,
  path = null,      // "love" | "corruption" | "hybrid" | null
  stage = null,     // 0..DIARY_STAGE_MAX or null
  mood = [],        // ["anxious","curious"] etc
  tags = [],        // ["#witnessed","#with:tifa"] etc
  asides = []       // extra italic lines in UI
}) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];

  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    date: currentISO(),
    text: String(text || ""),
    path,
    stage,
    mood: Array.isArray(mood) ? mood : [],
    tags: Array.isArray(tags) ? tags : [],
    asides: Array.isArray(asides) ? asides : []
  };
  diaryObj.entries.push(entry);
  return entry;
}

/** Backfill entry for a specific in-game day/hour */
export function appendDiaryEntryAt(diaryObj, day, hour, payload = {}) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];

  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    date: isoFor(day, hour ?? 18, payload.minute ?? 0),
    text: String(payload.text || ""),
    path: payload.path ?? null,
    stage: payload.stage ?? null,
    mood: Array.isArray(payload.mood) ? payload.mood : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    asides: Array.isArray(payload.asides) ? payload.asides : []
  };
  diaryObj.entries.push(entry);
  return entry;
}

/** Convenience: log the currently selected witnessed line into the timeline */
export function logWitnessed(diaryObj, witnessId, { text, path, stage }) {
  return appendDiaryEntry(diaryObj, {
    text,
    path: path ?? null,
    stage: stage ?? null,
    mood: ["curious"],
    tags: ["#witnessed", `#with:${witnessId}`]
  });
}

// ===============================
// SECTION E — Path/Stage state (per pair)
// localStorage shape:
// { "<char>": { "<target>": { path: "...", stage: 0..DIARY_STAGE_MAX } } }
// ===============================
const PS_KEY = "sim_path_state_v1";

export function getPathState() {
  try { return JSON.parse(localStorage.getItem(PS_KEY) || "{}"); }
  catch { return {}; }
}
export function setPathState(next) {
  localStorage.setItem(PS_KEY, JSON.stringify(next || {}));
  return next;
}
export function getPairState(charId, targetId) {
  const all = getPathState();
  return all?.[charId]?.[targetId] || { path: "love", stage: 0 };
}
export function setPairState(charId, targetId, patch) {
  const all = getPathState();
  if (!all[charId]) all[charId] = {};
  const curr = all[charId][targetId] || { path: "love", stage: 0 };
  const next = { ...curr, ...(patch || {}) };

  // Clamp stage to the configured max
  if (typeof next.stage === "number") {
    next.stage = Math.max(0, Math.min(DIARY_STAGE_MAX, next.stage));
  }
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}
