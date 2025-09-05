// js/systems/diary.js
// ===============================

import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// If you ever change the cap, do it once here:
export const DIARY_STAGE_MAX = 10; // 0..10 inclusive

// ----------------------------------------
// caught_others → witnessed (normalized)
// witnessed_flat cache for quick lookups
// ----------------------------------------
const PATHS = ["love", "corruption", "hybrid"];

function buildEmptyLane(stageMax = DIARY_STAGE_MAX) {
  const a = new Array(stageMax + 1);
  for (let i = 0; i <= stageMax; i++) a[i] = null;
  return a;
}

/**
 * Normalize "caught_others" shape into:
 * witnessed[targetId][witnessId][path] = string[] (stage-indexed 0..N, carry-forward)
 */
function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const out = {};
  for (const [witnessId, arr] of Object.entries(caught || {})) {
    const items = (arr || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));
    const perPath = { love: buildEmptyLane(stageMax), corruption: buildEmptyLane(stageMax), hybrid: buildEmptyLane(stageMax) };

    let cursor = 0;
    for (let s = 0; s <= stageMax; s++) {
      // advance cursor to the last item whose stageMin <= s
      while (cursor + 1 < items.length && (items[cursor + 1].stageMin ?? 0) <= s) cursor++;
      const pick = items[cursor] && (items[cursor].stageMin ?? 0) <= s ? items[cursor] : null;

      for (const p of PATHS) {
        // carry-forward last value
        const prev = s > 0 ? perPath[p][s - 1] : null;
        if (!pick) { perPath[p][s] = prev; continue; }
        const applies = !pick.path || pick.path === "any" || pick.path === p;
        perPath[p][s] = applies ? (pick.text || prev || null) : prev;
      }
    }
    out[witnessId] = perPath;
  }
  return out;
}

/** Flatten witnessed into simple stage-indexed lanes (already normalized) */
function buildWitnessedFlat(witnessed, stageMax = DIARY_STAGE_MAX) {
  const out = {};
  for (const [targetId, byWitness] of Object.entries(witnessed || {})) {
    const targetMap = (out[targetId] = {});
    for (const [witnessId, perPath] of Object.entries(byWitness || {})) {
      const rec = (targetMap[witnessId] = {});
      for (const p of PATHS) {
        const lane = perPath?.[p];
        rec[p] = Array.isArray(lane) ? lane.slice(0, stageMax + 1) : buildEmptyLane(stageMax);
      }
    }
  }
  return out;
}

// ===============================
// Loader + Normalizer
// ===============================
/**
 * Normalized diary shape:
 * {
 *   id, characterId, targetId,
 *   desires: { [targetId]: { love:[], corruption:[], hybrid:[] } },
 *   witnessed: { [targetId]: { [witnessId]: { love:[], corruption:[], hybrid:[] } } },
 *   witnessed_flat: same as witnessed but guaranteed arrays (stage-indexed),
 *   events: { [eventKey]: { [path]: string[] } },
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
    targetId: String(raw.targetId || Object.keys(raw.desires || {})[0] || "unknown"),
    desires: raw.desires && typeof raw.desires === "object" ? raw.desires : {},
    witnessed: raw.witnessed && typeof raw.witnessed === "object" ? raw.witnessed : {},
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // If there is dev-style caught_others and witnessed is missing/empty → convert it.
  const needsConvert = !raw.witnessed || Object.keys(raw.witnessed).length === 0;
  if (needsConvert && raw.caught_others) {
    const perWitness = normalizeCaughtOthers(raw.caught_others, DIARY_STAGE_MAX);
    diary.witnessed = { [diary.targetId]: perWitness };
  }

  // Build flat cache regardless (no-op if nothing there)
  diary.witnessed_flat = buildWitnessedFlat(diary.witnessed, DIARY_STAGE_MAX);

  // Normalize existing timeline entries a bit
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

  // Handy dev hook
  try {
    const key = `${diary.characterId}:${diary.targetId}`;
    if (typeof window !== "undefined") {
      window.__diaryByPair = window.__diaryByPair || {};
      window.__diaryByPair[key] = diary;
      console.log("[Diary loaded]", { key, characterId: diary.characterId, targetId: diary.targetId, keys: Object.keys(diary), entriesCount: diary.entries.length });
    }
  } catch {}

  return diary;
}

// ===============================
// Selectors
// ===============================
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

/** Witnessed: pick exactly one line for (target, witness, path, stage) */
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const flat = diary?.witnessed_flat?.[targetId]?.[witnessId]?.[path];
  if (Array.isArray(flat) && flat.length) {
    const s = Math.max(0, Math.min(Number(stage ?? 0), flat.length - 1));
    return flat[s] || null;
  }
  // Dev hint
  console.warn("[caught] no lane/line for", { who: witnessId, path, stage });
  return null;
}

/** Optional: event line (stage-capped) */
export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

// ===============================
// Timeline mutations
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

/** Convenience: log a witnessed line into the timeline */
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
// Pair path/stage state (localStorage)
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
