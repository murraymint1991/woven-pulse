// js/systems/status.js
import { fetchJson } from "../utils.js";

export async function loadFertility(url) {
  const r = await fetchJson(url);
  if (!r.ok) return {};
  return r.data?.profiles || {};
}

// Compute phase info using global cycle config + per-character startISO
export function computeFertility(cycleCfg, startISO, now = new Date()) {
  if (!cycleCfg || !startISO) return null;

  const length = Number(cycleCfg.lengthDays) || 28;
  const ovulDay = Number(cycleCfg.ovulationDay) || 14;
  const luteal = Number(cycleCfg.luteal) || 14;
  const fertileHigh = new Set(cycleCfg.modifiers?.fertilityHighDays || [ovulDay-1, ovulDay, ovulDay+1]);

  const start = new Date(startISO + "T00:00:00Z");
  const days = Math.floor((Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()) - start.getTime()) / 86400000);
  const dayInCycle = ((days % length) + length) % length || length; // 1..length

  let phase = "Safe";
  if (fertileHigh.has(dayInCycle)) phase = "Ovulation";
  else if (dayInCycle >= ovulDay-3 && dayInCycle <= ovulDay+3) phase = "Fertile";
  else if (dayInCycle >= (length - (luteal || 14))) phase = "Luteal";

  const pct = Math.round((dayInCycle / length) * 100);

  return { dayInCycle, length, phase, percent: pct };
}
