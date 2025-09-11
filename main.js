// main.js — restored loaders + caches + routes
// ============================================

import { h, render } from "https://esm.sh/preact@10.22.0";
import { useState } from "https://esm.sh/preact@10.22.0/hooks";

// VIEWS (your existing files)
import HomeView from "./js/views/home.js";
import StatusView from "./js/views/status.js";
import RelationshipsView from "./js/views/relationships.js";
import DiaryView from "./js/views/diary.js";

// UI helpers (your existing)
import { Button, Badge } from "./js/ui.js";

// Systems
import {
  loadDiary,
  selectEventLine,
  appendDiaryEntry,
  logWitnessed,
  DIARY_STAGE_MAX
} from "./js/systems/diary.js";

// -----------------------------------------------------------
// SECTION A — Data Map (restore everything your app expects)
// -----------------------------------------------------------
const DATA = {
  // Characters (same set you saw listed on Home before)
  characters: [
    "data/characters/tifa.json",
    "data/characters/yuffie.json",
    "data/characters/renna.json",
    "data/characters/aerith.json",
    "data/characters/nanaki.json",
    "data/characters/kaien.json",
    "data/characters/barret.json",
    "data/characters/cloud.json",
    "data/characters/marek_voss.json",
    "data/characters/the_fractured.json",
    "data/characters/don_corneo.json",
    "data/characters/beggar.json",
    "data/characters/vagrant.json",
  ],

  // Relationships + traits/moods (for Home + Relationships views)
  relationships: "data/relationships/relationships_v1.json",
  traitsMoods:   "data/traits_moods/traits_moods_v1.json",

  // Demo module count display on Home (unchanged)
  demoModule: "data/demo/demo_module_v0_5.json",

  // Pair-specific diary
  diaries: {
    "aerith:vagrant": "data/diaries/aerith_vagrant/index.json",
  },

  // Status/Mind/Body per char — start with Aerith (expand later)
  statusByChar: {
    aerith: {
      body: "data/status/aerith/body.json",
      mind: "data/status/aerith/mind.json",
    },
  },
};

// --------------------------------------------
// SECTION B — Small fetch helpers + caches
// --------------------------------------------
async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status, url };
    const data = await r.json();
    return { ok: true, data, url };
  } catch (e) {
    console.error("fetchJson fail:", url, e);
    return { ok: false, error: String(e), url };
  }
}

// Global caches (views rely on these)
const CACHE = {
  chars: [],                 // list of character objects
  relationships: null,       // full relationships JSON
  traitsMoods: null,         // traits/moods catalog JSON
  demo: null,                // demo module JSON
  diaryByPair: {},           // { "aerith:vagrant": diaryObj }
  statusByChar: {},          // { aerith: { body, mind } }
};

// expose for old debug snippets (kept intentionally)
window.__chars = CACHE.chars;
window.__relationships = CACHE.relationships;
window.__diaryByPair = CACHE.diaryByPair;

// --------------------------------------------
// SECTION C — Loaders
// --------------------------------------------
async function loadCharacters() {
  const results = await Promise.all(DATA.characters.map(fetchJson));
  const chars = results.filter(r => r.ok).map(r => r.data);
  CACHE.chars = chars;
  window.__chars = CACHE.chars;
}

async function loadRelationships() {
  const r = await fetchJson(DATA.relationships);
  if (r.ok) CACHE.relationships = r.data;
  window.__relationships = CACHE.relationships;
}

async function loadTraitsMoods() {
  const r = await fetchJson(DATA.traitsMoods);
  if (r.ok) CACHE.traitsMoods = r.data;
}

async function loadDemoModule() {
  const r = await fetchJson(DATA.demoModule);
  if (r.ok) CACHE.demo = r.data;
}

async function loadPairDiary(characterId, targetId) {
  const key = `${characterId}:${targetId}`;
  const url = DATA.diaries[key];
  if (!url) return;
  const diary = await loadDiary(url);
  CACHE.diaryByPair[key] = diary;
  window.__diaryByPair = CACHE.diaryByPair;
}

async function loadMindBody(charId) {
  const cfg = DATA.statusByChar[charId];
  if (!cfg) return;
  const [bodyR, mindR] = await Promise.all([
    fetchJson(cfg.body),
    fetchJson(cfg.mind),
  ]);
  CACHE.statusByChar[charId] = {
    body: bodyR.ok ? bodyR.data : {},
    mind: mindR.ok ? mindR.data : {},
  };
}

// --------------------------------------------
// SECTION D — Simple Router/Nav
// --------------------------------------------
function Nav() {
  const tabs = [
    ["#home", "Home"],
    ["#status", "Status"],
    ["#relationships", "Relationships"],
    ["#diary", "Diary"],
  ];
  const h1 = (loc) =>
    h("div", { class: "tabs" },
      tabs.map(([href, label]) =>
        h("a", {
          class: "tab" + (location.hash === href ? " active" : ""),
          href
        }, label)
      )
    );
  return h1();
}

function App() {
  const [rev, setRev] = useState(0);
  const route = (location.hash || "#home").toLowerCase();

  const re = () => setRev(v => v + 1);
  const diaryKey = "aerith:vagrant";
  const diary = CACHE.diaryByPair[diaryKey];

  // Fire-and-forget dev events (kept)
  window.emitGameEvent = (type, payload = {}) => {
    const pair = { characterId: "aerith", targetId: "vagrant" };
    if (!CACHE.diaryByPair[diaryKey]) return;

    switch (type) {
      case "interaction.firstKiss": {
        // path/stage come from your pair state in systems/diary.js
        const { getPairState } = await import("./js/systems/diary.js");
        const ps = getPairState("aerith", "vagrant");
        const text = selectEventLine(
          CACHE.diaryByPair[diaryKey],
          "first_kiss",
          ps.path,
          ps.stage
        );
        if (text) {
          appendDiaryEntry(CACHE.diaryByPair[diaryKey], {
            text: `[event:first_kiss ${ps.path} s${ps.stage}] ${text}`,
            path: ps.path,
            stage: ps.stage,
            tags: ["#event", `#with:${pair.targetId}`],
            mood: ["dizzy"]
          });
          re();
        }
        break;
      }

      default:
        console.warn("emitGameEvent: unhandled", type, payload);
    }
  };

  // Render per-route
  if (route === "#status") {
    return h("div", null, [
      h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
        h("div", { class: "stage-title" }, "Status & State"),
        h("div", { class: "subtitle" },
          "Overview: level, HP/MP, limit, mood, effects — plus Body/Mind & fertility dev tools."
        ),
        h(Nav, null),
      ])),
      h(StatusView, {
        chars: CACHE.chars || [],
        statusMap: CACHE.statusByChar || {},
        playerFemale: null,           // fertility sim disabled (as before)
        fertilityMap: null,
        Nav
      })
    ]);
  }

  if (route === "#relationships") {
    return h("div", null, [
      h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
        h("div", { class: "stage-title" }, "Relationships"),
        h(Nav, null)
      ])),
      h(RelationshipsView, {
        relationships: CACHE.relationships || {},
        chars: CACHE.chars || []
      })
    ]);
  }

  if (route === "#diary") {
    return h("div", null, [
      h(DiaryView, {
        diary,
        characterId: "aerith",
        targetId: "vagrant",
        Nav
      })
    ]);
  }

  // Home
  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "SIM Prototype — Start"),
      h("div", { class: "subtitle" }, "No-build demo (GitHub Pages · Preact ESM)"),
      h(Nav, null)
    ])),
    h(HomeView, {
      demo: CACHE.demo || {},
      chars: CACHE.chars || [],
      relationships: CACHE.relationships || {},
      traitsMoods: CACHE.traitsMoods || {}
    })
  ]);
}

// --------------------------------------------------
// SECTION E — Boot: load all data then mount app
// --------------------------------------------------
async function boot() {
  // load everything the views need (order doesn’t matter, but keep diaries last so it sees chars if needed)
  await Promise.all([
    loadCharacters(),
    loadRelationships(),
    loadTraitsMoods(),
    loadDemoModule(),
    loadMindBody("aerith"),
  ]);

  await loadPairDiary("aerith", "vagrant");

  // initial mount
  render(h(App, null), document.getElementById("app"));

  // re-render on hash change
  window.addEventListener("hashchange", () => {
    render(h(App, null), document.getElementById("app"));
  });
}

boot();
