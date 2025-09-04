// js/systems/diary.js
// ===============================
// SECTION A — Imports & constants
// ===============================
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// If you ever change the cap, do it once here:
export const DIARY_STAGE_MAX = 10; // 0..10

// ===========================================
// Helper: normalize "caught_others" (dev data)
// ===========================================
// Input shape (example):
// {
//   "tifa": [ { stageMin:0, path:"any", text:"..." }, ... ],
//   "renna": [ ... ]
// }
// Output we want:
// witnessed[targetId][witnessId][path] = [ lineForStage0, ..., lineForStage10 ]
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
 *   events: { [eventKey]: { [path]: string[] } } | {},   // optional
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
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // Accept dev data where "caught_others" is at the root or nested under events.
  const caughtBlock = raw.caught_others || (raw.events && raw.events.caught_others);
  if ((!diary.witnessed || !Object.keys(diary.witnessed).length) && caughtBlock) {
    // Guess target if not provided
    const targetIdGuess =
      diary.targetId && diary.targetId !== "unknown"
        ? diary.targetId
        : Object.keys(diary.desires || {})[0] || "vagrant";

    diary.witnessed = {
      [targetIdGuess]: normalizeCaughtOthers(caughtBlock, DIARY_STAGE_MAX)
    };
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
 * Optional: path-aware event line from diary.events[eventKey][path] = string[]
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
  path = null,
  stage = null,
  mood = [],
  tags = [],
  asides = []
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
  if (typeof next.stage === "number") {
    next.stage = Math.max(0, Math.min(DIARY_STAGE_MAX, next.stage));
  }
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}
