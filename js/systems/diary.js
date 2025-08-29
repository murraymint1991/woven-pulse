// js/systems/diary.js
import { fetchJson } from "../utils.js";
import { currentISO, isoFor } from "./clock.js";

/* ---------------------------------------
   SHAPE & NORMALIZATION
---------------------------------------- */
function ensureDiaryShape(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  d.characterId  = d.characterId || "unknown";
  d.desires      = d.desires || {};      // { targetId: { love|corruption|hybrid: [text] } }
  d.reflections  = d.reflections || {};  // { targetId: { witnessId: [text] } }
  d.entries      = Array.isArray(d.entries) ? d.entries : []; // timeline entries
  return d;
}

/* ---------------------------------------
   LOAD
---------------------------------------- */
export async function loadDiary(url) {
  const r = await fetchJson(url);
  return r.ok ? ensureDiaryShape(r.data || {}) : null;
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
   TIMELINE API (mutable, in-memory)
---------------------------------------- */
/**
 * Append a new diary timeline entry stamped with current in-game time.
 * @param {Object} diaryObj  - the loaded diary object (mutated in place)
 * @param {Object} payload   - { text, path?, stage?, mood?:string[], tags?:string[], witness?:string, asides?:string[] }
 * @returns {Object} the created entry
 */
export function appendDiaryEntry(diaryObj, {
  text,
  path = null,
  stage = null,
  mood = [],
  tags = [],
  witness = null,
  asides = []
}) {
  if (!diaryObj || typeof diaryObj !== "object") return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];

  const entry = {
    id: `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`,
    date: currentISO(),   // e.g. "0001-01-01T13:00:00Z" from in-game clock
    mood: Array.isArray(mood) ? mood : [],
    tags: Array.isArray(tags) ? tags : [],
    path,
    stage,
    witness,
    text: String(text || ""),
    asides: Array.isArray(asides) ? asides : []
  };

  diaryObj.entries.push(entry);
  return entry;
}

/**
 * Append an entry at a specific in-game day/hour (for backfill or scripted beats).
 */
export function appendDiaryEntryAt(diaryObj, day, hour, payload = {}) {
  if (!diaryObj || typeof diaryObj !== "object") return null;
  if (!Array.isArray(diaryObj.entries)) diaryObj.entries = [];

  const entry = {
    id: `${diaryObj.characterId || "char"}-${Math.random().toString(36).slice(2, 8)}`,
    date: isoFor(day, hour),
    mood: Array.isArray(payload.mood) ? payload.mood : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    path: payload.path ?? null,
    stage: payload.stage ?? null,
    witness: payload.witness ?? null,
    text: String(payload.text || ""),
    asides: Array.isArray(payload.asides) ? payload.asides : []
  };

  diaryObj.entries.push(entry);
  return entry;
}

/**
 * Query entries (simple helper for future use).
 * options: { fromDay?, toDay?, tag?, mood?, limit? }
 */
export function getEntries(diaryObj, opts = {}) {
  const src = Array.isArray(diaryObj?.entries) ? diaryObj.entries : [];
  let out = src.slice();

  if (opts.fromDay) out = out.filter(e => (e.date || "").slice(0, 10) >= opts.fromDay);
  if (opts.toDay)   out = out.filter(e => (e.date || "").slice(0, 10) <= opts.toDay);
  if (opts.tag)     out = out.filter(e => Array.isArray(e.tags) && e.tags.includes(opts.tag));
  if (opts.mood)    out = out.filter(e => Array.isArray(e.mood) && e.mood.includes(opts.mood));

  // newest first by ISO string
  out.sort((a, b) => (a.date < b.date ? 1 : -1));

  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
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
  try {
    return JSON.parse(localStorage.getItem(PS_KEY) || "{}");
  } catch {
    return {};
  }
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
