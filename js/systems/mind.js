// js/systems/mind.js
// Local, browser-only overrides for Mind (moods & traits).
// We *only* store the overrides here. The view should merge base(file)+overrides.

const LS_KEY = (charId) => `mind_overrides_${charId}_v1`;

function clamp01(n) {
  n = Number(n);
  if (Number.isNaN(n)) n = 0;
  return Math.min(1, Math.max(0, n));
}

// ---------- load / save ----------
export function loadMindOverrides(charId) {
  try {
    const raw = localStorage.getItem(LS_KEY(charId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMindOverrides(charId, data) {
  try {
    localStorage.setItem(LS_KEY(charId), JSON.stringify(data || {}));
  } catch {
    // ignore
  }
}

export function clearMindOverrides(charId) {
  try {
    localStorage.removeItem(LS_KEY(charId));
  } catch {
    // ignore
  }
}

// ---------- deltas ----------
export function applyMoodDelta(charId, key, delta) {
  const o = loadMindOverrides(charId);
  const moods = { ...(o.moods || {}) };
  const next = clamp01((moods[key] ?? 0) + delta);
  moods[key] = next;
  saveMindOverrides(charId, { ...o, moods });
  return next;
}

export function applyTraitDelta(charId, key, delta) {
  const o = loadMindOverrides(charId);
  const traits = { ...(o.traits || {}) };
  const next = clamp01((traits[key] ?? 0) + delta);
  traits[key] = next;
  saveMindOverrides(charId, { ...o, traits });
  return next;
}

// ---------- presets ----------
/**
 * Zero-out every mood/trait key that exists in the *base* (file) mind.
 * (We write explicit 0.0 overrides for each key.)
 */
export function zeroOutMind(charId, baseMind = {}) {
  const moods = Object.fromEntries(
    Object.keys(baseMind.moods || {}).map((k) => [k, 0])
  );
  const traits = Object.fromEntries(
    Object.keys(baseMind.traits || {}).map((k) => [k, 0])
  );
  saveMindOverrides(charId, { moods, traits });
}

/**
 * Utility to merge base(file) + overrides into a single object the view can render.
 */
export function mergeEffectiveMind(baseMind = {}, overrides = {}) {
  const moods = { ...(baseMind.moods || {}) , ...(overrides.moods || {}) };
  const traits = { ...(baseMind.traits || {}) , ...(overrides.traits || {}) };
  return { moods, traits };
}
