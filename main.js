// main.js
// ======================================================================
//  Root loader + simple router for: Home · Status · Relationships · Diary
//  Includes: diary cache (by pair), dev event hooks, status data glue.
//  Big banners mark the sections you'll likely tweak in the future.
// ======================================================================

import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

// ---- UI bits ----------------------------------------------------------
import DiaryView from "./js/views/diary.js";
import StatusView from "./js/views/status.js";

// ---- Systems (status) -------------------------------------------------
import {
  loadMind, loadBody, loadFertility,
  getClock, advanceDays
} from "./js/systems/status.js";

// ---- Utils ------------------------------------------------------------
import { fetchJson } from "./js/utils.js";

// ======================================================================
// [ SECTION 1 ]  DATA MAP — all top-level JSON entry points live here.
//                 (Adjust paths freely; views depend only on this map.)
// ======================================================================
const DATA_MAP = {
  // Characters shown in Status (portrait, stats, etc.)
  characters: [
    "data/characters/aerith.json",
    "data/characters/vagrant.json"
  ],

  // Pair-specific diary (Aerith ↔ Vagrant)
  diaries: {
    "aerith:vagrant": "data/diaries/aerith_vagrant/index.json"
  },

  // Status/Mind/Body/Fertility (used by Status screen)
  statusMind:      "data/status/mind_v1.json",
  statusBody:      "data/status/body_v1.json",
  statusFertility: "data/status/fertility_v1.json"
};

// ======================================================================
// [ SECTION 2 ]  TINY LOADER — wraps fetchJson and logs nice errors.
// ======================================================================
async function loadJson(url, label = url) {
  const r = await fetchJson(url);
  if (!r.ok) {
    console.error(`[data] failed to load ${label}`, r.status, r.error || "");
    throw new Error(`Failed to load ${label}`);
  }
  return r.data;
}

// ======================================================================
// [ SECTION 3 ]  DIARY LOADER / CACHE (by pair)
//  - Loads index.json, follows "sources" to fetch/flatten lanes
//  - Normalizes "caught_others" (witnessed) via the dev-friendly shape
//  - Exposes a global window.__diaryByPair for quick console inspection
// ======================================================================

/** normalize "caught_others" -> witnessed[target][who][path] = string[] by stage */
function normalizeCaught(caughtObj, stageMax = 10) {
  const PATHS = ["love", "corruption", "hybrid"];
  const out = {};
  for (const [who, itemsRaw] of Object.entries(caughtObj || {})) {
    const items = Array.isArray(itemsRaw) ? itemsRaw.slice().sort((a,b)=>(a.stageMin??0)-(b.stageMin??0)) : [];
    const perPath = { love: [], corruption: [], hybrid: [] };
    for (let s = 0; s <= stageMax; s++) {
      const pick = items.filter(it => (it.stageMin ?? 0) <= s).pop() || null;
      for (const p of PATHS) {
        const prev = perPath[p][s - 1] || null;
        const applies = !pick || !pick.path || pick.path === "any" || pick.path === p;
        perPath[p][s] = applies && pick ? (pick.text || prev || null) : (prev || null);
      }
    }
    out[who] = perPath;
  }
  return out;
}

async function loadDiaryIndex(indexUrl) {
  // index.json
  const idx = await loadJson(indexUrl, "diary/index");
  const targetId  = String(idx.targetId || "vagrant");
  const actorId   = String(idx.characterId || "aerith");
  const sources   = idx.sources || {};

  // desires
  let desires = {};
  if (sources.desires) {
    const d = await loadJson(sources.desires, "diary/desires");
    // expected shape: { "<target>": { love:[], corruption:[], hybrid:[] } }
    desires = (d && typeof d === "object") ? d : {};
  }

  // witnessed / caught_others
  let witnessed = {};
  if (sources.witnessed) {
    const w = await loadJson(sources.witnessed, "diary/caught_others");
    // dev-friendly input: { tifa:[{stageMin, path, text},...], ... }
    const norm = normalizeCaught(w, 10);
    witnessed[targetId] = norm;
  }

  // optional events (e.g. locations/cave)
  let events = {};
  if (sources.events && typeof sources.events === "object") {
    events = {};
    for (const [key, url] of Object.entries(sources.events)) {
      const ev = await loadJson(url, `diary/event(${key})`);
      // expected shape: { love:[], corruption:[], hybrid:[] }
      if (ev && typeof ev === "object") {
        events[key] = ev;
      }
    }
  }

  // minimal diary object; entries[] starts empty (timeline writes at runtime)
  return {
    id: "diary",
    characterId: actorId,
    targetId,
    desires,
    witnessed,       // witnessed[targetId][who][path] = string[]
    events,          // events[key][path] = string[]
    entries: []
  };
}

async function loadAllDiaries() {
  const out = {};
  for (const [pairKey, url] of Object.entries(DATA_MAP.diaries || {})) {
    out[pairKey] = await loadDiaryIndex(url);
    console.log("[Diary loaded]", {
      key: pairKey,
      characterId: out[pairKey].characterId,
      targetId: out[pairKey].targetId,
      keys: Object.keys(out[pairKey]),
      entriesCount: out[pairKey].entries.length
    });
  }
  // expose for console debugging
  window.__diaryByPair = out;
  return out;
}

// ======================================================================
// [ SECTION 4 ]  RUNTIME DEV EVENTS (emitGameEvent)
//  - First kiss event (path-aware) that appends to the diary timeline
// ======================================================================

async function loadFirstKissLines() {
  try {
    const r = await fetchJson("data/diaries/aerith_vagrant/first_kiss.json");
    return r.ok ? r.data || {} : {};
  } catch { return {}; }
}

/** simple append util for diary entries */
function appendDiaryEntry(diary, payload) {
  if (!diary || !Array.isArray(diary.entries)) diary.entries = [];
  const id = `${diary.characterId || "char"}-${Math.random().toString(36).slice(2,8)}`;
  diary.entries.push({
    id,
    date: new Date().toISOString(),
    text: String(payload.text || ""),
    path: payload.path ?? null,
    stage: payload.stage ?? null,
    mood: Array.isArray(payload.mood) ? payload.mood : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    asides: Array.isArray(payload.asides) ? payload.asides : []
  });
}

/** pick current path & stage for a pair (localStorage) */
const PS_KEY = "sim_path_state_v1";
function getPairState(charId, targetId) {
  try {
    const all = JSON.parse(localStorage.getItem(PS_KEY) || "{}");
    return all?.[charId]?.[targetId] || { path: "love", stage: 0 };
  } catch { return { path: "love", stage: 0 }; }
}

/** public dev event entrypoint (used by views) */
async function emitGameEvent(type, payload = {}) {
  const pairKey = "aerith:vagrant";
  const diary   = window.__diaryByPair?.[pairKey];
  if (!diary) return;

  if (type === "interaction.firstKiss") {
    const lines = await loadFirstKissLines();
    const pair  = getPairState(diary.characterId, diary.targetId);
    const lane  = lines?.[pair.path] || [];
    const text  = lane[0] || "(first kiss)";
    appendDiaryEntry(diary, {
      text: `[first kiss·${pair.path}] ${text}`,
      path: pair.path,
      stage: pair.stage ?? 0,
      mood: ["thrilled"],
      tags: ["#event", "#firstKiss", `#with:${diary.targetId}`]
    });
    console.log("[event] firstKiss -> appended");
  }

  if (type === "time.morningTick") {
    advanceDays(1);
    console.log("[time] +1 day");
  }
}

// expose for buttons in views
window.emitGameEvent = emitGameEvent;

// ======================================================================
// [ SECTION 5 ]  TOP-LEVEL APP (simple hash router)
// ======================================================================

function Badge(props){ return h("span",{class:"badge"+(props.ghost?" ghost":""),...props}); }
function Button(props){ return h("button",{class:"btn"+(props.ghost?" ghost":""),...props}); }

function Nav() {
  const go = (p) => () => location.hash = p;
  const tab = (href, label) =>
    h(Button, { ghost: location.hash !== href, onClick: go(href) }, label);
  return h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap;" }, [
    tab("#/home", "Home"),
    tab("#/status", "Status"),
    tab("#/relationships", "Relationships"),
    tab("#/diary", "Diary")
  ]);
}

function Home() {
  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Diary · Pair"),
      h(Nav, null),
      h("div", { class: "kv small" }, [
        h(Badge, null, `Actor: aerith`),
        h(Badge, null, `Target: vagrant`)
      ])
    ])),
    h("div", { class: "card" }, [
      h(Button, { onClick: () => alert("Seed coming soon") }, "Seed Test Entry"),
      h(Button, { ghost:true, onClick: () => {
        const d = window.__diaryByPair?.["aerith:vagrant"];
        if (d) d.entries = [];
        alert("Cleared timeline entries in memory");
      }}, "Clear Entries")
    ])
  ]);
}

// ---------- Root App component that loads data once --------------------
function App() {
  const [ready, setReady]           = useState(false);
  const [diaries, setDiaries]       = useState({});
  const [characters, setChars]      = useState([]);
  const [statusMind, setMind]       = useState({});
  const [statusBody, setBody]       = useState({});
  const [fertilityMap, setFertMap]  = useState({});
  const [hash, setHash]             = useState(location.hash || "#/diary");

  useEffect(() => {
    const onHash = () => setHash(location.hash || "#/diary");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Characters
        const charObjs = [];
        for (const u of DATA_MAP.characters) {
          const c = await loadJson(u, "character");
          charObjs.push({ id: c.id, displayName: c.displayName, portrait: c.portrait, baseStats: c.baseStats || {} });
        }
        setChars(charObjs);

        // Status mind/body/fertility
        const [m, b, f] = await Promise.all([
          loadMind(DATA_MAP.statusMind),
          loadBody(DATA_MAP.statusBody),
          loadFertility(DATA_MAP.statusFertility)
        ]);
        setMind(m);
        setBody(b);
        setFertMap(f);

        // Diaries (build cache)
        const d = await loadAllDiaries();
        setDiaries(d);

        setReady(true);
      } catch (e) {
        console.error("Boot error:", e);
        alert("Loading data failed. Check console for details.");
      }
    })();
  }, []);

  if (!ready) {
    return h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Loading app…"),
      h("div", { class: "small" }, `Day ${getClock().day}`)
    ]));
  }

  // Current diary (only one pair for now)
  const diaryAV = diaries["aerith:vagrant"];

  // Simple hash routing
  const route = (hash || "#/diary").replace(/^#\//, "");
  const View = (route === "status")
    ? h(StatusView, {
        chars: characters,
        statusMap: statusBody,        // basic status can be kept in body.json if you like
        playerFemale: statusBody?.playerFemale || null,
        fertilityMap: fertilityMap,
        Nav
      })
    : (route === "relationships")
      ? h("div", null, [
          h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
            h("div", { class: "stage-title" }, "Relationships"),
            h(Nav, null)
          ])),
          h("div", { class: "card" }, "WIP: relationships UI")
        ])
      : (route === "home")
        ? h(Home, null)
        : h(DiaryView, {
            diary: diaryAV,
            characterId: "aerith",
            targetId: "vagrant",
            Nav
          });

  return h("div", null, View);
}

// Boot
render(h(App, null), document.getElementById("app"));
