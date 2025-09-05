// js/systems/diary.js
// Diary data + helpers (robust against dev JSON)

// ===============================
// SECTION A — Imports & constants
// ===============================
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// If you ever change the cap, do it once here:
export const DIARY_STAGE_MAX = 10; // Aerith uses 0..10

// ===========================================
// Helper: normalize "caught_others" (Dev data)
// ===========================================
// Input shape (example):
// {
//   "tifa": [ { stageMin:0, path:"any", text:"..." }, ... ],
//   "renna": [ ... ]
// }
// Output we want (per witness):
// { love:[s0..s10], corruption:[s0..s10], hybrid:[s0..s10] }
function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const PATHS = ["love", "corruption", "hybrid"];
  const outByWitness = {};

  for (const [witnessId, items] of Object.entries(caught || {})) {
    const sorted = (items || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));
    const perPath = { love: [], corruption: [], hybrid: [] };

    for (let s = 0; s <= stageMax; s++) {
      // last item whose stageMin <= s
      const pick = sorted.filter(it => (it.stageMin ?? 0) <= s).pop() || null;

      for (const p of PATHS) {
        // carry-forward previous stage text unless a new one applies
        const prev = perPath[p][s - 1] || null;
        const applies = !pick || !pick.path || pick.path === "any" || pick.path === p;
        perPath[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
      }
    }
    outByWitness[witnessId] = perPath;
  }
  return outByWitness;
}

// Compute a single line from raw caught dev data (no normalization needed).
function pickFromRawCaught(devList = [], path = "love", stage = 0) {
  // choose last item with stageMin <= stage and whose path is "any" or matches
  const applicable = devList
    .filter(it => (it.stageMin ?? 0) <= stage)
    .filter(it => !it.path || it.path === "any" || it.path === path);
  if (!applicable.length) return null;
  return String(applicable[applicable.length - 1].text || "");
}

// ===============================
// SECTION B — Loader + Normalizer
// ===============================
/**
 * Load and normalize a diary file so the rest of the app can rely on:
 * {
 *   id, characterId, targetId,
 *   desires: { [targetId]: { love:[], corruption:[], hybrid:[] } } | {},
 *   witnessed: { [targetId]: { [witnessId]: { love:[], corruption:[], hybrid:[] } } } | {},
 *   witnessed_flat: { [witnessId]: { love:[], corruption:[], hybrid:[] } } | {},
 *   rawCaught: { [witnessId]: Array<{stageMin,path,text}> } | undefined,
 *   events: { [eventKey]: { [path]: string[] } } | {},
 *   entries: Array<DiaryEntry>
 * }
 */
export async function loadDiary(url) {
  const r = await fetchJson(url);
  if (!r.ok) return null;

  const raw = r.data || {};
  const diary = {
    id: String(raw.id || "diary"),
    characterId: String(raw.characterId || raw.actorId || "unknown"),
    targetId: String(raw.targetId || "unknown"),
    desires: raw.desires && typeof raw.desires === "object" ? raw.desires : {},
    witnessed: raw.witnessed && typeof raw.witnessed === "object" ? raw.witnessed : {},
    events: raw.events && typeof raw.events === "object" ? raw.events : {}, // optional
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : [],
    rawCaught: raw.caught_others && typeof raw.caught_others === "object" ? raw.caught_others : undefined,
    witnessed_flat: {}
  };

  // Guess a target if none provided
  const targetIdGuess =
    (diary.targetId && diary.targetId !== "unknown")
      ? diary.targetId
      : Object.keys(raw.desires || {})[0] || "vagrant";

  // If dev data present and witnessed isn't provided, build it.
  if ((!raw.witnessed || !Object.keys(raw.witnessed).length) && diary.rawCaught) {
    diary.witnessed = { [targetIdGuess]: normalizeCaughtOthers(diary.rawCaught, DIARY_STAGE_MAX) };
  }

  // Build a flat map (per witness) regardless, for convenience/fallbacks.
  diary.witnessed_flat =
    diary.witnessed && diary.witnessed[targetIdGuess]
      ? diary.witnessed[targetIdGuess]
      : (diary.rawCaught ? normalizeCaughtOthers(diary.rawCaught, DIARY_STAGE_MAX) : {});

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
  // primary shape
  let lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  if (Array.isArray(lane) && lane.length) {
    const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
    return lane[s] || null;
  }
  // flat fallback
  lane = diary?.witnessed_flat?.[witnessId]?.[path];
  if (Array.isArray(lane) && lane.length) {
    const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
    return lane[s] || null;
  }
  // dev-data immediate fallback
  const devList = diary?.rawCaught?.[witnessId];
  if (Array.isArray(devList) && devList.length) {
    return pickFromRawCaught(devList, path, Number(stage ?? 0));
  }
  return null;
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
