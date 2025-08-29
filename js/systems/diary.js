// js/systems/diary.js
import { fetchJson } from "../utils.js";

/** Load a diary JSON (per character). */
export async function loadDiary(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data || null) : null;
}

/** Select desire entries up to current stage for a given path lane. */
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(stage ?? 0, lane.length - 1));
  return lane.slice(0, s + 1);
}

/** Select reflection entries up to stage for: target (e.g. vagrant) with witness (e.g. tifa). */
export function selectReflectionEntries(diary, targetId, witnessId, stage) {
  const lane = diary?.reflections?.[targetId]?.[witnessId];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(stage ?? 0, lane.length - 1));
  return lane.slice(0, s + 1);
}

/* ---------------------------
   Simple per-character path state (localStorage)
   shape:
   {
     "aerith": { "vagrant": { "path":"love|corruption|hybrid", "stage": 0..5 } }
   }
---------------------------- */
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
  all[charId][targetId] = { ...curr, ...(patch || {}) };
  setPathState(all);
  return all[charId][targetId];
}
