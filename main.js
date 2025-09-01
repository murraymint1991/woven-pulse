// main.js
import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

import { sleep, nowStamp, fetchJson, countScenesAnywhere } from "./js/utils.js";
import { Button, Badge, Dot } from "./js/ui.js";
import RelationshipsView from "./js/views/relationships.js";
import StatusView from "./js/views/status.js";
import { loadFertility } from "./js/systems/status.js";
import { loadAssignments as loadTraitAssignments } from "./js/systems/traits.js";
import {
  loadCatalog as loadSensCatalog,
  loadAssignments as loadSensAssignments,
  loadEvolution as loadSensEvolution
} from "./js/systems/sensitivities.js";
import DiaryView from "./js/views/diary.js";
import {
  loadDiary,
  appendDiaryEntry,
  logWitnessed,
  getPairState
} from "./js/systems/diary.js";

/* ---------- Config (DATA) ---------- */
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

  // Status pillar
  statusActors: "data/status/actors_v1.json",
  statusPlayerFemale: "data/status/player_female_v1.json",
  statusFertility: "data/status/fertility_v1.json",

  // Diary
  diaryAerith: "data/diaries/aerith_diary_v1.json"
};

const LS_KEYS = { AUTOSAVE: "sim_autosave_v1", SLOT: (n) => `sim_slot_${n}_v1` };

/* ---------- App ---------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // ROUTING (includes #diary)
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

  // DATA STATE
  const [traitsFound, setTraitsFound] = useState(false);
  const [chars, setChars] = useState([]);
  const [scenesCount, setScenesCount] = useState(0);
  const [details, setDetails] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);
  const [traitMap, setTraitMap] = useState({});
  const [sensCatalog, setSensCatalog] = useState({});
  const [sensMap, setSensMap] = useState({});
  const [sensRules, setSensRules] = useState([]);

  // Status pillar
  const [statusMap, setStatusMap] = useState({});
  const [playerFemale, setPlayerFemale] = useState(null);
  const [fertilityMap, setFertilityMap] = useState({});

  // Diary data
  const [diaryAerith, setDiaryAerith] = useState(null);

  // SAVES + selection
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // LOAD SAVES
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

  // LOAD DATA
  useEffect(() => {
    (async () => {
      const d = [];

      // Traits/moods
      const tm = await fetchJson(DATA.traitsMoods);
      if (tm.ok) {
        setTraitsFound(Boolean(tm.data?.traits && Object.keys(tm.data.traits).length));
        d.push({ label: "traits_moods/traits_moods_v1.json", status: "ok" });
      } else {
        d.push({ label: "traits_moods/traits_moods_v1.json", status: "err" });
      }

      // Characters
      const loaded = [];
      for (const path of DATA.characters) {
        const r = await fetchJson(path);
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
        } else {
          d.push({ label: `characters/${file}`, status: "err" });
        }
      }
      setChars(loaded);

      // Demo module
      const dm = await fetchJson(DATA.demoModule);
      if (dm.ok) { setScenesCount(countScenesAnywhere(dm.data)); d.push({ label: "demo/demo_module_v0_5.json", status: "ok" }); }
      else d.push({ label: "demo/demo_module_v0_5.json", status: "err" });

      // Relationships
      const rel = await fetchJson(DATA.relationships);
      if (rel.ok) { setEdgesRaw(Array.isArray(rel.data?.edges) ? rel.data.edges : []); d.push({ label: "relationships/relationships_v1.json", status: "ok" }); }
      else { setEdgesRaw([]); d.push({ label: "relationships/relationships_v1.json", status: "err" }); }

      // Traits assignments
      const ta = await loadTraitAssignments(DATA.traitAssignments);
      if (ta.ok) { setTraitMap(ta.map); d.push({ label: "traits/assignments_v1.json", status: "ok" }); }
      else { setTraitMap({}); d.push({ label: "traits/assignments_v1.json", status: "err" }); }

      // Sensitivities
      const sc = await fetchJson(DATA.sensCatalog); setSensCatalog(sc.ok ? (sc.data?.stimuli || {}) : {});
      d.push({ label: "sensitivities/catalog_v1.json", status: sc.ok ? "ok" : "err" });
      const sa = await fetchJson(DATA.sensAssignments); setSensMap(sa.ok ? (sa.data?.characters || {}) : {});
      d.push({ label: "sensitivities/assignments_v1.json", status: sa.ok ? "ok" : "err" });
      const sr = await fetchJson(DATA.sensEvolution); setSensRules(sr.ok ? (sr.data?.rules || []) : []);
      d.push({ label: "sensitivities/evolution_v1.json", status: sr.ok ? "ok" : "err" });

      // Diary (Aerith)
      const ad = await loadDiary(DATA.diaryAerith);
      setDiaryAerith(ad);
      d.push({ label: "diaries/aerith_diary_v1.json", status: ad ? "ok" : "err" });

      // Status pillar
      const st = await fetchJson(DATA.statusActors);
      setStatusMap(st.ok ? (st.data?.status || {}) : {});
      d.push({ label: "status/actors_v1.json", status: st.ok ? "ok" : "err" });

      const pf = await fetchJson(DATA.statusPlayerFemale);
      setPlayerFemale(pf.ok ? pf.data : null);
      d.push({ label: "status/player_female_v1.json", status: pf.ok ? "ok" : "err" });

      const fert = await loadFertility(DATA.statusFertility);
      setFertilityMap(fert);
      d.push({ label: "status/fertility_v1.json", status: Object.keys(fert).length ? "ok" : "err" });

      setDetails(d);
      await sleep(100);
      setLoading(false);
    })();
  }, []);

  // ---------- GAME EVENT DISPATCH (used by DEV buttons & future systems) ----------
  function emitGameEvent(type, payload = {}) {
    if (!diaryAerith) return;

    // Current Aerith↔Vagrant lane+stage
    const pair = getPairState("aerith", "vagrant"); // { path, stage }

    const push = (text, extra = {}) => {
      appendDiaryEntry(diaryAerith, {
        text,
        path: pair.path,
        stage: pair.stage,
        tags: extra.tags || [],
        mood: extra.mood || []
      });
    };

    switch (type) {
      case "meet":
        push("[meet] We crossed paths in the slums today. I shouldn’t care… but I do.", { tags:["#meet","#with:vagrant"], mood:["curious"] });
        break;

      case "first_kiss":
        push("[first_kiss] His lips tasted like ash and rain. I leaned in anyway.", { tags:["#kiss","#with:vagrant"], mood:["flutter"] });
        break;

      case "enter.tent":
        push("[location:tent] The canvas swallowed the night—and us with it.", { tags:["#location:tent","#with:vagrant"] });
        break;

      case "enter.inn":
        push("[location:inn] A door, a key, a breath held too long.", { tags:["#location:inn","#with:vagrant"] });
        break;

      case "item.bloomstone.sapphire":
        push("[bloomstone:sapphire] The hum made me obey before I thought.", { tags:["#bloomstone","#sapphire"] });
        break;

      case "risky.alley_stealth":
        push("[risky:alley] We moved like thieves, breath shared in the dark.", { tags:["#risky","#alley"] });
        break;

      case "time.morning_tick":
        push("[morning] I woke with his scent still clinging.", { tags:["#morning"], mood:["pensive"] });
        break;

      case "witness.tifa":
      case "witness.renna":
      case "witness.yuffie": {
        const id = type.split(".")[1];
        // Minimal witness log helper—reuses diary path+stage meta
        logWitnessed(diaryAerith, id, {
          text: `[witness:${id}] I saw something I can’t unsee.`,
          path: pair.path,
          stage: pair.stage
        });
        break;
      }

      default:
        push(`[event:${type}]`, { tags:["#event"] });
        break;
    }
  }

  // Expose for the DEV panel in DiaryView (?dev=1)
  if (typeof window !== "undefined") {
    window.emitGameEvent = (type, payload) => emitGameEvent(type, payload);
  }

  // HELPERS
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

  // MEMOS
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

  // NAV
  const Nav = () =>
    h("div", { class: "menu", style:"margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap" }, [
      h(Button, { onClick: ()=>{ location.hash=""; setView("home"); }, ghost: view!=="home" }, "Home"),
      h(Button, { onClick: ()=>{ location.hash="#status"; setView("status"); }, ghost: view!=="status" }, "Status"),
      h(Button, { onClick: ()=>{ location.hash="#relationships"; setView("relationships"); }, ghost: view!=="relationships" }, "Relationships"),
      h(Button, { onClick: ()=>{ location.hash="#diary"; setView("diary"); }, ghost: view!=="diary" }, "Diary"),
    ]);

  // HOME
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
            const url = `${location.origin}${location.pathname.replace(/index\.html$/,'')}data/${d.label}`;
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

  // FINAL RETURN (adds Diary route)
  return h("div",{class:"app"},
    view==="status" ? h(StatusView, { chars, statusMap, playerFemale, fertilityMap, Nav })
    : view==="relationships" ? h(RelationshipsView, { chars, edges, selected: selected || null, setSelected: setSelectedId, selectedAffinity, traitMap, sensCatalog, sensMap, sensRules, Nav })
    : view==="diary" ? h(DiaryView, { diary: diaryAerith, characterId: "aerith", targetId: "vagrant", witnesses:["tifa","renna","yuffie"], Nav })
    : h(Home)
  );
}

/* ---------- Mount ---------- */
render(h(App), document.getElementById("app"));
