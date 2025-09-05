// js/systems/diary.js
// ---------------------------------------------------------------------
// Pair-aware diary system with robust normalization for "caught" lines.
// Works with any of these shapes in the diary JSON:
//   1) witnessed[targetId][witnessId][path] = [stage0..stage10]
//   2) caught_others[witnessId] = [{stageMin, path, text}, ...]
//   3) events.caught.others[witnessId] = [{stageMin, path, text}, ...]
//   4) witnessed_flat[witnessId][path] = [stage0..stage10]
// ---------------------------------------------------------------------

import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

export const DIARY_STAGE_MAX = 10;
const PATHS = ["love", "corruption", "hybrid"];

/* =================================================================== *
 * Helpers — normalizing "caught" formats into the canonical shape:
 *   witnessed[targetId][witnessId][path] = string[] (index = stage)
 * =================================================================== */

/** Carry-forward timeline from sparse [{stageMin, path, text}] */
function normalizeDevCaughtList(items, stageMax = DIARY_STAGE_MAX) {
  const byPath = { love: [], corruption: [], hybrid: [] };
  const sorted = (items || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));

  for (let s = 0; s <= stageMax; s++) {
    // last item applicable at this stage
    const pick = sorted.filter(it => (it.stageMin ?? 0) <= s).pop() || null;
    for (const p of PATHS) {
      const prev = byPath[p][s - 1] || null;
      const applies = !pick || !pick.path || pick.path === "any" || pick.path === p;
      byPath[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
    }
  }
  return byPath;
}

/** caught_others → { [witnessId]: {love:[], corruption:[], hybrid:[]} } */
function normalizeCaughtOthers(caughtObj, stageMax = DIARY_STAGE_MAX) {
  const out = {};
  for (const [witnessId, items] of Object.entries(caughtObj || {})) {
    out[witnessId] = normalizeDevCaughtList(items, stageMax);
  }
  return out;
}

/** witnessed_flat (already path→array) → ensure arrays sized/stage-capped */
function normalizeWitnessedFlat(flatObj, stageMax = DIARY_STAGE_MAX) {
  const out = {};
  for (const [witnessId, perPath] of Object.entries(flatObj || {})) {
    out[witnessId] = { love: [], corruption: [], hybrid: [] };
    for (const p of PATHS) {
      const src = Array.isArray(perPath?.[p]) ? perPath[p] : [];
      // Fill or clamp to stageMax+1
      for (let s = 0; s <= stageMax; s++) out[witnessId][p][s] = src[s] ?? out[witnessId][p][s - 1] ?? null;
    }
  }
  return out;
}

/** Canonical container initializer */
function emptyWitnessed(targetId) {
  return { [targetId]: {} };
}

/** Merge b into a (paths are arrays); left-biased non-null content wins */
function deepMergeWitnessed(a, b) {
  const out = JSON.parse(JSON.stringify(a || {}));
  for (const [targetId, byWitness] of Object.entries(b || {})) {
    out[targetId] ||= {};
    for (const [w, perPath] of Object.entries(byWitness || {})) {
      out[targetId][w] ||= { love: [], corruption: [], hybrid: [] };
      for (const p of PATHS) {
        const dst = out[targetId][w][p];
        const src = perPath?.[p] || [];
        for (let i = 0; i < src.length; i++) {
          // prefer the first non-null we already had; otherwise take src
          if (dst[i] == null && src[i] != null) dst[i] = src[i];
        }
      }
    }
  }
  return out;
}

/* =================================================================== *
 * Loader — produces a single normalized object the rest of the app uses
 * =================================================================== */
/**
 * Normalized result shape:
 * {
 *   id, characterId, targetId,
 *   desires: { [targetId]: { love:[], corruption:[], hybrid:[] } } | {},
 *   witnessed: { [targetId]: { [witnessId]: { love:[], corruption:[], hybrid:[] } } } | {},
 *   events: { [eventKey]: { [path]: string[] } } | {},   // optional / future
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
    witnessed: raw.witnessed && typeof raw.witnessed === "object" ? raw.witnessed : {},
    // keep any event buckets you might add later
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // Derive a best-guess target if the file forgot to set it
  const guessedTarget =
    diary.targetId && diary.targetId !== "unknown"
      ? diary.targetId
      : Object.keys(diary.desires || {})[0] || "vagrant";

  // 1) If witnessed already exists in canonical shape, keep it.
  let witnessed = diary.witnessed;

  // 2) Migrate dev names → canonical witnessed
  //    a) raw.caught_others
  if (!Object.keys(witnessed || {}).length && raw.caught_others) {
    witnessed = deepMergeWitnessed(
      witnessed,
      { [guessedTarget]: normalizeCaughtOthers(raw.caught_others, DIARY_STAGE_MAX) }
    );
  }
  //    b) raw.events.caught?.others
  const legacyList = raw?.events?.caught?.others;
  if (!Object.keys(witnessed || {}).length && legacyList) {
    witnessed = deepMergeWitnessed(
      witnessed,
      { [guessedTarget]: normalizeCaughtOthers(legacyList, DIARY_STAGE_MAX) }
    );
  }
  //    c) raw.witnessed_flat (already target-less)
  if (!Object.keys(witnessed || {}).length && raw.witnessed_flat) {
    witnessed = deepMergeWitnessed(
      witnessed,
      { [guessedTarget]: normalizeWitnessedFlat(raw.witnessed_flat, DIARY_STAGE_MAX) }
    );
  }

  diary.witnessed = witnessed || {};

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

  // Expose for quick console checks while you iterate
  if (typeof window !== "undefined") {
    const key = `${diary.characterId}:${guessedTarget}`;
    window.__diaryByPair = window.__diaryByPair || {};
    window.__diaryByPair[key] = diary;
  }

  return diary;
}

/* =================================================================== *
 * Selectors
 * =================================================================== */
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  // Try canonical first
  let lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  // Fallbacks if the file was half-migrated:
  if (!Array.isArray(lane)) lane = diary?.witnessed?.[targetId]?.[witnessId]?.any;
  if (!Array.isArray(lane)) lane = diary?.witnessed?.[targetId]?.[witnessId]?.["*"];
  if (!Array.isArray(lane) || !lane.length) return null;

  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s] ?? null;
}

/** Optional: path/stage aware event line (future use) */
export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

/* =================================================================== *
 * Timeline mutations
 * =================================================================== */
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

/** Convenience for caught-by buttons */
export function logWitnessed(diaryObj, witnessId, { text, path, stage }) {
  return appendDiaryEntry(diaryObj, {
    text,
    path: path ?? null,
    stage: stage ?? null,
    mood: ["curious"],
    tags: ["#witnessed", `#with:${witnessId}`]
  });
}

/* =================================================================== *
 * Pair path/stage state (localStorage)
 * =================================================================== */
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
