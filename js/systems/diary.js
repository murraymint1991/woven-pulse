// js/systems/diary.js
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

/* ---------------------------------------
   LOAD
---------------------------------------- */
export async function loadDiary(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data || null) : null;
}

/* ---------------------------------------
   SELECTORS (static route text)
---------------------------------------- */
// Desires: by target -> path -> up to stage
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

// Reflections: by target -> witness -> up to stage
export function selectReflectionEntries(diary, targetId, witnessId, stage) {
  const lane = diary?.reflections?.[targetId]?.[witnessId];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

/* ---------------------------------------
   PATH/STAGE STATE (per character pair)
   localStorage shape:
   {
     "aerith": {
       "vagrant": { "path": "love|corruption|hybrid", "stage": 0..5 }
     }
   }
---------------------------------------- */
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
  // clamp stage if provided
  if (typeof next.stage === "number") {
    next.stage = Math.max(0, Math.min(5, next.stage));
  }
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}

/* ---------------------------------------
   TIMELINE ENTRIES (runtime)
   - append with in-game timestamp
   - optional persistence
---------------------------------------- */
// Optional persistence helpers (call after load & after edits)
const DIARY_ENTRIES_KEY = (charId) => `sim_diary_entries_${charId}_v1`;

export function loadPersistedEntries(diaryObj) {
  const who = diaryObj?.characterId || "unknown";
  try {
    const raw = localStorage.getItem(DIARY_ENTRIES_KEY(who));
    if (raw) {
      const saved = JSON.parse(raw);
      // merge with any bundled entries (keep bundled first, then saved)
      const base = Array.isArray(diaryObj.entries) ? diaryObj.entries : [];
      diaryObj.entries = base.concat(saved);
    } else {
      diaryObj.entries = Array.isArray(diaryObj.entries) ? diaryObj.entries : [];
    }
  } catch {
    diaryObj.entries = Array.isArray(diaryObj.entries) ? diaryObj.entries : [];
  }
  return diaryObj.entries;
}

export function savePersistedEntries(diaryObj) {
  const who = diaryObj?.characterId || "unknown";
  // Only persist entries that were added at runtime (heuristic: those without a known seed flag)
  // If you want to persist all, just store diaryObj.entries directly:
  localStorage.setItem(DIARY_ENTRIES_KEY(who), JSON.stringify(diaryObj.entries || []));
}

/** Append entry at the current in-game time */
export function appendDiaryEntry(
  diaryObj,
  { text, path = null, stage = null, mood = [], tags = [], witness = null, location = null }
) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];
  const who = diaryObj.characterId || "unknown";
  const id = `${who}-${Math.random().toString(36).slice(2, 8)}`;

  const entry = {
    id,
    date: currentISO(),  // from game clock
    mood,
    tags,
    path,
    stage: typeof stage === "number" ? Math.max(0, Math.min(5, stage)) : stage,
    witness,
    location,
    text
  };
  diaryObj.entries.push(entry);
  return entry;
}

/** Append entry for a specific in-game day/hour (backfill) */
export function appendDiaryEntryAt(
  diaryObj,
  day,
  hour,
  { text, path = null, stage = null, mood = [], tags = [], witness = null, location = null }
) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];
  const who = diaryObj.characterId || "unknown";
  const id = `${who}-${Math.random().toString(36).slice(2, 8)}`;

  const entry = {
    id,
    date: isoFor(day, hour), // from game clock
    mood,
    tags,
    path,
    stage: typeof stage === "number" ? Math.max(0, Math.min(5, stage)) : stage,
    witness,
    location,
    text
  };
  diaryObj.entries.push(entry);
  return entry;
}

/* ---------------------------------------
   VIEW HELPERS
---------------------------------------- */
// Group entries by YYYY-MM-DD (sorted ascending)
export function groupEntriesByDay(entries = []) {
  const by = new Map();
  for (const e of entries) {
    const day = (e.date || "").slice(0, 10) || "unknown";
    if (!by.has(day)) by.set(day, []);
    by.get(day).push(e);
  }
  return Array.from(by.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
