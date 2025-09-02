// ===============================
// main.js  (pair-aware diaries) — hardened
// ===============================

import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

import { sleep, nowStamp, fetchJson, countScenesAnywhere } from "./js/utils.js";
import { Button, Badge, Dot } from "./js/ui.js";
import RelationshipsView from "./js/views/relationships.js";
import StatusView from "./js/views/status.js";

// ----- Status
import { loadFertility } from "./js/systems/status.js";

// ----- Traits
import { loadAssignments as loadTraitAssignments } from "./js/systems/traits.js";

// ----- Sensitivities
import {
  loadCatalog as loadSensCatalog,
  loadAssignments as loadSensAssignments,
  loadEvolution as loadSensEvolution
} from "./js/systems/sensitivities.js";

// ----- Diary
import DiaryView from "./js/views/diary.js";
import {
  loadDiary,
  appendDiaryEntry,
  logWitnessed,
  getPairState
} from "./js/systems/diary.js";

/* ==============================================================
   SECTION: BASE + URL HELPERS
   ============================================================== */
// Always produce an absolute URL under the current site root (eg. /woven-pulse/)
function assetUrl(relPath) {
  const rel = String(relPath || "");
  // If already absolute (http...), just return it
  if (/^https?:\/\//i.test(rel)) return rel;

  // Compute directory of current page
  //  - /woven-pulse/               → baseDir=/woven-pulse/
  //  - /woven-pulse/index.html     → baseDir=/woven-pulse/
  const { origin, pathname } = location;
  const baseDir = pathname.endsWith("/")
    ? pathname
    : pathname.replace(/[^/]+$/, "");
  const clean = rel.replace(/^\//, "");
  return origin + baseDir + clean;
}

function showDevBanner(msg) {
  const b = document.createElement("div");
  b.style.cssText = "position:fixed;left:8px;bottom:8px;max-width:92vw;padding:8px 10px;background:#220c;border:1px solid #f66;color:#fff;font:12px ui-monospace,monospace;z-index:9999;border-radius:8px";
  b.textContent = msg;
  document.body.appendChild(b);
}

/* ==============================================================
   SECTION: CONFIG (DATA PATHS)
   ============================================================== */
const DATA = {
  traitsMoods: "data/traits_moods/traits_moods_v1.json",
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
    "data/characters/vagrant.json"
  ],
  demoModule: "data/demo/demo_module_v0_5.json",
  relationships: "data/relationships/relationships_v1.json",
  traitAssignments: "data/traits/assignments_v1.json",
  sensCatalog: "data/sensitivities/catalog_v1.json",
  sensAssignments: "data/sensitivities/assignments_v1.json",
  sensEvolution: "data/sensitivities/evolution_v1.json",

  // ---------- Pair-specific diaries ----------
  diaries: {
    "aerith:vagrant": "data/diaries/aerith_vagrant_v1.json",
  },

  // (Optional) Status pillar files — comment these back in once you add the JSONs
  // statusActors:        "data/status/actors_v1.json",
  // statusPlayerFemale:  "data/status/player_female_v1.json",
  // statusFertility:     "data/status/fertility_v1.json",
};

const LS_KEYS = { AUTOSAVE: "sim_autosave_v1", SLOT: (n) => `sim_slot_${n}_v1` };

/* ==============================================================
   SECTION: HELPERS (PAIR → PATH)
   ============================================================== */
function pairKey(characterId, targetId){ return `${characterId}:${targetId}`; }
function getDiaryPath(characterId, targetId){
  return DATA.diaries[pairKey(characterId, targetId)] || null;
}

/* ==============================================================
   SECTION: APP
   ============================================================== */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // -------- ROUTING --------
  const [view, setView] = useState(() =>
    (location.hash === "#relationships") ? "relationships" :
    (location.hash === "#status")         ? "status" :
    (location.hash === "#diary")          ? "diary" :
                                            "home"
  );
  useEffect(() => {
    const onHash = () => setView(
      (location.hash === "#relationships") ? "relationships" :
      (location.hash === "#status")         ? "status" :
      (location.hash === "#diary")          ? "diary" :
                                              "home"
    );
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // -------- DATA STATE --------
  const [traitsFound, setTraitsFound] = useState(false);
  const [chars, setChars] = useState([]);
  const [scenesCount, setScenesCount] = useState(0);
  const [details, setDetails] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);
  const [traitMap, setTraitMap] = useState({});
  const [sensCatalog, setSensCatalog] = useState({});
  const [sensMap, setSensMap] = useState({});
  const [sensRules, setSensRules] = useState([]);

  // ----- Status pillar
  const [statusMap, setStatusMap] = useState({});
  const [playerFemale, setPlayerFemale] = useState(null);
  const [fertilityMap, setFertilityMap] = useState({});

  // ----- Pair selection (which diary to show)
  const [pair, setPair] = useState({ characterId: "aerith", targetId: "vagrant" });

  // ----- Diary cache: { "<char>:<target>": diaryObject }
  const [diaryByPair, setDiaryByPair] = useState({});

  // SAVES + selection
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // -------- LOAD SAVES --------
  useEffect(() => {
    const next = [];
    for (let i = 1; i <= 20; i++) {
      const raw = localStorage.getItem(LS_KEYS.SLOT(i));
      next.push(raw ? JSON.parse(raw) : null);
    }
    const autoRaw = localStorage.getItem(LS_KEYS.AUTOSAVE);
    setAutosaveMeta(autoRaw ? JSON.parse(autoRaw) : null);
    setSlots(next);
  }, []);
  useEffect(() => localStorage.setItem("sim_rel_value", String(relationship)), [relationship]);

  // -------- LOAD STATIC DATA (one time) --------
  useEffect(() => {
    (async () => {
      const d = [];

      // Traits/moods
      const tm = await fetchJson(assetUrl(DATA.traitsMoods));
      if (tm.ok) {
        setTraitsFound(Boolean(tm.data?.traits && Object.keys(tm.data.traits).length));
        d.push({ label: "traits_moods/traits_moods_v1.json", status: "ok" });
      } else d.push({ label: "traits_moods/traits_moods_v1.json", status: "err" });

      // Characters
      const loaded = [];
      for (const path of DATA.characters) {
        const r = await fetchJson(assetUrl(path));
        const file = path.split("/").pop();
        if (r.ok) {
          const c = r.data.character || {};
          loaded.push({
            id: c.id || file.replace(".json",""),
            displayName: c.displayName || c.id || "Unknown",
            type: c.type || "Humanoid",
            portrait: c.portrait || "",
            baseStats: c.baseStats || {}
          });
          d.push({ label: `characters/${file}`, status: "ok" });
        } else d.push({ label: `characters/${file}`, status: "err" });
      }
      setChars(loaded);

      // Demo module
      const dm = await fetchJson(assetUrl(DATA.demoModule));
      if (dm.ok) { setScenesCount(countScenesAnywhere(dm.data)); d.push({ label: "demo/demo_module_v0_5.json", status: "ok" }); }
      else d.push({ label: "demo/demo_module_v0_5.json", status: "err" });

      // Relationships
      const rel = await fetchJson(assetUrl(DATA.relationships));
      if (rel.ok) { setEdgesRaw(Array.isArray(rel.data?.edges) ? rel.data.edges : []); d.push({ label: "relationships/relationships_v1.json", status: "ok" }); }
      else { setEdgesRaw([]); d.push({ label: "relationships/relationships_v1.json", status: "err" }); }

      // Traits assignments
      const ta = await loadTraitAssignments(assetUrl(DATA.traitAssignments));
      if (ta.ok) { setTraitMap(ta.map); d.push({ label: "traits/assignments_v1.json", status: "ok" }); }
      else { setTraitMap({}); d.push({ label: "traits/assignments_v1.json", status: "err" }); }

      // Sensitivities
      const sc = await fetchJson(assetUrl(DATA.sensCatalog)); setSensCatalog(sc.ok ? (sc.data?.stimuli || {}) : {});
      d.push({ label: "sensitivities/catalog_v1.json", status: sc.ok ? "ok" : "err" });
      const sa = await fetchJson(assetUrl(DATA.sensAssignments)); setSensMap(sa.ok ? (sa.data?.characters || {}) : {});
      d.push({ label: "sensitivities/assignments_v1.json", status: sa.ok ? "ok" : "err" });
      const sr = await fetchJson(assetUrl(DATA.sensEvolution)); setSensRules(sr.ok ? (sr.data?.rules || []) : []);
      d.push({ label: "sensitivities/evolution_v1.json", status: sr.ok ? "ok" : "err" });

      // Status pillar (optional: only fetch if configured)
      if (DATA.statusActors) {
        const st = await fetchJson(assetUrl(DATA.statusActors));
        setStatusMap(st.ok ? (st.data?.status || {}) : {});
        d.push({ label: "status/actors_v1.json", status: st.ok ? "ok" : "err" });
      }
      if (DATA.statusPlayerFemale) {
        const pf = await fetchJson(assetUrl(DATA.statusPlayerFemale));
        setPlayerFemale(pf.ok ? pf.data : null);
        d.push({ label: "status/player_female_v1.json", status: pf.ok ? "ok" : "err" });
      }
      if (DATA.statusFertility) {
        const fert = await loadFertility(assetUrl(DATA.statusFertility));
        setFertilityMap(fert);
        d.push({ label: "status/fertility_v1.json", status: Object.keys(fert).length ? "ok" : "err" });
      }

      setDetails(d);
      await sleep(100);
      setLoading(false);
    })();
  }, []);

  // -------- LOAD/RESOLVE PAIR DIARY --------
  useEffect(() => {
    (async () => {
      const key = pairKey(pair.characterId, pair.targetId);
      if (diaryByPair[key]) return; // cached

      const relPath = getDiaryPath(pair.characterId, pair.targetId);
      if (!relPath) { console.warn("[Diary path missing]", { pair }); return; }

      // Build absolute URL + hard-bust cache
      const diaryUrl = assetUrl(relPath) + `?v=${Date.now()}`;
      
      // --- PROBE: fetch raw to surface the real reason if it fails ---
      try {
        const probe = await fetch(diaryUrl, { cache: "no-store" });
        const text = await probe.text();
        if (!probe.ok) {
          showDevBanner(`Diary HTTP ${probe.status}: ${diaryUrl}`);
          return;
        }
        try {
          JSON.parse(text);
        } catch (e) {
          showDevBanner(`Diary JSON error: ${String(e).slice(0,120)} …`);
          // Helpful in dev: preview first chars in the console
          console.log("[Diary probe preview]", text.slice(0, 500));
          return;
        }
      } catch (e) {
        showDevBanner(`Diary fetch threw: ${String(e)}`);
        return;
      }
      
      // If probe looks good, use the normal loader (it will normalize etc.)
      const diary = await loadDiary(diaryUrl);

      if (diary) {
        setDiaryByPair(prev => ({ ...prev, [key]: diary }));
        try {
          console.log("[Diary loaded]", {
            key,
            characterId: diary.characterId,
            targetId: diary.targetId,
            keys: Object.keys(diary || {}),
            entriesCount: Array.isArray(diary.entries) ? diary.entries.length : 0
          });
        } catch {}
      } else {
        console.warn("[Diary missing]", { key, path: diaryUrl });
        showDevBanner(`Diary failed to load: ${diaryUrl}`);
      }
    })();
  }, [pair, diaryByPair]);

  // =================================================================
  // SECTION: GAME EVENT DISPATCH
  // =================================================================
  function emitGameEvent(type, payload = {}) {
    const key = pairKey(pair.characterId, pair.targetId);
    const diary = diaryByPair[key];
    if (!diary) return;

    const ps = getPairState(pair.characterId, pair.targetId); // { path, stage }
    const push = (text, extra = {}) => {
      appendDiaryEntry(diary, {
        text,
        path: ps.path,
        stage: ps.stage,
        tags: extra.tags || [],
        mood: extra.mood || []
      });
    };

    switch (type) {
      case "interaction.meet":
        push("[We crossed paths in the slums; I told myself to keep walking… and still I looked back.]", { tags:["#interaction"] });
        break;
      case "interaction.firstKiss":
        push("[His mouth tasted of smoke and rain. I should’ve pulled away. I leaned in instead.]", { tags:["#interaction","#kiss"] });
        break;
      case "location.enter":
        push(`[entered ${payload.place || "somewhere"}]`, { tags:["#location"] });
        break;
      case "item.bloomstone.sapphire":
        push("[used item]", { tags:["#item","#bloomstone:sapphire"] });
        break;
      case "risky.alleyStealth":
        push("[We moved like thieves in the alley—quiet, breath shared, pulse too loud.]", { tags:["#risky"] });
        break;
      case "time.morningTick":
        push("[morning passes…]", { tags:["#time"] });
        break;
      case "witness.seen":
        logWitnessed(diary, payload.witness || "tifa", {
          text: "I caught someone watching us. Heat ran through me—and I didn’t look away.",
          path: ps.path,
          stage: ps.stage
        });
        break;
      default:
        push(`[event:${type}]`, { tags:["#event"] });
        break;
    }
  }

  // Expose for the DEV panel inside DiaryView
  if (typeof window !== "undefined") {
    window.emitGameEvent = (type, payload) => emitGameEvent(type, payload);
  }

  // -------- UI HELPERS --------
  function flash(msg){ setToast(msg); setTimeout(()=>setToast(""), 1200); }
  function doAutosave(){
    const snapshot = {
      at: nowStamp(),
      rel: relationship,
      roster: chars.map(c=>c.id),
      info: { chars: chars.length, scenes: scenesCount, traits: traitsFound ? "yes":"no" }
    };
    localStorage.setItem(LS_KEYS.AUTOSAVE, JSON.stringify(snapshot));
    setAutosaveMeta(snapshot); flash("Autosaved.");
  }
  function doManualSave(){
    const payload = { at: nowStamp(), rel: relationship, note: "Manual" };
    const idx = (slots.findIndex(s=>s===null) + 20) % 20;
    const next = slots.slice(); next[idx] = payload;
    localStorage.setItem(LS_KEYS.SLOT(idx+1), JSON.stringify(payload));
    setSlots(next); flash(`Saved to Slot ${idx+1}.`);
  }
  function clearAllSaves(){
    localStorage.removeItem(LS_KEYS.AUTOSAVE);
    for (let i=1;i<=20;i++) localStorage.removeItem(LS_KEYS.SLOT(i));
    setAutosaveMeta(null);
    setSlots(Array.from({length:20},()=>null));
    flash("All save slots cleared.");
  }
  function clearCacheAndReload(){ clearAllSaves(); location.reload(); }

  // -------- MEMOS --------
  const summaryText = useMemo(
    () => `${chars.length} char · ${scenesCount} scenes · traits: ${traitsFound ? "yes":"no"}`,
    [chars.length, scenesCount, traitsFound]
  );
  const edges = useMemo(() => {
    const idset = new Set(chars.map(c=>c.id));
    return edgesRaw.filter(e => idset.has(e.from) && idset.has(e.to));
  }, [edgesRaw, chars]);
  const selected  = useMemo(() => chars.find(c=>c.id===selectedId) || null, [selectedId, chars]);
  const selectedAffinity = useMemo(() => {
    if (!selectedId) return 0;
    const rels = edges.filter(e => e.from === selectedId || e.to === selectedId);
    if (!rels.length) return 0;
    const avg = rels.reduce((s,e)=>s+(Number(e.strength)||0),0)/rels.length;
    return Math.round(avg);
  }, [edges, selectedId]);

  // -------- NAV --------
  const Nav = () =>
    h("div", { class: "menu", style:"margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap" }, [
      h(Button, { onClick: ()=>{ location.hash=""; setView("home"); }, ghost: view!=="home" }, "Home"),
      h(Button, { onClick: ()=>{ location.hash="#status"; setView("status"); }, ghost: view!=="status" }, "Status"),
      h(Button, { onClick: ()=>{ location.hash="#relationships"; setView("relationships"); }, ghost: view!=="relationships" }, "Relationships"),
      h(Button, { onClick: ()=>{ location.hash="#diary"; setView("diary"); }, ghost: view!=="diary" }, "Diary"),
    ]);

  // -------- HOME --------
  const Home = () => h("div", null, [
    h("div", { class:"hero" }, h("div",{class:"hero-inner"},[
      h("div",{class:"stage-title"},"SIM Prototype — Start"),
      h("div",{class:"subtitle"},"No-build demo (GitHub Pages · Preact ESM)"),
      h(Nav, null)
    ])),
    h("div",{class:"grid"},[
      h("div",{class:"card"},[
        h("h3",null,"Data Import"),
        loading ? h("div",{class:"kv"},"Loading data…")
        : h("div",{class:"kv"}, h(Badge,null, [h(Dot,{ok:chars.length>0}), " ", summaryText])),
        h("div",{class:"small",style:"margin-top:8px"},"Files under /data/... — tap any to open raw JSON."),
        h("div",{class:"small",style:"margin-top:8px"},
          details.map((d)=> {
            // d.label is like "characters/tifa.json"
            const url = assetUrl(`data/${d.label}`);
            return h("div",{class:"kv"}, [ h(Dot,{ok:d.status==="ok"}), h("a",{href:url,target:"_blank",style:"margin-left:4px"}, d.label) ]);
          })
        ),
      ]),
      h("div",{class:"card"},[
        h("h3",null,"Saves"),
        h("div",{class:"kv"},[
          h(Button,{onClick:doAutosave},"Autosave"),
          h(Button,{onClick:doManualSave},"Manual Save"),
          h(Button,{ghost:true,onClick:clearAllSaves},"Clear All")
        ]),
        autosaveMeta
          ? h("div",{class:"kv"}, h(Badge,null,`Autosave · ${autosaveMeta.at} · rel ${autosaveMeta.rel}`))
          : h("div",{class:"kv small"},"No autosave yet."),
        h("div",{class:"small"},"Slot clicks are stubs for now (load logic not wired yet).")
      ]),
      h("div",{class:"card"},[
        h("h3",null,"Choice (example)"),
        h("div",{class:"kv"},`Relationship: ${relationship}`),
        h("div",{class:"kv"},[
          h(Button,{onClick:()=>{ setRelationship(v=>v+1); setToast("+1 (kind)"); setTimeout(()=>setToast(""), 1200); }},"Be Kind (+1)"),
          h(Button,{ghost:true,onClick:()=>{ setRelationship(v=>v-1); setToast("-1 (tease)"); setTimeout(()=>setToast(""), 1200); }},"Tease (-1)")
        ]),
        h("div",{class:"small"},"This is just a mock stat; autosave/slots capture its value.")
      ])
    ]),
    h("div",{class:"card",style:"margin-top:12px"},[
      h("h3",null,"Manual Slots (20)"),
      h("div",{class:"grid"},
        slots.map((s,i)=> h("div",{class:"slot",onClick:()=>setToast(`Load Slot ${i+1} (stub)`)},[
          h("div",null,`Slot ${i+1}`),
          h("div",{class:"meta"}, s ? `${s.note} · ${s.at}` : "empty")
        ]))
      )
    ]),
    h("div",{class:"savebar"},[
      h(Button,{onClick:doAutosave},"Autosave"),
      h(Button,{onClick:doManualSave},"Manual Save"),
      h(Button,{ghost:true,onClick:()=>{ clearCacheAndReload(); }},"Clear Cache & Reload"),
      toast ? h(Badge,null,toast) : null
    ])
  ]);

  // -------- CURRENT DIARY (derived) --------
  const currentDiary = diaryByPair[pairKey(pair.characterId, pair.targetId)] || null;

  // -------- PAIR PICKER (dev UI) --------
  const PairPicker = () => h("div", { class:"kv", style:"gap:6px; flex-wrap:wrap" }, [
    h(Badge,null,`Actor: ${pair.characterId}`),
    h(Badge,null,`Target: ${pair.targetId}`),
    h(Button,{ghost:true,onClick:()=>setPair({characterId:"aerith",targetId:"vagrant"})},"AERITH ↔ VAGRANT"),
  ]);


  // -------- DEV STRIP (Diary local seeding) --------
  const DiaryDevStrip = () => {
    return h("div", { class:"kv", style:"gap:6px; flex-wrap:wrap; margin: 8px 0" }, [
      h(Button, {
        onClick: () => {
          const key = pairKey(pair.characterId, pair.targetId);
          const d = diaryByPair[key];
          if (!d) return;
          const ps = getPairState(pair.characterId, pair.targetId);
          appendDiaryEntry(d, {
            text: "[test] dev seeded entry",
            path: ps.path,
            stage: ps.stage,
            tags:["#dev"]
          });
          setDiaryByPair(prev => ({ ...prev })); // force re-render
        }
      }, "Seed Test Entry"),
      h(Button, {
        ghost:true,
        onClick: () => {
          const key = pairKey(pair.characterId, pair.targetId);
          const d = diaryByPair[key];
          if (!d) return;
          d.entries = [];
          setDiaryByPair(prev => ({ ...prev }));
        }
      }, "Clear Entries")
    ]);
  };

  // -------- FINAL RETURN (routes) --------
  return h("div",{class:"app"},
    view==="status" ? h(StatusView, { chars, statusMap, playerFemale, fertilityMap, Nav })
    : view==="relationships" ? h(RelationshipsView, { chars, edges, selected: selected || null, setSelected: setSelectedId, selectedAffinity, traitMap, sensCatalog, sensMap, sensRules, Nav })
    : view==="diary" ? h("div", null, [
        h("div",{class:"hero"}, h("div",{class:"hero-inner"},[
          h("div",{class:"stage-title"},"Diary · Pair"),
          h(Nav, null),
          h(PairPicker, null)
        ])),
        h(DiaryDevStrip, null),
        h(DiaryView, {
          diary: currentDiary,
          characterId: pair.characterId,
          targetId: pair.targetId,
          witnesses:["tifa","renna","yuffie"],
          Nav
        })
      ])
    : h(Home)
  );
}

/* ==============================================================
   SECTION: MOUNT
   ============================================================== */
render(h(App), document.getElementById("app"));
