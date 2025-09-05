// js/systems/diary.js
// ===============================
// SECTION A — Imports & constants
// ===============================
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// If you ever change the cap, do it once here:
export const DIARY_STAGE_MAX = 10; // Aerith uses 0..10

// ===========================================
// Helper: normalize "caught_others"
// ===========================================
// Input shape (example):
// {
//   "tifa": [ { stageMin:0, path:"any", text:"..." }, ... ],
//   "renna": [ ... ]
// }
// Output we want (two forms for convenience):
//  A) witnessed[targetId][witnessId][path] = [ stage0Line, ... stage10Line ]
//  B) witnessed_flat[witnessId][path]       = [ stage0Line, ... stage10Line ]
const PATHS = ["love", "corruption", "hybrid"];

function buildLane(items, stageMax = DIARY_STAGE_MAX) {
  const sorted = (items || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));
  const perPath = { love: [], corruption: [], hybrid: [] };

  for (let s = 0; s <= stageMax; s++) {
    const pick = sorted.filter(it => (it.stageMin ?? 0) <= s).pop() || null;
    for (const p of PATHS) {
      const prev = perPath[p][s - 1] || null;
      const applies = !pick || !pick.path || pick.path === "any" || pick.path === p;
      perPath[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
    }
  }
  return perPath;
}

function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const witnessed_flat = {};
  for (const [witnessId, items] of Object.entries(caught || {})) {
    witnessed_flat[witnessId] = buildLane(items, stageMax);
  }
  return witnessed_flat;
}

// Merge helper (shallow)
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const k of Object.keys(b || {})) out[k] = b[k];
  return out;
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
 *   witnessed_flat: { [witnessId]: { love:[], corruption:[], hybrid:[] } } | {},
 *   events: { ... } | {},
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
    witnessed_flat: {}, // we’ll build this
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // --- Gather any dev "caught_others" from both root and events
  const caughtRoot = raw.caught_others || null;
  const caughtInEvents = raw.events && raw.events.caught_others ? raw.events.caught_others : null;

  const caughtCombined = merge(caughtRoot, caughtInEvents); // witnessId → items[]

  if (caughtCombined && Object.keys(caughtCombined).length) {
    // 1) flat map (by witness)
    diary.witnessed_flat = normalizeCaughtOthers(caughtCombined, DIARY_STAGE_MAX);

    // 2) nested map (by target → witness)
    const targetIdGuess =
      diary.targetId && diary.targetId !== "unknown"
        ? diary.targetId
        : Object.keys(diary.desires || {})[0] || "vagrant";

    const nest = {};
    for (const [who, perPath] of Object.entries(diary.witnessed_flat)) {
      if (!nest[who]) nest[who] = perPath;
    }
    // only backfill nested if not already present for this target
    if (!diary.witnessed[targetIdGuess]) diary.witnessed[targetIdGuess] = {};
    diary.witnessed[targetIdGuess] = { ...diary.witnessed[targetIdGuess], ...nest };
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

/** Witnessed: pick a line, trying nested → flat fallbacks */
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  // A) nested
  let lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  // B) flat (if nested missing)
  if (!Array.isArray(lane)) lane = diary?.witnessed_flat?.[witnessId]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

/** Optional: pick an event line */
export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

// ===============================
// SECTION D — Timeline mutations
// ===============================
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
