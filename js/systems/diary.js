// js/systems/diary.js
// Timeline + pair-state + robust loader (handles `caught_others` and `witnessed`)

import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// Aerith uses 0..10
export const DIARY_STAGE_MAX = 10;

// ----- internal: map "any" to every path we care about
const PATHS = ["love", "corruption", "hybrid"];

// Build a stage-indexed lane array with carry-forward
function buildLaneFromRanges(ranges, path, stageMax = DIARY_STAGE_MAX) {
  const sorted = (ranges || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));
  const lane = Array(stageMax + 1).fill(null);
  let last = null;
  for (let s = 0; s <= stageMax; s++) {
    // pick last item whose stageMin ≤ s and applies to this path (or "any")
    const pick = sorted.filter(r => (r.stageMin ?? 0) <= s)
      .reverse()
      .find(r => !r.path || r.path === "any" || r.path === path) || null;
    if (pick && pick.text) last = String(pick.text);
    lane[s] = last;
  }
  return lane;
}

// Normalize dev-style caught data into witnessed_flat[target][witness][path] = string[]
function normalizeCaughtToWitnessedFlat(caughtObj, stageMax = DIARY_STAGE_MAX) {
  const out = {};
  for (const [witnessId, ranges] of Object.entries(caughtObj || {})) {
    out[witnessId] = {};
    for (const p of PATHS) {
      out[witnessId][p] = buildLaneFromRanges(ranges, p, stageMax);
    }
  }
  return out;
}

/**
 * Load and normalize a diary file so the rest of the app can rely on:
 * {
 *   id, characterId, targetId,
 *   desires: { [target]: { love:[], corruption:[], hybrid:[] } } | {},
 *   witnessed_flat: { [target]: { [witness]: { [path]: string[] } } } | {},
 *   entries: DiaryEntry[]
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
    // witnessed_flat[target][witness][path] = string[] (stage-indexed)
    witnessed_flat: {},
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // 1) If the file already supplies witnessed (flat), accept common shapes:
  //    witnessed[target][witness][path] = string[]
  //    witnessed_flat[target][witness][path] = string[]
  if (raw.witnessed_flat) {
    diary.witnessed_flat = raw.witnessed_flat;
  } else if (raw.witnessed) {
    diary.witnessed_flat = raw.witnessed;
  }

  // 2) Dev-style `caught_others` (root)
  if (!Object.keys(diary.witnessed_flat).length && raw.caught_others) {
    const tgt = diary.targetId || "vagrant";
    diary.witnessed_flat = { [tgt]: normalizeCaughtToWitnessedFlat(raw.caught_others) };
  }

  // 3) Dev-style `caught_others` nested under desires[target]
  if (!Object.keys(diary.witnessed_flat).length && diary.desires) {
    const targets = Object.keys(diary.desires);
    for (const tgt of targets) {
      const maybe = diary.desires[tgt]?.caught_others;
      if (maybe) {
        if (!diary.witnessed_flat[tgt]) diary.witnessed_flat[tgt] = {};
        Object.assign(diary.witnessed_flat[tgt], normalizeCaughtToWitnessedFlat(maybe));
      }
    }
  }

  // Normalize timeline entries
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

// ----------------- Selectors -----------------
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

/** Pick exactly one witnessed line for (target, witness, path, stage) */
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const lane = diary?.witnessed_flat?.[targetId]?.[witnessId]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s] || null;
}

/** Optional: event line (if you decide to use events[eventKey][path]=[]) */
export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

// ----------------- Timeline mutations -----------------
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
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
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
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
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

export function logWitnessed(diaryObj, witnessId, { text, path, stage }) {
  return appendDiaryEntry(diaryObj, {
    text,
    path: path ?? null,
    stage: stage ?? null,
    mood: ["curious"],
    tags: ["#witnessed", `#with:${witnessId}`]
  });
}

// ----------------- Pair path/stage (localStorage) -----------------
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
