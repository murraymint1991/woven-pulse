// js/systems/diary.js
// Pair-aware diary utilities + loader (index.json or monolithic file)

import { fetchJson } from "../utils.js";

/* ============================================================
   Pair state (path + stage) — stored in localStorage
   ============================================================ */
const LSK = (cid, tid) => `pair_${cid}:${tid}_v1`;

export function getPairState(characterId, targetId) {
  try {
    const raw = localStorage.getItem(LSK(characterId, targetId));
    if (raw) {
      const v = JSON.parse(raw);
      return {
        path: typeof v.path === "string" ? v.path : "love",
        stage: Number.isFinite(v.stage) ? v.stage : 0,
      };
    }
  } catch (_) {}
  return { path: "love", stage: 0 };
}

export function setPairState(characterId, targetId, patch = {}) {
  const cur = getPairState(characterId, targetId);
  const next = {
    path: (patch.path ?? cur.path ?? "love").toLowerCase(),
    stage: Math.max(0, Number(patch.stage ?? cur.stage ?? 0)),
  };
  try {
    localStorage.setItem(LSK(characterId, targetId), JSON.stringify(next));
  } catch (_) {}
  return next;
}

/* ============================================================
   Diary entry helpers
   ============================================================ */
export function appendDiaryEntry(diary, entry) {
  if (!diary) return;
  diary.entries = Array.isArray(diary.entries) ? diary.entries : [];
  diary.entries.push({
    at: Date.now(),
    text: String(entry.text || ""),
    path: (entry.path || "love").toLowerCase(),
    stage: Number(entry.stage ?? 0),
    tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 6) : [],
    mood: Array.isArray(entry.mood) ? entry.mood.slice(0, 6) : [],
  });
}

/* ============================================================
   Loader — supports index.json with sources OR monolithic JSON
   ============================================================ */
export async function loadDiary(urlOrObj) {
  // Already an object?
  if (urlOrObj && typeof urlOrObj === "object" && !Array.isArray(urlOrObj)) {
    return normalizeDiary(urlOrObj);
  }

  const probe = await fetchJson(urlOrObj, { noCache: true });
  if (!probe.ok) return null;

  const base = probe.data || {};
  // If no sources, treat as monolithic diary file
  if (!base.sources) return normalizeDiary(base);

  // Split sources (index.json style)
  const out = {
    version: base.version || "1.0",
    characterId: base.characterId || "aerith",
    targetId: base.targetId || "vagrant",
    entries: Array.isArray(base.entries) ? base.entries : [],
  };

  // desires
  if (base.sources.desires) {
    const r = await fetchJson(base.sources.desires);
    out.desires = (r.ok ? (r.data?.desires || r.data) : {}) || {};
  }

  // witnessed (caught_others)
  if (base.sources.witnessed) {
    const r = await fetchJson(base.sources.witnessed);
    const raw = r.ok ? (r.data?.caught_others || r.data) : {};
    out.witnessed = normalizeCaughtOthers(raw);
  }

  // events map (e.g. first_kiss)
  if (base.sources.events && typeof base.sources.events === "object") {
    out.events = {};
    const entries = Object.entries(base.sources.events);
    for (const [key, relPath] of entries) {
      const r = await fetchJson(relPath);
      if (r.ok) out.events[key] = r.data?.[key] || r.data || {};
    }
  }

  return normalizeDiary(out);
}

/* ============================================================
   Selectors (used by views)
   ============================================================ */
export function selectDesireEntries(diary, path = "love") {
  const p = String(path || "love").toLowerCase();
  const byPath =
    diary?.desires?.[p] ||
    diary?.desires?.any ||
    [];
  return Array.isArray(byPath) ? byPath : [];
}

/**
 * selectEventLine(diary, "first_kiss", path, stage)
 * Looks in diary.events[first_kiss][path] first, then .any (strings
 * or objects with optional stageMin). Picks the best line whose
 * stageMin <= stage; otherwise falls back to last item.
 */
export function selectEventLine(diary, eventKey, path = "love", stage = 0) {
  const store = diary?.events?.[eventKey] || {};
  const rows =
    store?.[String(path).toLowerCase()] ||
    store?.any ||
    [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // allow rows to be strings or { text, stageMin }
  let best = null;
  let bestStage = -1;
  for (const item of rows) {
    const t =
      typeof item === "string" ? item
        : (item && typeof item.text === "string") ? item.text
        : null;
    if (!t) continue;
    const sMin = Number(
      typeof item === "object" && item ? (item.stageMin ?? 0) : 0
    );
    if (stage >= sMin && sMin >= bestStage) {
      best = t;
      bestStage = sMin;
    }
  }
  return best || (typeof rows[rows.length - 1] === "string"
    ? rows[rows.length - 1]
    : rows[rows.length - 1]?.text || null);
}

/**
 * logWitnessed(diary, who, { path, stage, text? })
 * Adds a witnessed line to entries, selecting text from the witnessed
 * catalog if none is provided.
 */
export function logWitnessed(diary, who, info = {}) {
  if (!diary) return;
  const ps = {
    path: String(info.path || "love").toLowerCase(),
    stage: Number(info.stage ?? 0),
  };
  const t = info.text || selectWitnessedLine(diary, who, ps.path, ps.stage);
  appendDiaryEntry(diary, {
    text: t || `[dev] no lane/line for (${who}, path: '${ps.path}', stage: ${ps.stage})`,
    path: ps.path,
    stage: ps.stage,
    tags: ["#witnessed", `#${who}`],
  });
}

/**
 * Select a witnessed line based on who + path (+ "any") with stageMin.
 * Normalized shape (witnessed_flat):
 *   diary.witnessed_flat[who][path] = [ { text, stageMin } ... ]
 *   diary.witnessed_flat[who].any   = [ ... ]
 */
function selectWitnessedLine(diary, who, path = "love", stage = 0) {
  const w = diary?.witnessed_flat || {};
  const byWho = w[String(who).toLowerCase()] || {};
  const rows =
    byWho[String(path).toLowerCase()] ||
    byWho.any ||
    [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let best = null;
  let bestStage = -1;
  for (const r of rows) {
    const t = typeof r === "string" ? r : r?.text || null;
    const sMin = Number((r && r.stageMin) ?? 0);
    if (!t) continue;
    if (stage >= sMin && sMin >= bestStage) {
      best = t;
      bestStage = sMin;
    }
  }
  return best || (rows[rows.length - 1]?.text || rows[rows.length - 1] || null);
}

/* ============================================================
   Normalizers
   ============================================================ */
function normalizeDiary(d) {
  const diary = { ...d };

  // Normalize witnessed into witnessed_flat
  if (!diary.witnessed_flat) {
    const src = diary.witnessed || diary.caught_others || {};
    diary.witnessed_flat = flattenWitnessed(src);
  }

  // Expose for console debugging (optional)
  if (typeof window !== "undefined") {
    window.__diaryByPair = window.__diaryByPair || {};
    const key = `${diary.characterId || "?"}:${diary.targetId || "?"}`;
    window.__diaryByPair[key] = diary;
  }
  return diary;
}

function normalizeCaughtOthers(caught) {
  // Input: { tifa: [ {stageMin, path, text}, ... ], renna: [...], yuffie: [...] }
  return flattenWitnessed(caught);
}

function flattenWitnessed(raw) {
  const flat = {};
  const src = raw || {};
  for (const [whoKey, arr] of Object.entries(src)) {
    const who = String(whoKey).toLowerCase();
    flat[who] = flat[who] || {};
    const rows = Array.isArray(arr) ? arr : [];
    for (const item of rows) {
      const text = typeof item === "string" ? item : (item?.text || "");
      if (!text) continue;
      const p = String(item?.path || "any").toLowerCase();
      const sMin = Number(item?.stageMin ?? 0);
      flat[who][p] = flat[who][p] || [];
      flat[who][p].push({ text, stageMin: sMin });
    }
    // sort each bucket by stageMin ascending
    for (const p of Object.keys(flat[who])) {
      flat[who][p].sort((a, b) => (a.stageMin - b.stageMin));
    }
  }
  return flat;
}
