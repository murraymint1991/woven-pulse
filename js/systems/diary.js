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

// Witnessed: pick exactly one line for (target, witness, path, stage)
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const lane = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

/* ---------------------------------------
   TIMELINE (dynamic entries)
---------------------------------------- */

// Append a new diary timeline entry stamped with current in-game time
export function appendDiaryEntry(diaryObj, {
  text,
  path = null,      // "love" | "corruption" | "hybrid" | null
  stage = null,     // 0..5 or null
  mood = [],        // ["anxious","curious"] etc
  tags = [],        // ["#witnessed","#with:tifa"] etc
  asides = []       // extra italic lines in UI
}) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    date: currentISO(),  // in-game timestamp
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

// Backfill entry for a specific in-game day/hour
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

// Convenience: log the currently selected witnessed line into the timeline
export function logWitnessed(diaryObj, witnessId, { text, path, stage }) {
  return appendDiaryEntry(diaryObj, {
    text,
    path: path ?? null,
    stage: stage ?? null,
    mood: ["curious"],
    tags: ["#witnessed", `#with:${witnessId}`]
  });
}

/* ---------------------------------------
   PATH/STAGE STATE (per-character pair)
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
