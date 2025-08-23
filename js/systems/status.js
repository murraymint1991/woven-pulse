// js/systems/status.js
import { fetchJson } from "../utils.js";

export async function loadFertility(url) {
  const r = await fetchJson(url);
  if (!r.ok) return {};
  return r.data?.profiles || {};
}

/**
 * Unified reproductive state:
 * - If profile.mode === "pregnant": compute weeks, trimester, ETA, percent to term
 * - If profile.mode === "postpartum": compute weeks since delivery, percent of a 6-week window
 * - Else (or missing): compute cycle phase/day via cycleCfg
 *
 * Returns one of:
 * { kind:"pregnant", weeks, trimester, etaDays, percent }
 * { kind:"postpartum", weeksSince, percent }
 * { kind:"cycle", phase, dayInCycle, length, percent }
 */
export function computeReproState(cycleCfg, profile, now = new Date()) {
  if (!profile || profile.visible === false) return null;

  const mode = (profile.mode || "cycle").toLowerCase();

  if (mode === "pregnant") {
    // Config
    const gestWeeks = Number(cycleCfg?.gestationWeeks) || 40;
    const start = parseISO(profile.conceptionISO);
    if (!start) return null;

    const weeks = clamp(Math.floor(diffDaysUTC(now, start) / 7), 0, gestWeeks);
    const trimester = weeks < 13 ? 1 : weeks < 27 ? 2 : 3;

    const due = addDaysUTC(start, gestWeeks * 7);
    const etaDays = Math.max(0, Math.ceil(diffDaysUTC(due, now)));
    const percent = clamp(Math.round((weeks / gestWeeks) * 100), 0, 100);

    return { kind: "pregnant", weeks, trimester, etaDays, percent };
  }

  if (mode === "postpartum") {
    const ppWindowWeeks = Number(cycleCfg?.postpartumWeeks) || 6;
    const delivery = parseISO(profile.deliveryISO);
    if (!delivery) return null;

    const weeksSince = Math.max(0, Math.floor(diffDaysUTC(now, delivery) / 7));
    const percent = clamp(Math.round((weeksSince / ppWindowWeeks) * 100), 0, 100);

    return { kind: "postpartum", weeksSince, percent };
  }

  // Default: cycle
  const length = Number(cycleCfg?.lengthDays) || 28;
  const ovulDay = Number(cycleCfg?.ovulationDay) || 14;
  const luteal = Number(cycleCfg?.luteal) || 14;
  const fertileHigh = new Set(cycleCfg?.modifiers?.fertilityHighDays || [ovulDay - 1, ovulDay, ovulDay + 1]);

  const start = parseISO(profile.startISO);
  if (!start) return null;

  const days = diffDaysUTC(now, start);
  const dayInCycle = mod1(days, length); // 1..length

  let phase = "Safe";
  if (fertileHigh.has(dayInCycle)) phase = "Ovulation";
  else if (dayInCycle >= ovulDay - 3 && dayInCycle <= ovulDay + 3) phase = "Fertile";
  else if (dayInCycle >= (length - (luteal || 14))) phase = "Luteal";

  const percent = clamp(Math.round((dayInCycle / length) * 100), 0, 100);
  return { kind: "cycle", phase, dayInCycle, length, percent };
}

// ---- helpers ----
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function parseISO(iso){ if (!iso) return null; const d = new Date(iso + (/\dT/.test(iso) ? "" : "T00:00:00Z")); return isNaN(d.getTime()) ? null : d; }
function diffDaysUTC(a, b){ // a - b in days, UTC
  const au = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bu = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.floor((au - bu) / 86400000);
}
function addDaysUTC(d, days){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)); }
function mod1(n, m){ const r = ((n % m) + m) % m; return r === 0 ? m : r; }
