// js/systems/diary.js
// Pair-aware diary loader + selectors + dev helpers

/* ===========================
   Small fetch helper
   =========================== */
async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status, err: `HTTP ${r.status}` };
    const data = await r.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, err: String(err) };
  }
}

/* ===========================
   Pair state (path/stage) — dev storage
   =========================== */
const _pairState = new Map(); // key => { path, stage }

export function getPairState(characterId, targetId) {
  const key = `${characterId}:${targetId}`;
  let ps = _pairState.get(key);
  if (!ps) {
    ps = { path: "love", stage: 0 };
    _pairState.set(key, ps);
  }
  return ps;
}

export function setPairState(characterId, targetId, next) {
  const key = `${characterId}:${targetId}`;
  const cur = getPairState(characterId, targetId);
  _pairState.set(key, { ...cur, ...(next || {}) });
}

/* ===========================
   Normalizers
   =========================== */

// Witnessed (caught_others)
// Accepts either:
//   { who: [ {stageMin, path, text}, ... ], who2: [...] }
// Or:      { who: { love:[...], corruption:[...], any:[...] } } // already shaped
function normalizeWitnessed(raw) {
  const byWho = {};
  if (!raw || typeof raw !== "object") return { byWho, flat: {} };

  for (const who of Object.keys(raw)) {
    const source = raw[who];

    // Already shaped per-path arrays?
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const obj = {
        love: Array.isArray(source.love) ? source.love.slice() : [],
        corruption: Array.isArray(source.corruption) ? source.corruption.slice() : [],
        hybrid: Array.isArray(source.hybrid) ? source.hybrid.slice() : [],
        any: Array.isArray(source.any) ? source.any.slice() : []
      };
      // sort each bucket if it has objects with stageMin
      for (const k of Object.keys(obj)) {
        const b = obj[k];
        if (b.length && typeof b[0] === "object" && b[0]) {
          b.sort((a, b) => (a.stageMin || 0) - (b.stageMin || 0));
        }
      }
      byWho[who] = obj;
      continue;
    }

    // Otherwise assume array of { stageMin, path, text }
    const arr = Array.isArray(source) ? source : [];
    const obj = { love: [], corruption: [], hybrid: [], any: [] };
    for (const it of arr) {
      if (!it) continue;
      const p = String(it.path || "any").toLowerCase();
      const bucket = obj[p] || obj.any; // unknown path -> "any"
      bucket.push({
        stageMin: Number(it.stageMin ?? 0),
        text: String(it.text ?? "")
      });
    }
    // Sort each bucket by stageMin ASC
    for (const k of Object.keys(obj)) {
      obj[k].sort((a, b) => (a.stageMin || 0) - (b.stageMin || 0));
    }
    byWho[who] = obj;
  }

  // Flat view for easy console checks
  const flat = {};
  for (const who of Object.keys(byWho)) {
    const m = byWho[who];
    flat[who] = m;
    for (const p of ["love", "corruption", "hybrid", "any"]) {
      flat[`${who}_${p}`] = (m[p] || []).slice();
    }
  }

  return { byWho, flat };
}

// Events (first_kiss, etc)
//
// Your event file for first_kiss looks like:
//   { "love":[...], "corruption":[...], "hybrid":[...] }
//
// So we normalize it straight into that *one* object.
function normalizeEventMapForSingleKey(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of Object.keys(raw)) {
    out[p.toLowerCase()] = Array.isArray(raw[p]) ? raw[p].slice() : [];
  }
  return out;
}

// Desires — keep exactly as authored (nested by target)
// { vagrant: { love:[...], corruption:[...], hybrid:[...] } }
function normalizeDesires(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const tgt of Object.keys(raw)) {
    const src = raw[tgt] || {};
    const tgtObj = {};
    for (const p of Object.keys(src)) {
      tgtObj[p.toLowerCase()] = Array.isArray(src[p]) ? src[p].slice() : [];
    }
    out[tgt.toLowerCase()] = tgtObj;
  }
  return out;
}

/* ===========================
   Loader
   =========================== */

export async function loadDiary(indexUrl) {
  const r = await fetchJson(indexUrl);
  if (!r.ok) return null;

  const idx = r.data || {};
  const diary = {
    version: String(idx.version || "1.0"),
    characterId: String(idx.characterId || ""),
    targetId: String(idx.targetId || ""),
    key: `${idx.characterId || ""}:${idx.targetId || ""}`,
    entries: Array.isArray(idx.entries) ? idx.entries.slice() : []
  };

  // sources may include: desires, witnessed, events (map)
  const srcs = idx.sources || {};

  // desires
  if (srcs.desires) {
    const dr = await fetchJson(srcs.desires);
    diary.desires = dr.ok ? normalizeDesires(dr.data) : {};
  } else {
    diary.desires = {};
  }

  // witnessed (caught_others)
  if (srcs.witnessed) {
    const wr = await fetchJson(srcs.witnessed);
    const { byWho, flat } = wr.ok ? normalizeWitnessed(wr.data) : { byWho: {}, flat: {} };
    diary.witnessed = byWho;
    diary.witnessed_flat = flat; // for console/debug
  } else {
    diary.witnessed = {};
    diary.witnessed_flat = {};
  }

  // events (a map of keys -> url)
  diary.events = {};
  if (srcs.events && typeof srcs.events === "object") {
    for (const evKey of Object.keys(srcs.events)) {
      const url = srcs.events[evKey];
      const er = await fetchJson(url);
      diary.events[evKey] = er.ok ? normalizeEventMapForSingleKey(er.data) : {};
    }
  }

  // Convenience: current-target desires by path
  diary.desires_byPath = (diary.desires[diary.targetId?.toLowerCase() || ""] || {});

  return diary;
}

/* ===========================
   Selectors
   =========================== */

// DESIRES
export function selectDesireEntries(diary, targetId, path) {
  if (!diary) return [];
  const t = String(targetId || diary.targetId || "").toLowerCase();
  const p = String(path || "love").toLowerCase();
  const nested = diary?.desires?.[t]?.[p];
  return Array.isArray(nested) ? nested : [];
}

export function selectDesireLine(diary, path, stage, targetId) {
  const lines = selectDesireEntries(diary, targetId, path);
  if (!lines.length) return null;
  const idx = Math.max(0, Math.min(lines.length - 1, Number(stage) || 0));
  return lines[idx] || null;
}

// EVENTS
export function selectEventLine(diary, eventKey, path, stage) {
  if (!diary || !eventKey) return null;
  const p = String(path || "love").toLowerCase();
  const ev = diary.events?.[eventKey] || {};
  const byPath = ev[p] || ev.any || [];
  if (!Array.isArray(byPath) || !byPath.length) return null;
  const idx = Math.max(0, Math.min(byPath.length - 1, Number(stage) || 0));
  return byPath[idx] || null;
}

// WITNESSED
export function selectWitnessedLine(diary, who, path, stage) {
  if (!diary || !who) return null;
  const w = diary.witnessed?.[who] || null;
  if (!w) return null;

  const p = String(path || "love").toLowerCase();
  const stageNum = Number(stage) || 0;

  // Two cases:
  // 1) Buckets are arrays of {stageMin,text}
  // 2) Buckets are arrays of strings (we'll index by stage)
  const bucket = w[p] && Array.isArray(w[p]) ? w[p] : [];
  const isObj = bucket.length && typeof bucket[0] === "object" && bucket[0] !== null;

  if (isObj) {
    // Pick the highest stageMin <= stage; else try "any"; else null
    let pick = null;
    for (const it of bucket) {
      const smin = Number(it.stageMin || 0);
      if (smin <= stageNum) pick = it.text || "";
      else break; // because we sorted ASC
    }
    if (!pick) {
      const anyB = Array.isArray(w.any) ? w.any : [];
      for (const it of anyB) {
        const smin = Number(it.stageMin || 0);
        if (smin <= stageNum) pick = it.text || "";
        else break;
      }
    }
    return pick || null;
  } else {
    const arr = bucket.length ? bucket : (Array.isArray(w.any) ? w.any : []);
    if (!arr.length) return null;
    const idx = Math.max(0, Math.min(arr.length - 1, stageNum));
    return arr[idx] || null;
  }
}

/* ===========================
   Mutators / Logging
   =========================== */

export function appendDiaryEntry(diary, entry) {
  if (!diary) return;
  diary.entries = diary.entries || [];
  diary.entries.push({
    at: Date.now(),
    text: String(entry?.text || ""),
    path: String(entry?.path || "love"),
    stage: Number(entry?.stage ?? 0),
    tags: Array.isArray(entry?.tags) ? entry.tags.slice() : [],
    mood: Array.isArray(entry?.mood) ? entry.mood.slice() : []
  });
}

export function logWitnessed(diary, who, info = {}) {
  if (!diary) return;
  const ps = getPairState(diary.characterId, diary.targetId);
  const path = String(info.path || ps.path || "love").toLowerCase();
  const stage = Number(info.stage ?? ps.stage ?? 0);
  const line =
    selectWitnessedLine(diary, who, path, stage) ||
    selectWitnessedLine(diary, who, "any", stage) ||
    null;

  appendDiaryEntry(diary, {
    text: line || `[dev] no lane/line for (${who}, path: '${path}', stage: ${stage})`,
    path,
    stage,
    tags: ["#witnessed", `#with:${who}`]
  });
}
