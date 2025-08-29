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
  if (typeof next.stage === "number") next.stage = Math.max(0, Math.min(5, next.stage));
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}

/* ---------------------------------------
   APPEND ENTRIES (dynamic diary stream)
---------------------------------------- */
export function appendDiaryEntry(diaryObj, {
  text,
  path = null,          // "love" | "corruption" | "hybrid" | null
  stage = null,         // 0..5 or null
  mood = [],            // ["hopeful"], ["quiet"], ...
  tags = [],            // ["#auto", "#stage-change"], ...
  witness = null
}) {
  if (!diaryObj) return null;
  if (!diaryObj.entries) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
  const entry = {
    id,
    date: currentISO(), // in-game time
    mood,
    tags,
    path,
    stage,
    witness,
    text
  };
  diaryObj.entries.push(entry);
  return entry;
}

// Backfill at specific in-game day/hour
export function appendDiaryEntryAt(diaryObj, day, hour, payload) {
  if (!diaryObj) return null;
  if (!diaryObj.entries) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
  const entry = {
    id,
    date: isoFor(day, hour),
    mood: payload.mood || [],
    tags: payload.tags || [],
    path: payload.path ?? null,
    stage: payload.stage ?? null,
    witness: payload.witness ?? null,
    text: payload.text || ""
  };
  diaryObj.entries.push(entry);
  return entry;
}

/* ---------------------------------------
   AUTO-NOTES on path / stage change
   (reads optional diary.autoNotes)
---------------------------------------- */
function pickAutoNote(diaryObj, lane, stage){
  const arr = diaryObj?.autoNotes?.[lane];
  if (!Array.isArray(arr) || !arr.length) return null;

  // allow either strings or arrays of variants per stage
  const idx = Math.max(0, Math.min(arr.length - 1, Number(stage || 0)));
  const slot = arr[idx];
  const pool = Array.isArray(slot) ? slot : [slot];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Use this instead of setPairState when you want auto logging.
export function setPairStateWithAutoNote(diaryObj, charId, targetId, patch){
  const before = getPairState(charId, targetId);
  const after  = setPairState(charId, targetId, patch);

  const laneChanged  = before.path  !== after.path;
  const stageChanged = before.stage !== after.stage;

  if ((laneChanged || stageChanged) && diaryObj){
    const text = pickAutoNote(diaryObj, after.path, after.stage);
    if (text){
      appendDiaryEntry(diaryObj, {
        text,
        path: after.path,
        stage: after.stage,
        mood: [after.path],              // paints a badge in UI
        tags: ["#auto", "#stage-change"]
      });
    }
  }
  return after;
}
