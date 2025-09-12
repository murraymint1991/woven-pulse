// js/systems/mind.js
// Simple dev-side "Mind" overrides with localStorage + live mirror of window.__statusMap

const LS_KEY = "mind_overrides_v1";

// read/write helpers
function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveOverrides(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
}
function deepClone(x) {
  return x ? JSON.parse(JSON.stringify(x)) : x;
}
function clamp01(n) {
  n = Number(n) || 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// keep an in-memory snapshot of baseline (what the JSON file had on first access)
const baseline = (typeof window !== "undefined" && (window.__mindBaseline = window.__mindBaseline || {})) || {};

/**
 * Returns the effective mind state for a character:
 * base (from window.__statusMap[charId].mind or provided fallback) + local overrides
 */
export function getMindState(charId, fallbackBase = {}) {
  const base =
    (typeof window !== "undefined" &&
      window.__statusMap &&
      window.__statusMap[charId] &&
      window.__statusMap[charId].mind) ||
    fallbackBase ||
    {};

  // store baseline once so we can reset later
  if (!baseline[charId]) baseline[charId] = deepClone(base);

  const ovr = loadOverrides()[charId] || {};
  const out = deepClone(base);

  if (ovr.moods) {
    out.moods = out.moods || {};
    for (const [k, v] of Object.entries(ovr.moods)) out.moods[k] = clamp01(v);
  }
  if (ovr.traits) {
    out.traits = out.traits || {};
    for (const [k, v] of Object.entries(ovr.traits)) out.traits[k] = clamp01(v);
  }
  return out;
}

/** apply a delta to a mood and reflect it in overrides + window.__statusMap (live) */
export function applyMoodDelta(charId, key, delta) {
  const cur = getMindState(charId);
  const next = clamp01((cur.moods?.[key] ?? 0) + (Number(delta) || 0));

  // write overrides
  const all = loadOverrides();
  all[charId] = all[charId] || {};
  all[charId].moods = all[charId].moods || {};
  all[charId].moods[key] = next;
  saveOverrides(all);

  // live mirror so UI can read updated values
  if (typeof window !== "undefined" && window.__statusMap?.[charId]?.mind) {
    window.__statusMap[charId].mind.moods = window.__statusMap[charId].mind.moods || {};
    window.__statusMap[charId].mind.moods[key] = next;
  }
}

/** apply a delta to a trait and reflect it in overrides + window.__statusMap (live) */
export function applyTraitDelta(charId, key, delta) {
  const cur = getMindState(charId);
  const next = clamp01((cur.traits?.[key] ?? 0) + (Number(delta) || 0));

  const all = loadOverrides();
  all[charId] = all[charId] || {};
  all[charId].traits = all[charId].traits || {};
  all[charId].traits[key] = next;
  saveOverrides(all);

  if (typeof window !== "undefined" && window.__statusMap?.[charId]?.mind) {
    window.__statusMap[charId].mind.traits = window.__statusMap[charId].mind.traits || {};
    window.__statusMap[charId].mind.traits[key] = next;
  }
}

/** clears overrides for the character and restores baseline into window.__statusMap */
export function resetMindOverrides(charId) {
  // clear LS overrides
  const all = loadOverrides();
  if (all[charId]) {
    delete all[charId];
    saveOverrides(all);
  }

  // restore baseline snapshot into the live map
  const base = baseline[charId] ? deepClone(baseline[charId]) : { moods: {}, traits: {} };

  if (typeof window !== "undefined") {
    window.__statusMap = window.__statusMap || {};
    window.__statusMap[charId] = window.__statusMap[charId] || {};
    // important: always give UI a fresh object (no stale reference)
    window.__statusMap[charId].mind = base;
    // optional: a small version bump to help any watchers
    window.__statusMap[charId].__mindVersion = (window.__statusMap[charId].__mindVersion || 0) + 1;
  }

  return true;
}
