// js/systems/clock.js
const CLOCK_KEY = "sim_clock_v1";

// default: Day 1, 08:00, arbitrary base date so ISO is valid
const DEFAULT = { base: "0001-01-01", day: 1, hour: 8 };

export function getClock() {
  try {
    const raw = localStorage.getItem(CLOCK_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}
export function setClock(next) {
  localStorage.setItem(CLOCK_KEY, JSON.stringify(next));
}

// Helpers
export function toISO({ base, day, hour = 12, minute = 0 }) {
  // base is "YYYY-MM-DD"
  const d0 = new Date(`${base}T00:00:00Z`);
  d0.setUTCDate(d0.getUTCDate() + (Number(day) - 1));
  d0.setUTCHours(hour, minute, 0, 0);
  return d0.toISOString();
}
export function currentISO() { return toISO(getClock()); }

// Advance time (call from your Time Engine)
export function advanceHours(n = 1) {
  const c = getClock();
  let h = Number(c.hour) + Number(n);
  while (h >= 24) { h -= 24; c.day += 1; }
  c.hour = h;
  setClock(c);
  return c;
}
export function advanceDays(n = 1) {
  const c = getClock();
  c.day += Number(n);
  setClock(c);
  return c;
}

// Useful for backfilling/retroactive entries
export function isoFor(day, hour = 18, minute = 0) {
  const c = getClock();
  return toISO({ base: c.base, day, hour, minute });
}
