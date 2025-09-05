// js/systems/diary.js
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

export const DIARY_STAGE_MAX = 10;
const PATHS = ["love","corruption","hybrid"];

// Normalize root caught_others { witnessId: [{stageMin,path,text},...] }
// → { witnessId: { love:[0..10], corruption:[0..10], hybrid:[0..10] } }
function normalizeCaughtOthers(caught, stageMax = DIARY_STAGE_MAX) {
  const outByWitness = {};
  for (const [witnessId, items] of Object.entries(caught || {})) {
    const sorted = (items || []).slice().sort((a,b)=> (a.stageMin??0) - (b.stageMin??0));
    const perPath = { love:[], corruption:[], hybrid:[] };
    for (let s=0; s<=stageMax; s++) {
      const pick = sorted.filter(it => (it.stageMin ?? 0) <= s).pop() || null;
      for (const p of PATHS) {
        const prev = perPath[p][s-1] || null;
        const applies = !pick || !pick.path || pick.path==="any" || pick.path===p;
        perPath[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
      }
    }
    outByWitness[witnessId] = perPath;
  }
  return outByWitness;
}

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
    witnessed: raw.witnessed && typeof raw.witnessed === "object" ? raw.witnessed : {},
    events: raw.events && typeof raw.events === "object" ? raw.events : {},
    entries: Array.isArray(raw.entries) ? raw.entries.slice() : []
  };

  // Promote root caught_others → witnessed[targetId]
  const hasWitnessed = diary.witnessed && Object.keys(diary.witnessed).length > 0;
  const hasCaught = !!raw.caught_others && typeof raw.caught_others === "object";
  if (!hasWitnessed && hasCaught) {
    const tgt = diary.targetId && diary.targetId !== "unknown"
      ? diary.targetId
      : (Object.keys(diary.desires||{})[0] || "vagrant");
    diary.witnessed = { [tgt]: normalizeCaughtOthers(raw.caught_others, DIARY_STAGE_MAX) };
  }

  // Build a “flat” shape for quick access: witnessed_flat[witnessId][path] = [...]
  // (This is handy for dev and as a fallback if a target key is missing.)
  const flat = {};
  const byTarget = diary.witnessed || {};
  for (const target of Object.keys(byTarget)) {
    const byWitness = byTarget[target] || {};
    for (const [w, paths] of Object.entries(byWitness)) {
      if (!flat[w]) flat[w] = { love:[], corruption:[], hybrid:[] };
      for (const p of PATHS) {
        const lane = Array.isArray(paths[p]) ? paths[p] : [];
        // Prefer longer lane if multiple targets end up merged
        if (lane.length > (flat[w][p]?.length || 0)) flat[w][p] = lane.slice();
      }
    }
  }
  diary.witnessed_flat = flat;

  // Normalize entries
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

  // Expose for quick console checks in dev
  if (typeof window !== "undefined") window.__lastDiary = diary;

  return diary;
}

// ---------- Selectors ----------
export function selectDesireEntries(diary, targetId, path, stage) {
  const lane = diary?.desires?.[targetId]?.[path];
  if (!Array.isArray(lane)) return [];
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane.slice(0, s + 1);
}

// Read witnessed line with strong and fallback lookups
export function selectWitnessedLine(diary, targetId, witnessId, path, stage) {
  const s = (n) => Math.max(0, Math.min(Number(stage ?? 0), n - 1));
  // strong (targeted) lane
  const laneA = diary?.witnessed?.[targetId]?.[witnessId]?.[path];
  if (Array.isArray(laneA) && laneA.length) return laneA[s(laneA.length)];
  // fallback (flat)
  const laneB = diary?.witnessed_flat?.[witnessId]?.[path];
  if (Array.isArray(laneB) && laneB.length) return laneB[s(laneB.length)];
  return null;
}

export function selectEventLine(diary, eventKey, path, stage) {
  const lane = diary?.events?.[eventKey]?.[path];
  if (!Array.isArray(lane) || !lane.length) return null;
  const s = Math.max(0, Math.min(Number(stage ?? 0), lane.length - 1));
  return lane[s];
}

// ---------- Mutations ----------
export function appendDiaryEntry(diaryObj, {
  text, path=null, stage=null, mood=[], tags=[], asides=[]
}) {
  if (!diaryObj) return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];
  const id = `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id, date: currentISO(), text: String(text || ""),
    path, stage,
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
    text, path: path ?? null, stage: stage ?? null,
    mood: ["curious"], tags: ["#witnessed", `#with:${witnessId}`]
  });
}

// ---------- Path/Stage (per pair) ----------
const PS_KEY = "sim_path_state_v1";
export function getPathState() { try { return JSON.parse(localStorage.getItem(PS_KEY) || "{}"); } catch { return {}; } }
export function setPathState(next) { localStorage.setItem(PS_KEY, JSON.stringify(next || {})); return next; }
export function getPairState(charId, targetId) {
  const all = getPathState();
  return all?.[charId]?.[targetId] || { path: "love", stage: 0 };
}
export function setPairState(charId, targetId, patch) {
  const all = getPathState();
  if (!all[charId]) all[charId] = {};
  const curr = all[charId][targetId] || { path: "love", stage: 0 };
  const next = { ...curr, ...(patch || {}) };
  if (typeof next.stage === "number") next.stage = Math.max(0, Math.min(DIARY_STAGE_MAX, next.stage));
  all[charId][targetId] = next;
  setPathState(all);
  return next;
}
