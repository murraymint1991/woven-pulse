// js/utils.js — tiny helpers (no DOM)

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const pad2 = (n) => String(n).padStart(2, "0");

export function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Count arrays on keys that include "scene"
export function countScenesAnywhere(obj) {
  let count = 0;
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && k.toLowerCase().includes("scene")) count += v.length;
      walk(v);
    }
  }
  walk(obj);
  return count;
}

export function nameOf(id, arr){ return (arr.find(c=>c.id===id)?.displayName) || id }
