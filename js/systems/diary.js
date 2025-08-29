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
  if (typeof next.stage === "number") {
    next.stage = Math.max(0, Math.min(5, next.stage));
  }
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}

/* ---------------------------------------
   FREEFORM ENTRY APPENDS (timeline)
---------------------------------------- */
export function appendDiaryEntry(diaryObj, {
  text,
  path = null,      // "love" | "corruption" | "hybrid" | null
  stage = null,     // 0..5 or null
  mood = [],        // ["hopeful"]
  tags = [],        // ["#auto", "#stage-change"]
  witness = null    // "tifa" | "renna" | etc
}) {
  if (!diaryObj.entries) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
  const entry = { id, date: currentISO(), mood, tags, path, stage, witness, text };
  diaryObj.entries.push(entry);
  return entry;
}

export function appendDiaryEntryAt(diaryObj, day, hour, payload) {
  if (!diaryObj.entries) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
  const entry = {
    id,
    date: isoFor(day, hour, payload.minute ?? 0),
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

/* convenience: auto line when stage changes (you can call this inside UI) */
export function autoNoteStageChange(diaryObj, charName, targetName, stage) {
  return appendDiaryEntry(diaryObj, {
    text: `${charName} feels something shift with ${targetName}. (Stage ${stage})`,
    mood: ["restless"],
    tags: ["#auto", "#stage-change"],
    stage
  });
}
