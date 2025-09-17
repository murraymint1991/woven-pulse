// js/validation.js
import { z } from "https://esm.sh/zod@3.23.8";

/** ===== Schemas (loose enough for your current data shapes) ===== */
export const DiaryIndexSchema = z.object({
  version: z.string(),
  characterId: z.string(),
  targetId: z.string(),
  sources: z.object({
    desires: z.string().optional(),
    witnessed: z.string().optional(),
    events: z.record(z.string()).optional(), // { "first_kiss": "url", ... }
  }),
  entries: z.array(z.any()).optional(),
});

export const DesiresSchema = z.record(
  z.object({
    love: z.array(z.string()).optional(),
    corruption: z.array(z.string()).optional(),
    hybrid: z.array(z.string()).optional(),
    any: z.array(z.string()).optional(),
  })
);

// witnessed has had a few variants; keep permissive for now
export const WitnessedSchema = z.record(z.any());

// event files: { love:[], corruption:[], hybrid:[] } (strings or {text})
export const EventFileSchema = z.record(
  z.array(z.union([z.string(), z.object({ text: z.string() })]))
);

/** ===== Small helpers ===== */
export function safeParse(schema, data, label) {
  const r = schema.safeParse(data);
  return r.success
    ? { ok: true, label, data: r.data }
    : { ok: false, label, issues: r.error.issues };
}

export async function validateUrl(url, schema, label) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) return { ok: false, label, error: `HTTP ${res.status}` };

    let json;
    try { json = JSON.parse(text); }
    catch { return { ok: false, label, error: "Bad JSON" }; }

    return safeParse(schema, json, label);
  } catch (e) {
    return { ok: false, label, error: String(e) };
  }
}

// === NEW: extra schemas for Characters / Relationships / Status ===

// Your character files look like: { "character": { id, displayName, ... } }
export const CharacterFileSchema = z.object({
  character: z.object({
    id: z.string().min(1),
    displayName: z.string().optional(),
    type: z.string().optional(),
    portrait: z.string().optional(),
    baseStats: z.record(z.any()).optional()
  })
});

// Relationships file looks like: { "edges": [ { from, to, strength? }, ... ] }
export const RelationshipsFileSchema = z.object({
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      strength: z.number().optional()
    })
  ).default([])
});

// Status files vary (mind/body). Keep permissive but allow warnings later.
export const StatusLooseSchema = z.union([
  z.object({
    mind: z.record(z.any()).optional(),
    body: z.record(z.any()).optional()
  }).passthrough(),
  z.record(z.any())
]);

/** Count top-level numeric values outside a range (for gentle warnings). */
export function countNumericOutOfRange(obj, min = 0, max = 100) {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === "number" && (v < min || v > max)) n++;
  }
  return n;
}

/**
 * NEW: validate a URL against a schema and optionally compute a warning count.
 * Returns { ok, label, error?, issues? }
 */
export async function validateUrlPlus(url, schema, label, warnCounterFn) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) return { ok: false, label, error: `HTTP ${res.status}` };

    let json;
    try { json = JSON.parse(text); }
    catch { return { ok: false, label, error: "Bad JSON" }; }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, label, error: parsed.error.issues };
    }

    const issues = typeof warnCounterFn === "function" ? Number(warnCounterFn(parsed.data)) || 0 : 0;
    return { ok: true, label, issues };
  } catch (e) {
    return { ok: false, label, error: String(e) };
  }
}
