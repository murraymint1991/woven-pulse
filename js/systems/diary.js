// ===============================
// js/systems/diary.js
// ===============================
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

// Single place to change this
export const DIARY_STAGE_MAX = 10;

// ------------------------------------------
// Normalize dev-format "caught_others"
// to witnessed[target][witness][path] = string[stage]
// ------------------------------------------
function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const PATHS = ["love", "corruption", "hybrid"];
  const outByWitness = {};
  for (const [witnessId, items] of Object.entries(caught || {})) {
    const list = (items || []).slice().sort((a, b) => (a.stageMin ?? 0) - (b.stageMin ?? 0));
    const perPath = { love: [], corruption: [], hybrid: [] };
    for (let s = 0; s <= stageMax; s++) {
      const pick = list.filter(it => (it.stageMin ?? 0) <= s).pop() || null;
      for (const p of PATHS) {
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
// Loader + Normalizer
// ===============================
export async function loadDiary(url) {
  const r = await fetchJson(url);
  if (!r.ok) return null;

  const raw = r.data || {};
  const diary = {
    id: String(raw.id || "diary"),
    version: String(raw.version || "1.0"),
    characterId: String(raw.characterId || raw.actorId || "unknown"),
    targetId: String(raw.targetId || "unknown"),
    desires: raw.desires && typeof raw.desires === "object" ? raw.desires : {},
    // may start empty; we’ll merge caught_others into this
    witnessed: raw.witnessed && typeof raw.witnessed === "object" ? { ...raw.witnessed } : {},
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // Convert/merge caught_others → witnessed, regardless of whether a stub witnessed:{} exists
  if (raw.caught_others && typeof raw.caught_others === "object") {
    const targetIdGuess =
      diary.targetId && diary.targetId !== "unknown"
        ? diary.targetId
        : Object.keys(raw.desires || {})[0] || "vagrant";

    const normalized = normalizeCaughtOthers(raw.caught_others, DIARY_STAGE_MAX);
    diary.witnessed[targetIdGuess] = {
      ...(diary.witnessed[targetIdGuess] || {}),
      ...normalized
    };
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

  // Helpful dev log (quiet in production)
  try {
    console.log("[Diary loaded]", {
      characterId: diary.characterId,
      targetId: diary.targetId,
      keys: Object.keys(diary),
      witnessedTargets: Object.keys(diary.witnessed || {})
    });
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

export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  if (!Array.isArray(lane) || !lane.length) {
    // Dev hint so button clicks tell you what’s missing
    console.warn("[caught] no lane/line for", { who: witnessId, path, stage });
    return null;
  }
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

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
// Pair/Path state
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
