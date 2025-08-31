// js/systems/triggers.js
import { getClock } from "./clock.js";
import { appendDiaryEntry, getPairState, setPairState } from "./diary.js";

/* -------------------------
   Tiny Event Bus
-------------------------- */
export const TriggerBus = {
  _subs: new Set(),
  on(fn){ this._subs.add(fn); return () => this._subs.delete(fn); },
  emit(evt){ for (const fn of this._subs) fn(evt); }
};

/* -------------------------
   Cooldowns / Flags
-------------------------- */
const CD_KEY = "sim_trigger_cooldowns_v1";
const FG_KEY = "sim_trigger_flags_v1";

function loadMap(key){ try{ return JSON.parse(localStorage.getItem(key)||"{}"); }catch{ return {}; } }
function saveMap(key, obj){ localStorage.setItem(key, JSON.stringify(obj||{})); }

function hasCooldown(id){
  const cds = loadMap(CD_KEY);
  const now = Date.now();
  return cds[id] && cds[id] > now;
}
function setCooldown(id, ms){
  const cds = loadMap(CD_KEY);
  cds[id] = Date.now() + Math.max(0, ms|0);
  saveMap(CD_KEY, cds);
}

export function hasFlag(flag){
  const f = loadMap(FG_KEY);
  return Boolean(f[flag]);
}
export function addFlag(flag){
  const f = loadMap(FG_KEY); f[flag] = true; saveMap(FG_KEY,f);
}
export function removeFlag(flag){
  const f = loadMap(FG_KEY); delete f[flag]; saveMap(FG_KEY,f);
}

/* -------------------------
   Rule matching helpers
-------------------------- */
function timeOk(cond){
  if (!cond?.time) return true;
  const c = getClock();
  // time: { hourMin?:0, hourMax?:23, dayMin?:1, dayMax?:Infinity }
  const { hourMin=0, hourMax=23, dayMin=1, dayMax=1e9 } = cond.time;
  return c.hour >= hourMin && c.hour <= hourMax && c.day >= dayMin && c.day <= dayMax;
}

function chanceOk(p){ // p in [0..1]
  if (typeof p !== "number") return true;
  return Math.random() < Math.max(0, Math.min(1, p));
}

function pathStageOk(cond, pair){
  const { pathIn, stageMin=0, stageMax=999 } = cond || {};
  if (pathIn && !pathIn.includes(pair.path)) return false;
  const s = Number(pair.stage||0);
  return s >= stageMin && s <= stageMax;
}

function flagsOk(cond){
  if (!cond) return true;
  const { requireAll=[], requireAny=[], forbid=[] } = cond;
  if (requireAll.length && !requireAll.every(hasFlag)) return false;
  if (requireAny.length && !requireAny.some(hasFlag)) return false;
  if (forbid.length && forbid.some(hasFlag)) return false;
  return true;
}

function eventOk(rule, evt){
  // rule.event can be exact or prefix match "location.enter:tent", "interaction."
  const need = rule.event;
  if (!need) return true;
  if (evt.type === need) return true;
  // prefix match like "interaction." to catch "interaction.kiss", "interaction.hold", etc.
  return need.endsWith(".") && evt.type.startsWith(need);
}

/* -------------------------
   Actions
-------------------------- */
function doActions(actions, ctx){
  const { diary, characterId, targetId } = ctx;
  for (const a of actions||[]){
    const t = a.type;
    if (t === "diary.append"){
      appendDiaryEntry(diary, {
        text: a.text || "",
        tags: a.tags || [],
        mood: a.mood || [],
        path: a.path ?? null,
        stage: a.stage ?? null,
      });
    } else if (t === "path.set"){
      const pair = getPairState(characterId, targetId);
      setPairState(characterId, targetId, { path: a.path || pair.path });
    } else if (t === "stage.add"){
      const pair = getPairState(characterId, targetId);
      setPairState(characterId, targetId, { stage: Math.max(0, Math.min(10, Number(pair.stage||0) + (a.delta||0))) });
    } else if (t === "flag.add"){
      addFlag(a.flag);
    } else if (t === "flag.remove"){
      removeFlag(a.flag);
    } else if (t === "cooldown"){
      if (a.id && a.ms) setCooldown(a.id, a.ms);
    }
  }
}

/* -------------------------
   Driver
-------------------------- */
export function installTriggers(rules, { characterId, targetId, diary }){
  // Subscribe once; evaluate every event
  return TriggerBus.on((evt) => {
    for (const rule of rules||[]){
      if (rule.disabled) continue;
      if (!eventOk(rule, evt)) continue;
      if (rule.cooldownId && hasCooldown(rule.cooldownId)) continue;

      const pair = getPairState(characterId, targetId);
      if (!pathStageOk(rule.when?.pathStage, pair)) continue;
      if (!timeOk(rule.when)) continue;
      if (!flagsOk(rule.flags)) continue;
      if (!chanceOk(rule.chance)) continue;

      // optional: further match on evt payload fields (location, actor, item, witness)
      if (rule.match){
        // e.g. { locationIn:["tent","beach"], witnessIn:["tifa"] }
        if (rule.match.locationIn && !rule.match.locationIn.includes(evt.location)) continue;
        if (rule.match.witnessIn && !rule.match.witnessIn.includes(evt.witness)) continue;
        if (rule.match.itemIn && !rule.match.itemIn.includes(evt.item)) continue;
      }

      // Passed: run actions
      doActions(rule.actions, { diary, characterId, targetId, evt });

      // apply cooldown if any
      if (rule.cooldownId && rule.cooldownMs) setCooldown(rule.cooldownId, rule.cooldownMs);
    }
  });
}
