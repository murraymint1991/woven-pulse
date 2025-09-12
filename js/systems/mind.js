// js/systems/mind.js
// ---------------------------------------------
// Local, browser-only overrides for Mind state.
// We ONLY store overrides here; the base values
// still live in data/status/<char>/mind_*.json.
// The view should merge base(file) + overrides.
//
// Stored shape in localStorage (per charId):
// { moods: { key: number }, traits: { key: number } }
// ---------------------------------------------

const LS_KEY = (charId) => `mind_overrides_${charId}_v1`;

// clamp to [0,1]
function clamp01(n) {
  n = Number(n);
  if (Number.isNaN(n)) n = 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/* =============================
   Load / Save / Clear
   ============================= */
export function loadMindOverrides(charId) {
  try {
    const raw = localStorage.getItem(LS_KEY(charId));
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMindOverrides(charId, data) {
  try {
    localStorage.setItem(LS_KEY(charId), JSON.stringify(data || {}));
  } catch {
    // ignore quota/serialization failures
  }
}

export function clearMindOverrides(charId) {
  try {
    localStorage.removeItem(LS_KEY(charId));
  } catch {
    // ignore
  }
}

/* =============================
   Deltas (adjust by +/- amount)
   ============================= */
export function applyMoodDelta(charId, key, delta) {
  const o = loadMindOverrides(charId);
  const moods = { ...(o.moods || {}) };
  const next = clamp01((moods[key] ?? 0) + Number(delta || 0));
  moods[key] = next;
  saveMindOverrides(charId, { ...o, moods });
  return next;
}

export function applyTraitDelta(charId, key, delta) {
  const o = loadMindOverrides(charId);
  const traits = { ...(o.traits || {}) };
  const next = clamp01((traits[key] ?? 0) + Number(delta || 0));
  traits[key] = next;
  saveMindOverrides(charId, { ...o, traits });
  return next;
}

/* =============================
   Set explicit value helpers
   (sometimes nicer than deltas)
   ============================= */
export function setMoodValue(charId, key, value) {
  const o = loadMindOverrides(charId);
  const moods = { ...(o.moods || {}) };
  moods[key] = clamp01(value);
  saveMindOverrides(charId, { ...o, moods });
  return moods[key];
}

export function setTraitValue(charId, key, value) {
  const o = loadMindOverrides(charId);
  const traits = { ...(o.traits || {}) };
  traits[key] = clamp01(value);
  saveMindOverrides(charId, { ...o, traits });
  return traits[key];
}

/* =============================
   Presets / Resets
   ============================= */
/**
 * Write explicit 0.0 overrides for every key that exists
 * in the base(file) mind. Any keys NOT present in base
 * are ignored.
 */
export function zeroOutMind(charId, baseMind = {}) {
  const moods = Object.fromEntries(Object.keys(baseMind.moods || {}).map(k => [k, 0]));
  const traits = Object.fromEntries(Object.keys(baseMind.traits || {}).map(k => [k, 0]));
  saveMindOverrides(charId, { moods, traits });
}

/**
 * Convenience reset:
 *   mode "clear" (default): remove all overrides (reverts fully to file)
 *   mode "zero":           write 0.0 for all base keys
 */
export function resetMindOverrides(charId, baseMind = null, mode = "clear") {
  if (mode === "zero" && baseMind) {
    zeroOutMind(charId, baseMind);
  } else {
    clearMindOverrides(charId);
  }
}

/* =============================
   Merge helpers for the view
   ============================= */
export function mergeEffectiveMind(baseMind = {}, overrides = {}) {
  const moods  = { ...(baseMind.moods  || {}), ...(overrides.moods  || {}) };
  const traits = { ...(baseMind.traits || {}), ...(overrides.traits || {}) };
  return { moods, traits };
}

/**
 * Handy one-call helper used by views:
 * read overrides for charId and merge with provided base.
 */
export function getEffectiveMind(charId, baseMind = {}) {
  const overrides = loadMindOverrides(charId);
  return mergeEffectiveMind(baseMind, overrides);
}
