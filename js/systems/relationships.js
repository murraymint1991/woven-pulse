// Relationship tiers: worst -> best
export const TIERS = [
  { id: "enemies",       name: "Enemies",       decayPerDay: 1,  dropFloor: 10 },
  { id: "repulsive",     name: "Repulsive",     decayPerDay: 1,  dropFloor: 15 },
  { id: "dislike",       name: "Dislike",       decayPerDay: 1,  dropFloor: 20 },
  { id: "neutral",       name: "Neutral",       decayPerDay: 0,  dropFloor: 0  },
  { id: "acquaintance",  name: "Acquaintances", decayPerDay: 1,  dropFloor: 30 },
  { id: "friends",       name: "Friends",       decayPerDay: 1,  dropFloor: 40 },
  { id: "close_friends", name: "Close Friends", decayPerDay: 1,  dropFloor: 50 },
  { id: "more_than",     name: "More Than Friends", decayPerDay: 1, gate: { flag: "firstKiss" }, dropFloor: 60 },
  { id: "romantic",      name: "Romantic",      decayPerDay: 2,  dropFloor: 65 },
  { id: "lovers",        name: "Lovers",        decayPerDay: 2,  dropFloor: 70 },
  { id: "bonded",        name: "Bonded",        decayPerDay: 2,  dropFloor: 75 },
  { id: "married",       name: "Married",       decayPerDay: 0.5, dropFloor: 80 }
];
export const NEUTRAL_IDX = TIERS.findIndex(t => t.id === "neutral");

// Diminishing-returns step based on % of remaining distance
export function effectiveGain(remain, basePercent, stiffness = 1.3) {
  if (remain <= 0) return 0;
  const g = Math.ceil(remain * Math.pow(Math.abs(basePercent) / 100, stiffness));
  return Math.max(1, Math.min(g, remain));
}

export function canAdvanceTier({ tier, gateCheck }) {
  const next = TIERS[tier + 1];
  if (!next) return false;
  const gate = next.gate;
  if (gate?.flag) return !!gateCheck?.(gate.flag);
  return true;
}

// Pure transform: apply a forward/backward step
export function addSlow(cur, basePercent = 10, opts = {}) {
  const { day, stiffness = 1.3, dailyCap = 30, NEUTRAL = NEUTRAL_IDX, gateCheck } = opts;
  let { tier, score, lastGainDay, gainedToday } = cur;
  const forward = basePercent >= 0;

  const gotToday = (lastGainDay === day && gainedToday) ? gainedToday : 0;
  let roomToday = Math.max(0, dailyCap - gotToday);
  if (roomToday <= 0) return { ...cur, lastGainDay: day, gainedToday: gotToday };

  const remain = forward ? Math.min(100 - score, roomToday) : Math.min(score, roomToday);
  if (remain <= 0) return { ...cur, lastGainDay: day, gainedToday: gotToday };

  const step = effectiveGain(remain, basePercent, stiffness);

  if (forward) {
    score += step;
    if (score >= 100) {
      if (canAdvanceTier({ tier, gateCheck })) {
        tier = Math.min(tier + 1, TIERS.length - 1);
        score = 0;
      } else {
        score = 99; // parked until gate met
      }
    }
  } else {
    score -= step;
    if (score <= 0) {
      if (tier > 0) { tier = Math.max(0, tier - 1); score = 100; }
      else score = 0;
    }
  }

  return { ...cur, tier, score, lastGainDay: day, gainedToday: gotToday + step };
}

// Pure transform: daily decay toward neutral (both sides)
export function decay(cur, days = 1, opts = {}) {
  const { day, NEUTRAL = NEUTRAL_IDX } = opts;
  let { tier, score } = cur;

  for (let i = 0; i < days; i++) {
    const d = TIERS[tier]?.decayPerDay || 0;

    if (tier > NEUTRAL) {
      score = Math.max(0, score - d);
      if (score === 0 && tier > NEUTRAL) {
        const floor = TIERS[tier].dropFloor || 0;
        if (cur.score < floor) { tier = Math.max(NEUTRAL, tier - 1); score = Math.min(100, TIERS[tier].dropFloor ?? 0); }
      }
    } else if (tier < NEUTRAL) {
      score = Math.min(100, score + d);
      if (score >= 100) { tier = Math.min(NEUTRAL, tier + 1); score = 0; }
    }
  }

  return { ...cur, tier, score, lastDay: day };
}
