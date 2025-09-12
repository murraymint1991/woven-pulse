// js/systems/diary.js
// Robust, pair-aware diary loader + helpers.
// Works with split sources (index → desires / witnessed / events) or single JSONs.

//
// ============== tiny utils ==============
//
const toStr = (v) => (v == null ? "" : String(v));
const clampNum = (n, d = 0) => {
  const k = Number(n);
  return Number.isFinite(k) ? k : d;
};
const lower = (s) => toStr(s).trim().toLowerCase();

//
// ============== pair state (in-memory) ==============
//
const __pairState = {};
const pairKey = (a, b) => `${a}:${b}`;

/** Get (or create) the path+stage state for a pair. */
export function getPairState(characterId, targetId) {
  const k = pairKey(characterId, targetId);
  if (!__pairState[k]) {
    __pairState[k] = { path: "love", stage: 0 };
  }
  return __pairState[k];
}

/** Set path and/or stage for a pair (used by dev/testing). */
export function setPairState(characterId, targetId, next = {}) {
  const st = getPairState(characterId, targetId);
  if (next && typeof next === "object") {
    if (typeof next.path === "string") st.path = lower(next.path);
    if (next.stage != null) st.stage = clampNum(next.stage, st.stage);
  }
  return st;
}

//
// ============== normalizers ==============
// these normalize the flexible shapes we’ve been using
//
function normDesires(raw) {
  // Accepts:
  // { desires: { love: [...], corruption: [...], hybrid: [...], any:[...] } }
  // or directly { love:[...], ... }
  const d = raw?.desires || raw || {};
  const out = {};
  for (const k of Object.keys(d)) {
    out[lower(k)] = Array.isArray(d[k]) ? d[k].slice() : [];
  }
  return out;
}

function normWitnessed(raw) {
  // Accepts a 'caught_others' or 'witnessed' catalog:
  // { tifa:[{stageMin, path, text}, ...], renna:[...], yuffie:[...] }
  // Re-group as: { who: { pathKey: [ {stageMin, text}, ... ] } }
  const src = raw?.witnessed || raw?.caught_others || raw || {};
  const out = {};
  for (const who of Object.keys(src)) {
    const rows = Array.isArray(src[who]) ? src[who] : [];
    const byPath = {};
    for (const r of rows) {
      const pathKey = lower(r?.path || "any");
      if (!byPath[pathKey]) byPath[pathKey] = [];
      byPath[pathKey].push({
        stageMin: clampNum(r?.stageMin, 0),
        text: toStr(r?.text || "")
      });
    }
    // sort by stageMin for threshold selection
    for (const p of Object.keys(byPath)) {
      byPath[p].sort((a, b) => a.stageMin - b.stageMin);
    }
    out[lower(who)] = byPath;
  }
  return out;
}

function normEvents(raw) {
  // Accepts:
  // { events: { first_kiss: { love:[...], any:[...] } } }
  // or directly { first_kiss: {...} }
  const src = raw?.events || raw || {};
  const out = {};
  for (const ev of Object.keys(src)) {
    const paths = src[ev] || {};
    const evMap = {};
    for (const p of Object.keys(paths)) {
      const arr = Array.isArray(paths[p]) ? paths[p] : [];
      // lines can be strings or {stageMin,text}
      const rows = arr.map((x) =>
        typeof x === "string"
          ? { stageMin: 0, text: x }
          : { stageMin: clampNum(x?.stageMin, 0), text: toStr(x?.text || "") }
      );
      rows.sort((a, b) => a.stageMin - b.stageMin);
      evMap[lower(p)] = rows;
    }
    out[ev] = evMap;
  }
  return out;
}

//
// ============== line selectors ==============
//

/** Return desire entries for a given path (falls back to "any"). */
export function selectDesireEntries(diary, path = "love") {
  const p = lower(path || "love");
  const d = diary?.desires || {};
  return Array.isArray(d[p]) && d[p].length ? d[p] : (d.any || []);
}

/** Pick a witnessed line for (who, path, stage) using stageMin threshold, fallback to 'any'. */
export function selectWitnessedLine(diary, who, path = "love", stage = 0) {
  const w = diary?.witnessed || {};
  const byWho = w[lower(who)] || {};
  const rows = (byWho[lower(path)] || byWho.any || []);
  if (!rows.length) return null;

  const s = clampNum(stage, 0);
  let pick = rows[0];
  for (const r of rows) {
    if (r.stageMin <= s) pick = r;
    else break;
  }
  return pick?.text || null;
}

/** Pick a single event line (e.g. first_kiss) for a path/stage; fallback to 'any'. */
export function selectEventLine(diary, eventKey, path = "love", stage = 0) {
  const ev = diary?.events?.[eventKey] || {};
  const rows = (ev[lower(path)] || ev.any || []);
  if (!rows.length) return null;

  const s = clampNum(stage, 0);
  let pick = rows[0];
  for (const r of rows) {
    if (r.stageMin <= s) pick = r;
    else break;
  }
  return pick?.text || null;
}

//
// ============== mutate diary entries ==============
//

/** Append a timeline entry to the diary (mutates the passed diary object). */
export function appendDiaryEntry(diary, entry) {
  if (!diary) return;
  diary.entries = Array.isArray(diary.entries) ? diary.entries : [];
  diary.entries.push({
    at: Date.now(),
    text: toStr(entry?.text || ""),
    path: lower(entry?.path || "love"),
    stage: clampNum(entry?.stage, 0),
    tags: Array.isArray(entry?.tags) ? entry.tags.slice() : [],
    mood: Array.isArray(entry?.mood) ? entry.mood.slice() : []
  });
}

/** Record a witnessed moment into the diary’s timeline using the catalog if available. */
export function logWitnessed(diary, who, info = {}) {
  if (!diary) return;
  const ps = getPairState(diary.characterId, diary.targetId);
  const path = lower(info.path || ps.path || "love");
  const stage = clampNum(info.stage ?? ps.stage ?? 0, 0);
  const line =
    info.text ||
    selectWitnessedLine(diary, who, path, stage) ||
    `[dev] witnessed (${who} · ${path} · stage ${stage})`;

  appendDiaryEntry(diary, {
    text: line,
    path,
    stage,
    tags: ["#witnessed", `#with:${who}`]
  });
}

//
// ============== loader ==============
//
async function fetchJsonNoThrow(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { ok: false, data: null };
    const data = await r.json();
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

/**
 * Load a diary from an index JSON (or a direct single JSON). The index can look like:
 *
 * {
 *   "version": "1.0",
 *   "characterId": "aerith",
 *   "targetId": "vagrant",
 *   "sources": {
 *     "desires":   "data/diaries/aerith_vagrant/desires.json",
 *     "witnessed": "data/diaries/aerith_vagrant/caught_others.json",
 *     "events":    { "first_kiss": "data/diaries/aerith_vagrant/first_kiss.json" }
 *   },
 *   "entries": []
 * }
 *
 * or a single combined file with { desires, witnessed/caught_others, events, entries }.
 */
export async function loadDiary(url) {
  const res = await fetchJsonNoThrow(url);
  if (!res.ok) return null;

  const base = res.data || {};
  const diary = {
    version: toStr(base.version || "1.0"),
    characterId: toStr(base.characterId || base.character || "aerith"),
    targetId: toStr(base.targetId || base.target || "vagrant"),
    desires: {},
    witnessed: {},
    events: {},
    entries: Array.isArray(base.entries) ? base.entries.slice() : []
  };

  const src = base.sources || {};

  // ---- desires
  if (src.desires) {
    const r = await fetchJsonNoThrow(src.desires);
    diary.desires = r.ok ? normDesires(r.data) : {};
  } else {
    diary.desires = normDesires(base.desires || {});
  }

  // ---- witnessed / caught_others
  if (src.witnessed) {
    const r = await fetchJsonNoThrow(src.witnessed);
    diary.witnessed = r.ok ? normWitnessed(r.data) : {};
  } else {
    diary.witnessed = normWitnessed(base.witnessed || base.caught_others || {});
  }

  // ---- events (map of event → url, or inline)
  if (src.events && typeof src.events === "object" && !Array.isArray(src.events)) {
    const evOut = {};
    for (const key of Object.keys(src.events)) {
      const evUrl = src.events[key];
      const r = await fetchJsonNoThrow(evUrl);
      if (r.ok) {
        // r.data may be either { key: {...} } or just the payload for that key
        const normed = normEvents(r.data?.[key] ? r.data : { [key]: r.data });
        evOut[key] = normed[key] || {};
      } else {
        evOut[key] = {};
      }
    }
    diary.events = evOut;
  } else {
    diary.events = normEvents(base.events || {});
  }

  return diary;
}
