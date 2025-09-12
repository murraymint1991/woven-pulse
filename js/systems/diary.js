// js/systems/diary.js
// -------------------------------------------------------
// Loader + utilities for the pair diary system.
// Works with split diaries via index.json -> sources:
//  - desires: path to per-path desire strings
//  - witnessed: path to caught_others.json
//  - events: { key or "nested/keys": path } (e.g., "first_kiss", "locations/cave")
// Produces a diary object with:
//  { characterId, targetId, entries, desires, events, witnessed[targetId], ... }
// -------------------------------------------------------

/* ================================
   Small helpers
================================ */
const deepSet = (obj, path, value) => {
  const parts = String(path).split(/[/.]/).filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = cur[k] || {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
};

const assetUrl = (rel) => {
  if (/^https?:\/\//i.test(rel)) return rel;
  const { origin, pathname } = location;
  const base = pathname.endsWith("/") ? pathname : pathname.replace(/[^/]+$/, "");
  return origin + base + String(rel).replace(/^\//, "");
};

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return { ok: res.ok, data, url };
  } catch (e) {
    console.warn("[diary] fetchJson error", url, e);
    return { ok: false, data: null, url };
  }
}

/* ================================
   Witness normalization
================================ */
function normalizeCaughtOthers(itemsByWho = {}) {
  const out = {};
  for (const [who, arr] of Object.entries(itemsByWho || {})) {
    const lanes = {};
    for (const it of Array.isArray(arr) ? arr : []) {
      const p = (it.path || "any").toLowerCase();
      const laneKey = p === "any" ? "any" : p;
      if (!lanes[laneKey]) lanes[laneKey] = [];
      lanes[laneKey].push({
        stageMin: Number(it.stageMin ?? 0),
        text: String(it.text || "").trim()
      });
    }
    for (const k of Object.keys(lanes)) {
      lanes[k].sort((a, b) => a.stageMin - b.stageMin);
    }
    out[who] = lanes;
  }
  return out;
}

/* ================================
   Public: loadDiary(indexUrl)
================================ */
export async function loadDiary(indexUrl) {
  const ires = await fetchJson(indexUrl);
  if (!ires.ok || !ires.data) {
    console.warn("[diary] failed to load index", indexUrl);
    return null;
  }

  const idx = ires.data || {};
  const characterId = idx.characterId || "unknown";
  const targetId = idx.targetId || "unknown";

  const diary = {
    key: `${characterId}:${targetId}`,
    version: idx.version || "1.0",
    characterId,
    targetId,
    entries: Array.isArray(idx.entries) ? idx.entries.slice() : [],
    desires: {},
    events: {},
    witnessed: {},         // witnessed[targetId] = normalized map
    witnessed_targets: [], // for debugging/inspection
  };

  const sources = idx.sources || {};

  if (sources.desires) {
    const r = await fetchJson(assetUrl(sources.desires));
    diary.desires = r.ok ? (r.data?.desires || r.data || {}) : {};
  }

  if (sources.witnessed) {
    const r = await fetchJson(assetUrl(sources.witnessed));
    const flat = r.ok ? normalizeCaughtOthers(r.data?.caught_others || r.data || {}) : {};
    diary.witnessed[targetId] = flat;
    diary.witnessed_targets = [targetId];
    diary.__witness_flat = flat;
  }

  if (sources.events && typeof sources.events === "object") {
    for (const [k, p] of Object.entries(sources.events)) {
      const r = await fetchJson(assetUrl(p));
      if (r.ok) deepSet(diary.events, k, r.data || {});
    }
  }

  if (typeof window !== "undefined") {
    window.__diaryByPair = window.__diaryByPair || {};
    window.__diaryByPair[diary.key] = diary;
  }
  return diary;
}

/* ================================
   Entries
================================ */
export function appendDiaryEntry(diary, entry) {
  if (!diary || !Array.isArray(diary.entries)) return;
  const safe = {
    text: String(entry?.text || "").trim(),
    path: entry?.path || "love",
    stage: Number(entry?.stage ?? 0),
    tags: Array.isArray(entry?.tags) ? entry.tags.slice() : [],
    mood: Array.isArray(entry?.mood) ? entry.mood.slice() : []
  };
  diary.entries.push(safe);
}

/* ================================
   Pair state
================================ */
const __pairState = {};
const pairKey = (a, b) => `${a}:${b}`;

export function getPairState(characterId, targetId) {
  const k = pairKey(characterId, targetId);
  if (!__pairState[k]) {
    __pairState[k] = { path: "love", stage: 0 };
  }
  return __pairState[k];
}

/* ================================
   Witnessed logging + selection
================================ */
function pickWitnessLine(flatMap, who, path, stage) {
  const lanes = flatMap?.[who] || {};
  const lane = lanes[path] || lanes.any || [];
  if (!lane.length) return null;

  let best = null;
  for (const it of lane) {
    if (Number(it.stageMin) <= Number(stage)) best = it;
    else break;
  }
  return best?.text || lane[0]?.text || null;
}

export function logWitnessed(diary, who, info = {}) {
  if (!diary) return;
  const ps = getPairState(diary.characterId, diary.targetId);
  const path  = String(info.path || ps.path || "love").toLowerCase();
  const stage = Number(info.stage ?? ps.stage ?? 0);

  const targetFlat = diary.witnessed?.[diary.targetId] || diary.__witness_flat || {};
  const line = info.text || pickWitnessLine(targetFlat, who, path, stage) || null;

  if (!line) {
    console.warn("[diary] [caught] no lane/line for", { who, path, stage });
    return;
  }

  appendDiaryEntry(diary, {
    text: line,
    path,
    stage,
    tags: ["#witnessed", `#with:${who}`],
  });
}

export function selectWitnessedLine(diary, who, path = "love", stage = 0) {
  const flat = diary?.witnessed?.[diary?.targetId] || diary?.__witness_flat || {};
  return pickWitnessLine(flat, who, path, stage);
}

/* ================================
   Desire selection
================================ */
export function selectDesireEntries(diary, path = "love") {
  const p = String(path || "love").toLowerCase();
  const byPath = diary?.desires?.[p] || diary?.desires?.any || [];
  return Array.isArray(byPath) ? byPath : [];
}

/* ================================
   Event line selection
================================ */
export function selectEventLine(diary, eventKey, path = "love", stage = 0) {
  const p = String(path || "love").toLowerCase();

  const parts = String(eventKey).split(/[/.]/).filter(Boolean);
  let cur = diary?.events || {};
  for (const k of parts) {
    cur = cur?.[k];
    if (!cur) break;
  }

  const lane = Array.isArray(cur?.[p]) ? cur[p] : (Array.isArray(cur) ? cur : []);
  if (!lane || !lane.length) return null;

  return lane[lane.length - 1] || null;
}
