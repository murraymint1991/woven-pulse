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
  getPairState,
  // ⬇ needed so we can fetch a path/stage-specific witness line from the diary JSON
  selectWitnessedLine,
} from "./js/systems/diary.js";

//// [SECTION 1: DATA FILE PATHS] /////////////////////////////////////////////

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
  diaryAerith: "data/diaries/aerith_diary_v1.json",
};

const LS_KEYS = { AUTOSAVE: "sim_autosave_v1", SLOT: (n) => `sim_slot_${n}_v1` };

//// [SECTION 2: ROOT APP COMPONENT] //////////////////////////////////////////

function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // ---------- Routing (includes #diary) ----------
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

  // ---------- Data state ----------
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

  // Saves + selection
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // ---------- Load saves ----------
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

  // ---------- Load all data files ----------
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

  //// [SECTION 3: CONTENT LOOKUP HELPERS] ////////////////////////////////////
  // These keep prose out of JS and pull it from the diary JSON.

  function _at(obj, keys) {
    // safely walk object by a list of keys; return [] if missing
    let cur = obj;
    for (const k of keys) {
      if (!cur || typeof cur !== "object" || !(k in cur)) return [];
      cur = cur[k];
    }
    return cur;
  }
  function _pick(listOrBuckets, path, stage) {
    if (!listOrBuckets) return null;

    // Bucketed by path: { love:[...], corruption:[...], hybrid:[...] }
    if (!Array.isArray(listOrBuckets) && typeof listOrBuckets === "object") {
      const lane = listOrBuckets[path] || listOrBuckets.any || [];
      const eligible = (Array.isArray(lane) ? lane : []).filter(e => (e.stageMin ?? 0) <= stage);
      return eligible.length ? eligible[Math.floor(Math.random()*eligible.length)].text : null;
    }
    // Flat list: [{stageMin, path?, text}, ...]
    const eligible = (listOrBuckets || []).filter(e =>
      (e.stageMin ?? 0) <= stage &&
      (e.path === "any" || e.path === path || !("path" in e))
    );
    return eligible.length ? eligible[Math.floor(Math.random()*eligible.length)].text : null;
  }
  function _line(diary, keys, path, stage) {
    const bucket = _at(diary.events || diary, keys);
    return _pick(bucket, path, stage);
  }
  function _fallback(text, pair, tags=[]) {
    return { text, path: pair.path, stage: pair.stage, tags, mood: [] };
  }

  //// [SECTION 4: GAME EVENT DISPATCH] ///////////////////////////////////////
  // Centralized handler used by the Diary dev panel and (later) by real systems.
  // If you ever need to add a new trigger, add a case here and map it to a
  // content bucket in the diary JSON.

  function emitGameEvent(type, payload = {}) {
    if (!diaryAerith) return;

    const pair = getPairState("aerith", "vagrant"); // { path, stage }
    const push = (entry) => appendDiaryEntry(diaryAerith, entry);

    // Try multiple buckets in order; push first hit
    const tryBuckets = (paths, tags=[]) => {
      for (const keys of paths) {
        const t = _line(diaryAerith, keys, pair.path, pair.stage);
        if (t) { push({ text: t, path: pair.path, stage: pair.stage, tags, mood: [] }); return true; }
      }
      return false;
    };

    switch (type) {
      /* ---- TIME ---- */
      case "time.morningTick": {
        if (!tryBuckets([["events","daily_life_simple"], ["events","daily_life_tainted"]], ["#time","#morning"])) {
          push(_fallback("[morning passes…]", pair, ["#time","#morning"]));
        }
        break;
      }

      /* ---- INTERACTIONS ---- */
      case "interaction.meet": {
        if (!tryBuckets([["events","intro"]], ["#interaction","#meet","#with:vagrant"])) {
          push(_fallback("We crossed paths in the slums; I told myself to keep walking… and still I looked back.", pair, ["#interaction"]));
        }
        break;
      }
      case "interaction.kiss": {
        if (!tryBuckets([["events","intimacy"]], ["#interaction","#kiss","#with:vagrant"])) {
          push(_fallback("His mouth tasted of smoke and rain. I should’ve pulled away. I leaned in instead.", pair, ["#interaction","#kiss"]));
        }
        break;
      }

      /* ---- LOCATIONS ---- */
      case "location.enter": {
        const place = String(payload.place || "slums").toLowerCase();
        if (!tryBuckets([["events","locations", place]], [`#location:${place}`,"#with:vagrant"])) {
          push(_fallback(`[entered ${place}]`, pair, [`#location:${place}`]));
        }
        break;
      }

      /* ---- ITEMS (Bloomstones, etc.) ---- */
      case "item.use": {
        const kind = payload.kind || "item";
        const id   = payload.id   || "";
        if (kind === "bloomstone" && id) {
          const ok = tryBuckets([["bloomstones", id]], ["#bloomstone", `#${id}`]);
          if (!ok) push(_fallback(`[used bloomstone:${id}]`, pair, ["#bloomstone",`#${id}`]));
        } else {
          push(_fallback(`[used ${kind}${id?":" + id:""}]`, pair, ["#item"]));
        }
        break;
      }

      /* ---- RISKY PLAY ---- */
      case "risky.alleyStealth": {
        if (!tryBuckets(
          [["events","risky_play","stealth"], ["events","risky_play","semi_public"], ["events","risky_play","public"]],
          ["#risky"]
        )) {
          push(_fallback("We moved like thieves in the alley—quiet, breath shared, pulse too loud.", pair, ["#risky"]));
        }
        break;
      }

      /* ---- WITNESS ---- */
      case "witness.seen": {
        const who = payload.who || "someone";
        const line = selectWitnessedLine(diaryAerith, "vagrant", who, pair.path, pair.stage);
        const text = line || `I caught ${who} watching us. Heat ran through me—and I didn’t look away.`;
        logWitnessed(diaryAerith, who, { text, path: pair.path, stage: pair.stage });
        break;
      }

      default: {
        // Visible breadcrumb if a button fires an unmapped event
        push(_fallback(`[event:${type}]`, pair, ["#event"]));
        break;
      }
    }
  }

  // Expose for the DEV panel in DiaryView (?dev=1)
  if (typeof window !== "undefined") {
    window.emitGameEvent = (type, payload) => emitGameEvent(type, payload);
  }

  //// [SECTION 5: SAVE/LOAD + SMALL HELPERS] /////////////////////////////////

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

  // ---------- Memos ----------
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

  //// [SECTION 6: NAV + ROUTES] //////////////////////////////////////////////

  const Nav = () =>
    h("div", { class: "menu", style:"margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap" }, [
      h(Button, { onClick: ()=>{ location.hash=""; setView("home"); }, ghost: view!=="home" }, "Home"),
      h(Button, { onClick: ()=>{ location.hash="#status"; setView("status"); }, ghost: view!=="status" }, "Status"),
      h(Button, { onClick: ()=>{ location.hash="#relationships"; setView("relationships"); }, ghost: view!=="relationships" }, "Relationships"),
      h(Button, { onClick: ()=>{ location.hash="#diary"; setView("diary"); }, ghost: view!=="diary" }, "Diary"),
    ]);

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

  // Final return (adds Diary route)
  return h("div",{class:"app"},
    view==="status" ? h(StatusView, { chars, statusMap, playerFemale, fertilityMap, Nav })
    : view==="relationships" ? h(RelationshipsView, { chars, edges, selected: selected || null, setSelected: setSelectedId, selectedAffinity, traitMap, sensCatalog, sensMap, sensRules, Nav })
    : view==="diary" ? h(DiaryView, { diary: diaryAerith, characterId: "aerith", targetId: "vagrant", witnesses:["tifa","renna","yuffie"], Nav })
    : h(Home)
  );
}

//// [SECTION 7: MOUNT] ///////////////////////////////////////////////////////

render(h(App), document.getElementById("app"));
