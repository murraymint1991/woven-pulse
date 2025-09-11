// js/systems/status.js
// ------------------------------------------------------
// Loaders, global game clock, fertility/pregnancy math,
// and simple runtime overrides used by the Status view.
// ------------------------------------------------------

import { fetchJson } from "../utils.js";

/* =========================
   File loaders (optional)
   ========================= */
export async function loadMind(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.mind || r.data || {}) : {};
}
export async function loadBody(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.body || r.data || {}) : {};
}
export async function loadFertility(url) {
  const r = await fetchJson(url);
  return r.ok ? (r.data?.profiles || {}) : {};
}

/* =========================
   Global game clock (days)
   ========================= */
const CLOCK_KEY = "sim_game_clock_v1";

export function getClock() {
  try {
    return JSON.parse(localStorage.getItem(CLOCK_KEY) || '{"day":0}');
  } catch {
    return { day: 0 };
  }
}
export function setClock(clock) {
  localStorage.setItem(CLOCK_KEY, JSON.stringify(clock || { day: 0 }));
  return clock;
}
export function advanceDays(n = 1) {
  const c = getClock();
  c.day += Number(n) || 0;
  setClock(c);
  return c;
}
export function resetClock(day = 0) {
  return setClock({ day: Number(day) || 0 });
}

/* ===========================================
   Fertility / Pregnancy / Cycle state helper
   =========================================== */
/**
 * Returns one of:
 *  { kind:"pregnant",   weeks, trimester, etaDays, percent }
 *  { kind:"postpartum", weeksSince, percent }
 *  { kind:"cycle",      phase, dayInCycle, length, percent }
 */
export function computeReproState(cycleCfg, profile, now = new Date()) {
  if (!profile || profile.visible === false) return null;

  // apply global clock (days) as an offset to "now"
  const clock = getClock();
  const nowShifted = addDaysUTC(now, Number(clock?.day) || 0);

  const mode = (profile.mode || "cycle").toLowerCase();

  if (mode === "pregnant") {
    const gestWeeks = num(cycleCfg?.gestationWeeks, 40);
    const start = parseISO(profile.conceptionISO);
    if (!start) return null;

    const weeks = clamp(Math.floor(diffDaysUTC(nowShifted, start) / 7), 0, gestWeeks);
    const trimester = weeks < 13 ? 1 : weeks < 27 ? 2 : 3;

    const due = addDaysUTC(start, gestWeeks * 7);
    const etaDays = Math.max(0, Math.ceil(diffDaysUTC(due, nowShifted)));
    const percent = clamp(Math.round((weeks / gestWeeks) * 100), 0, 100);

    return { kind: "pregnant", weeks, trimester, etaDays, percent };
  }

  if (mode === "postpartum") {
    const ppWeeks = num(cycleCfg?.postpartumWeeks, 6);
    const delivery = parseISO(profile.deliveryISO);
    if (!delivery) return null;

    const weeksSince = Math.max(0, Math.floor(diffDaysUTC(nowShifted, delivery) / 7));
    const percent = clamp(Math.round((weeksSince / ppWeeks) * 100), 0, 100);

    return { kind: "postpartum", weeksSince, percent };
  }

  // Default: menstrual cycle
  const length   = num(cycleCfg?.lengthDays, 28);
  const ovulDay  = num(cycleCfg?.ovulationDay, 14);
  const luteal   = num(cycleCfg?.luteal, 14);
  const fertHigh = new Set(cycleCfg?.modifiers?.fertilityHighDays || [ovulDay - 1, ovulDay, ovulDay + 1]);

  const start = parseISO(profile.startISO);
  if (!start) return null;

  const days = diffDaysUTC(nowShifted, start);
  const dayInCycle = mod1(days, length); // 1..length

  let phase = "Safe";
  if (fertHigh.has(dayInCycle)) phase = "Ovulation";
  else if (dayInCycle >= ovulDay - 3 && dayInCycle <= ovulDay + 3) phase = "Fertile";
  else if (dayInCycle >= (length - luteal)) phase = "Luteal";

  const percent = clamp(Math.round((dayInCycle / length) * 100), 0, 100);
  return { kind: "cycle", phase, dayInCycle, length, percent };
}

/* ===========================================
   Runtime overrides (per character)
   =========================================== */
const OV_KEY = "sim_fertility_overrides_v1";

export function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OV_KEY) || "{}"); }
  catch { return {}; }
}
export function saveOverrides(map) {
  localStorage.setItem(OV_KEY, JSON.stringify(map || {}));
}
export function mergedProfile(baseProfiles, overrides, id) {
  const base = (baseProfiles && baseProfiles[id]) ? baseProfiles[id] : {};
  const ov   = (overrides && overrides[id]) ? overrides[id] : {};
  return { ...base, ...ov };
}

/* Stamp helpers use “world today” (real today + clock.day) */
function isoWorldToday() {
  const c = getClock();
  const d = addDaysUTC(new Date(), Number(c?.day) || 0);
  return d.toISOString().slice(0, 10);
}

export function setPregnant(id, conceptionISO = isoWorldToday()) {
  const ov = loadOverrides();
  ov[id] = { ...(ov[id] || {}), mode: "pregnant", conceptionISO, visible: true };
  saveOverrides(ov);
  return ov[id];
}
export function setDelivered(id, deliveryISO = isoWorldToday()) {
  const ov = loadOverrides();
  ov[id] = { ...(ov[id] || {}), mode: "postpartum", deliveryISO, visible: true };
  saveOverrides(ov);
  return ov[id];
}
export function resetToCycle(id, startISO = isoWorldToday()) {
  const ov = loadOverrides();
  ov[id] = { ...(ov[id] || {}), mode: "cycle", startISO, visible: true };
  saveOverrides(ov);
  return ov[id];
}

/* =========================
   Small date/number helpers
   ========================= */
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(iso + (/\dT/.test(iso) ? "" : "T00:00:00Z"));
  return isNaN(d.getTime()) ? null : d;
}
function diffDaysUTC(a, b) {
  const au = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bu = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((au - bu) / 86400000);
}
function addDaysUTC(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}
function mod1(n, m) { const r = ((n % m) + m) % m; return r === 0 ? m : r; }
