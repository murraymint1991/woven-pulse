// js/systems/mind.js
// Lightweight runtime store for Mind (moods/traits) with persistence & helpers.

const LS_KEY = "sim_mind_overrides_v1";

// Safe read/write
function readLS() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function writeLS(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
  return obj;
}

// Clamp helper
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

// Merge order: fileBase -> overrides => effective
export function getMindState(charId, fileMind) {
  const ov = readLS()[charId] || {};
  const moods = { ...(fileMind?.moods || {}), ...(ov.moods || {}) };
  const traits = { ...(fileMind?.traits || {}), ...(ov.traits || {}) };
  // normalize to 0..1
  for (const k in moods) moods[k] = clamp01(moods[k]);
  for (const k in traits) traits[k] = clamp01(traits[k]);
  return { moods, traits };
}

// Write deltas into overrides (non-destructive to the file)
export function applyMoodDelta(charId, key, delta) {
  const store = readLS();
  const ov = (store[charId] ||= {});
  const bucket = (ov.moods ||= {});
  bucket[key] = clamp01((bucket[key] ?? 0) + delta);
  writeLS(store);
  return bucket[key];
}
export function applyTraitDelta(charId, key, delta) {
  const store = readLS();
  const ov = (store[charId] ||= {});
  const bucket = (ov.traits ||= {});
  bucket[key] = clamp01((bucket[key] ?? 0) + delta);
  writeLS(store);
  return bucket[key];
}

// Optional daily decay (small drift back toward base 0.5 or file value)
export function dailyMindDecay(charId, fileMind, { rate = 0.02, center = 0.5 } = {}) {
  const store = readLS();
  const ov = (store[charId] ||= {});
  const moods = (ov.moods ||= {});
  const traits = (ov.traits ||= {});
  for (const [k, v] of Object.entries(moods)) {
    const target = Number.isFinite(fileMind?.moods?.[k]) ? fileMind.moods[k] : center;
    moods[k] = clamp01(v + (target - v) * rate);
  }
  for (const [k, v] of Object.entries(traits)) {
    const target = Number.isFinite(fileMind?.traits?.[k]) ? fileMind.traits[k] : center;
    traits[k] = clamp01(v + (target - v) * rate);
  }
  writeLS(store);
  return { moods, traits };
}

// Utilities
export function resetMindOverrides(charId) {
  const store = readLS();
  delete store[charId];
  writeLS(store);
}
export function clearAllMindOverrides() {
  writeLS({});
}
