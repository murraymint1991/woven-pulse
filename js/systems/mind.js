// js/systems/mind.js
const LS_KEY = "sim_mind_overrides_v1";

/* ---------- storage ---------- */
function readStore() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeStore(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
}

/* Merge base mind with overrides (deltas). */
export function mergeMind(baseMind = {}, charId) {
  const store = readStore();
  const deltas = (charId && store[charId]) ? store[charId] : {};

  const out = JSON.parse(JSON.stringify(baseMind)); // deep-ish copy

  for (const bucket of ["moods", "traits"]) {
    const b = out[bucket] || {};
    const d = deltas[bucket] || {};
    for (const k of Object.keys(d)) {
      const base = Number(b[k] ?? 0);
      const delta = Number(d[k] ?? 0);
      b[k] = clamp01(base + delta);
    }
    out[bucket] = b;
  }
  return out;
}

/* Bump a specific mood/trait delta (positive or negative). */
export function bumpMind(charId, bucket, key, delta) {
  if (!charId || !bucket || !key || !Number.isFinite(delta)) return;
  const store = readStore();
  const byChar = store[charId] || (store[charId] = {});
  const byBucket = byChar[bucket] || (byChar[bucket] = {});
  const cur = Number(byBucket[key] || 0);
  // we store deltas (additive), but clamp the effective value when displayed
  const next = clampToRange(cur + delta, -1, +1); // keep deltas sane
  if (next === 0) delete byBucket[key];
  else byBucket[key] = next;

  // clean empty buckets/char
  if (byBucket && !Object.keys(byBucket).length) delete byChar[bucket];
  if (byChar && !Object.keys(byChar).length) delete store[charId];

  writeStore(store);
}

/* Reset all overrides for one character (or everyone if charId omitted). */
export function resetMindOverrides(charId) {
  if (!charId) {
    writeStore({});
    return;
  }
  const store = readStore();
  delete store[charId];
  writeStore(store);
}

/* Optional: expose for debugging in console */
if (typeof window !== "undefined") {
  window.__mindStore = {
    read: readStore,
    write: writeStore,
    reset: resetMindOverrides,
    bump: bumpMind,
  };
}

/* ---------- utils ---------- */
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function clampToRange(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
