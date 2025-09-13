// js/systems/diary.js — FULL REPLACEMENT
// Robust loader + normalizers + selection helpers for split diary sources.

//// utils ////
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function assetUrl(relPath) {
  const rel = String(relPath || "");
  if (/^https?:\/\//i.test(rel)) return rel;
  const { origin, pathname } = location;
  const baseDir = pathname.endsWith("/") ? pathname : pathname.replace(/[^/]+$/, "");
  return origin + baseDir + rel.replace(/^\//, "");
}

async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status, url };
    return { ok: true, data: await r.json(), url };
  } catch (e) {
    return { ok: false, error: String(e), url };
  }
}

//// pair state (in-memory; could be persisted later) ////
const __PAIR_STATE = new Map(); // key -> { path, stage }
const pairKey = (actor, target) => `${actor}:${target}`;

export function getPairState(actor, target) {
  const k = pairKey(actor, target);
  return __PAIR_STATE.get(k) || { path: "love", stage: 0 };
}

export function setPairState(actor, target, patch) {
  const k = pairKey(actor, target);
  const cur = getPairState(actor, target);
  const next = {
    path: (patch.path ?? cur.path ?? "love").toLowerCase(),
    stage: clamp(Number(patch.stage ?? cur.stage ?? 0), 0, 999),
  };
  __PAIR_STATE.set(k, next);
  return next;
}

//// normalization ////
function normalizeWitnessed(d) {
  // Expect source shape (split file):
  // d.witnessed = { tifa: [ {stageMin, path, text}, ... ], renna: [...], yuffie: [...] }
  const out = {};
  const src = d.witnessed || d.caught_others || {};
  Object.keys(src || {}).forEach((who) => {
    const lanes = {};
    asArray(src[who]).forEach((it) => {
      const path = String(it.path || "any").toLowerCase();
      (lanes[path] = lanes[path] || []).push({
        stageMin: Number(it.stageMin ?? 0),
        text: String(it.text || "").trim(),
      });
    });
    // sort each lane by stageMin asc for consistent picking
    Object.keys(lanes).forEach((p) => lanes[p].sort((a, b) => (a.stageMin || 0) - (b.stageMin || 0)));
    out[who] = lanes;
  });
  d.witnessed_flat = out;
}

function normalizeDesires(d) {
  // Expect source shape:
  // d.desires = { love: [ {stageMin, text}, ...], corruption: [...], hybrid: [...], any: [...] }
  const out = {};
  const src = d.desires || {};
  Object.keys(src || {}).forEach((path) => {
    const p = String(path).toLowerCase();
    out[p] = asArray(src[path]).map((it) => ({
      stageMin: Number(it.stageMin ?? 0),
      text: String(it.text || "").trim(),
    }));
    out[p].sort((a, b) => (a.stageMin || 0) - (b.stageMin || 0));
  });
  d.desires_byPath = out;
}

function ensureEvents(d) {
  // Expected event container:
  // d.events = { first_kiss: { love: [...], corruption: [...], hybrid: [...], any: [...] } }
  d.events = d.events || {};
}

//// selection helpers ////
function pickByStageMin(list, stage) {
  if (!Array.isArray(list) || !list.length) return null;
  const st = Number(stage || 0);
  // highest stageMin <= stage; otherwise last
  let best = null;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if ((it.stageMin ?? 0) <= st) best = it;
  }
  return best || list[list.length - 1];
}

//// public selectors ////
export function selectDesireEntries(diary, path = "love") {
  const p = String(path || "love").toLowerCase();
  const byPath = diary?.desires_byPath?.[p] || diary?.desires_byPath?.any || diary?.desires?.[p] || diary?.desires?.any;
  return Array.isArray(byPath) ? byPath : [];
}

export function selectEventLine(diary, eventKey, path = "love", stage = 0) {
  const p = String(path || "love").toLowerCase();
  const ev = diary?.events?.[eventKey] || {};
  const lane = ev[p] || ev.any || [];
  const pick = pickByStageMin(lane, stage);
  return pick?.text || null;
}

//// logging ////
export function appendDiaryEntry(diary, entry) {
  diary.entries = Array.isArray(diary.entries) ? diary.entries : [];
  diary.entries.push({
    at: Date.now(),
    path: String(entry.path || "love").toLowerCase(),
    stage: Number(entry.stage ?? 0),
    text: String(entry.text || "").trim(),
    tags: asArray(entry.tags),
    mood: asArray(entry.mood),
  });
}

export function logWitnessed(diary, who, info = {}) {
  const ps = getPairState(diary.characterId, diary.targetId);
  const path = String(info.path || ps.path || "love").toLowerCase();
  const stage = Number(info.stage ?? ps.stage ?? 0);

  const lanes = diary?.witnessed_flat?.[who] || {};
  const lane = lanes[path] || lanes.any || [];
  const pick = pickByStageMin(lane, stage);

  appendDiaryEntry(diary, {
    text:
      pick?.text ||
      `[dev] no lane/line for (${who}, path: '${path}', stage: ${stage})`,
    path,
    stage,
    tags: ["#witnessed", `#with:${who}`],
  });
}

//// loader ////
async function loadSplitSources(indexUrl, indexJson) {
  // indexJson.sources may look like:
  // {
  //   "desires": "data/diaries/aerith_vagrant/desires.json",
  //   "witnessed": "data/diaries/aerith_vagrant/caught_others.json",
  //   "events": { "locations/cave": "data/diaries/aerith_vagrant/locations/cave.json", ... }
  // }
  const src = indexJson.sources || {};
  const out = {};

  if (src.desires) {
    const r = await fetchJson(assetUrl(src.desires));
    if (r.ok) out.desires = r.data?.desires || r.data || {};
  }
  if (src.witnessed) {
    const r = await fetchJson(assetUrl(src.witnessed));
    if (r.ok) out.witnessed = r.data?.caught_others || r.data?.witnessed || r.data || {};
  }
  if (isObj(src.events)) {
    out.events = out.events || {};
    const entries = Object.entries(src.events);
    for (const [, url] of entries) {
      const r = await fetchJson(assetUrl(url));
      if (r.ok && isObj(r.data)) {
        // merge by top-level keys (e.g., { first_kiss: { love:[...] } })
        Object.keys(r.data).forEach((ek) => {
          out.events[ek] = out.events[ek] || {};
          const byPath = r.data[ek] || {};
          Object.keys(byPath).forEach((p) => {
            out.events[ek][p] = [].concat(out.events[ek][p] || [], asArray(byPath[p]));
          });
        });
      }
    }
  }

  return out;
}

export async function loadDiary(indexUrl) {
  const r = await fetchJson(indexUrl);
  if (!r.ok) return null;

  // base object
  const d = {
    version: r.data?.version || "1.0",
    characterId: r.data?.characterId || "unknown",
    targetId: r.data?.targetId || "unknown",
    entries: asArray(r.data?.entries),
  };

  // merge split sources if declared
  if (isObj(r.data?.sources)) {
    const merged = await loadSplitSources(indexUrl, r.data);
    if (merged.desires) d.desires = merged.desires;
    if (merged.witnessed) d.witnessed = merged.witnessed;
    if (merged.events) d.events = merged.events;
  } else {
    // (legacy) inline
    if (r.data?.desires) d.desires = r.data.desires;
    if (r.data?.witnessed) d.witnessed = r.data.witnessed;
    if (r.data?.events) d.events = r.data.events;
  }

  // normalize
  normalizeDesires(d);
  normalizeWitnessed(d);
  ensureEvents(d);

  // default pair state if not seen yet
  setPairState(d.characterId, d.targetId, getPairState(d.characterId, d.targetId));

  // dev surface for quick inspection
  if (typeof window !== "undefined") {
    window.__diaryByPair = window.__diaryByPair || {};
    window.__diaryByPair[pairKey(d.characterId, d.targetId)] = d;
  }

  return d;
}
