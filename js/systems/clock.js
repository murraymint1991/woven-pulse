// js/systems/clock.js
const CLOCK_KEY = "sim_clock_v1";

// default: Day 1, 08:00, arbitrary base date so ISO is valid
const DEFAULT = { base: "0001-01-01", day: 1, hour: 8, minute: 0 };

/* ---------------- Core state ---------------- */
export function getClock() {
  try {
    const raw = localStorage.getItem(CLOCK_KEY);
    const c = raw ? JSON.parse(raw) : { ...DEFAULT };
    // fill any missing fields for older saves
    if (typeof c.minute !== "number") c.minute = 0;
    return c;
  } catch {
    return { ...DEFAULT };
  }
}
export function setClock(next) {
  const c = {
    base: String(next.base || DEFAULT.base),
    day:  Math.max(1, Number(next.day || DEFAULT.day)),
    hour: clampInt(next.hour, 0, 23, DEFAULT.hour),
    minute: clampInt(next.minute, 0, 59, 0),
  };
  localStorage.setItem(CLOCK_KEY, JSON.stringify(c));
  return c;
}

/* ---------------- Helpers ---------------- */
export function toISO({ base, day, hour = 12, minute = 0 }) {
  // base is "YYYY-MM-DD"
  const d0 = new Date(`${base}T00:00:00Z`);
  d0.setUTCDate(d0.getUTCDate() + (Number(day) - 1));
  d0.setUTCHours(Number(hour), Number(minute), 0, 0);
  return d0.toISOString();
}
export function currentISO() { return toISO(getClock()); }

/* Pretty label for UI: "Day 3, 14:05" */
export function fmtClock(c = getClock()) {
  const hh = String(c.hour).padStart(2, "0");
  const mm = String(c.minute).padStart(2, "0");
  return `Day ${c.day}, ${hh}:${mm}`;
}

/* ---------------- Advance / jump ---------------- */
export function advanceMinutes(n = 1) {
  const c = getClock();
  let mins = Number(c.minute) + Number(n);
  let h = Number(c.hour);
  let d = Number(c.day);

  while (mins >= 60) { mins -= 60; h += 1; }
  while (mins < 0)    { mins += 60; h -= 1; }

  while (h >= 24) { h -= 24; d += 1; }
  while (h < 0)   { h += 24; d = Math.max(1, d - 1); }

  return setClock({ ...c, day: d, hour: h, minute: mins });
}

export function advanceHours(n = 1) {
  return advanceMinutes(Number(n) * 60);
}

export function advanceDays(n = 1) {
  const c = getClock();
  return setClock({ ...c, day: Math.max(1, c.day + Number(n)) });
}

/* Jump to a specific in-game time */
export function setDayHour(day, hour = 0, minute = 0) {
  const c = getClock();
  return setClock({ ...c, day: Math.max(1, Number(day)), hour: Number(hour), minute: Number(minute) });
}

/* Change the real calendar base (useful if you ever want weekday calc) */
export function setBaseDate(yyyyMmDd = "0001-01-01") {
  const c = getClock();
  return setClock({ ...c, base: String(yyyyMmDd) });
}

/* Dev helper: put clock back to default */
export function resetClock() {
  return setClock({ ...DEFAULT });
}

/* Useful for backfilling/retroactive entries */
export function isoFor(day, hour = 18, minute = 0) {
  const c = getClock();
  return toISO({ base: c.base, day, hour, minute });
}

/* ---------------- internal ---------------- */
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, Math.trunc(n)));
  return fallback;
}
