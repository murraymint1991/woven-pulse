// js/systems/sensitivities.js
import { fetchJson } from "../utils.js";

export async function loadCatalog(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.stimuli || {}) : {};
}
export async function loadAssignments(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.characters || {}) : {};
}
export async function loadEvolution(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.rules || []) : [];
}

// Simple scoring helper (optional for later)
export function scoreAttraction(weights, tags, catalog) {
  if (!weights) return 0;
  let score = 0;
  for (const [stim, w] of Object.entries(weights)) {
    const entry = catalog[stim];
    if (!entry) continue;
    const hit =
      (tags?.includes(stim) ? 1 : 0) ||
      (entry.tags?.some(t => tags?.includes(t)) ? 1 : 0);
    if (hit) score += Number(w) || 0;
  }
  return score;
}
