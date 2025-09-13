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
