import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

import { sleep, nowStamp, fetchJson, countScenesAnywhere } from "./js/utils.js";
import { Button, Badge, Dot } from "./js/ui.js";
import RelationshipsView from "./js/views/relationships.js";
import { loadAssignments as loadTraitAssignments } from "./js/systems/traits.js";
import { loadCatalog as loadSensCatalog, loadAssignments as loadSensAssignments, loadEvolution as loadSensEvolution } from "./js/systems/sensitivities.js";

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

  // NEW: sensitivities pillar
  sensCatalog: "data/sensitivities/catalog_v1.json",
  sensAssignments: "data/sensitivities/assignments_v1.json",
  sensEvolution: "data/sensitivities/evolution_v1.json"
};

const LS_KEYS = { AUTOSAVE: "sim_autosave_v1", SLOT: (n) => `sim_slot_${n}_v1` };

/* ---------- App ---------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [view, setView] = useState(() => location.hash === "#relationships" ? "relationships" : "home");

  // Data state
  const [traitsFound, setTraitsFound] = useState(false);
  const [chars, setChars] = useState([]);         // [{id, displayName, type, baseStats, portrait}]
  const [scenesCount, setScenesCount] = useState(0);
  const [details, setDetails] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);   // [{from,to,type,strength}]
  const [traitMap, setTraitMap] = useState({});   // { id -> { traits:[], sens:[] } }

  // NEW: sensitivities data
  const [sensCatalog, setSensCatalog] = useState({});   // { stim -> entry }
  const [sensMap, setSensMap] = useState({});           // { id -> { weights, caps? } }
  const [sensRules, setSensRules] = useState([]);       // evolution rules (unused yet)

  // Saves + selection
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Routing
  useEffect(() => {
    const onHash = () => setView(location.hash === "#relationships" ? "relationships" : "home");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load saves
  useEffect(() => {
    const next = [];
    for (let i=1;i<=20;i++){
      const raw = localStorage.getItem(LS_KEYS.SLOT(i));
      next.push(raw ? JSON.parse(raw) : null);
    }
    const autoRaw = localStorage.getItem(LS_KEYS.AUTOSAVE);
    setAutosaveMeta(autoRaw ? JSON.parse(autoRaw) : null);
    setSlots(next);
  }, []);

  useEffect(() => localStorage.setItem("sim_rel_value", String(relationship)), [relationship]);

  // Load data
  useEffect(() => {
    (async () => {
      const d = [];

      // Traits/Moods
      const tm = await fetchJson(DATA.traitsMoods);
      if (tm.ok) { setTraitsFound(Boolean(tm.data?.traits && Object.keys(tm.data.traits).length)); d.push({ label: "traits/traits_moods_v1.json", status: "ok" }); }
      else       { d.push({ label: "traits/traits_moods_v1.json", status: "err" }); }

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
        } else d.push({ label: `characters/${file}`, status: "err" });
      }
      setChars(loaded);

      // Demo module (scenes)
      const dm = await fetchJson(DATA.demoModule);
      if (dm.ok) { setScenesCount(countScenesAnywhere(dm.data)); d.push({ label: "demo/demo_module_v0_5.json", status: "ok" }); }
      else       { d.push({ label: "demo/demo_module_v0_5.json", status: "err" }); }

      // Relationships
      const rel = await fetchJson(DATA.relationships);
      if (rel.ok) { setEdgesRaw(Array.isArray(rel.data?.edges) ? rel.data.edges : []); d.push({ label: "relationships/relationships_v1.json", status: "ok" }); }
      else        { setEdgesRaw([]); d.push({ label: "relationships/relationships_v1.json", status: "err" }); }

      // Trait assignments (per-character)
      const ta = await loadTraitAssignments(DATA.traitAssignments);
      if (ta.ok) { setTraitMap(ta.map); d.push({ label: "traits/assignments_v1.json", status: "ok" }); }
      else       { setTraitMap({});     d.push({ label: "traits/assignments_v1.json", status: "err" }); }

      // Sensitivities pillar (NEW)
      const sc = await loadSensCatalog(DATA.sensCatalog);
      setSensCatalog(sc);
      d.push({ label: "sensitivities/catalog_v1.json", status: Object.keys(sc).length ? "ok" : "err" });

      const sa = await loadSensAssignments(DATA.sensAssignments);
      setSensMap(sa);
      d.push({ label: "sensitivities/assignments_v1.json", status: Object.keys(sa).length ? "ok" : "err" });

      const sr = await loadSensEvolution(DATA.sensEvolution);
      setSensRules(sr);
      d.push({ label: "sensitivities/evolution_v1.json", status: Array.isArray(sr) ? "ok" : "err" });

      setDetails(d);
      await sleep(120);
      setLoading(false);
    })();
  }, []);

  function flash(msg){ setToast(msg); setTimeout(()=>setToast(""), 1200) }

  function doAutosave(){
    const snapshot = {
      at: nowStamp(),
      rel: relationship,
      roster: chars.map(c=>c.id),
      info: { chars: chars.length, scenes: scenesCount, traits: traitsFound ? "yes":"no" }
    };
    localStorage.setItem(LS_KEYS.AUTOSAVE, JSON.stringify(snapshot));
    setAutosaveMeta(snapshot);
    flash("Autosaved.");
  }
  function doManualSave(){
    const payload = { at: nowStamp(), rel: relationship, note: "Manual" };
    const idx = (slots.findIndex(s=>s===null) + 20) % 20;
    const next = slots.slice(); next[idx] = payload;
    localStorage.setItem(LS_KEYS.SLOT(idx+1), JSON.stringify(payload));
    setSlots(next);
    flash(`Saved to Slot ${idx+1}.`);
  }
  function clearAllSaves(){
    localStorage.removeItem(LS_KEYS.AUTOSAVE);
    for (let i=1;i<=20;i++) localStorage.removeItem(LS_KEYS.SLOT(i));
    setAutosaveMeta(null);
    setSlots(Array.from({length:20},()=>null));
    flash("All save slots cleared.");
  }
  function clearCacheAndReload(){ clearAllSaves(); location.reload(); }

  const summaryText = useMemo(() => {
    const t = traitsFound ? "yes" : "no";
    return `${chars.length} char · ${scenesCount} scenes · traits: ${t}`;
  }, [chars.length, scenesCount, traitsFound]);

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

  // Shared nav
  const Nav = () => h("div", { class: "menu", style:"margin-bottom:8px" }, [
    h(Button, { onClick: ()=>{ location.hash=""; setView("home"); }, ghost: view!=="home" }, "Home"),
    h(Button, { onClick: ()=>{ location.hash="#relationships"; setView("relationships"); }, ghost: view!=="relationships" }, "Relationships")
  ]);

  // Home view (with clickable links)
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
            // If label already includes a subfolder (e.g. "sensitivities/assignments_v1.json"), use it directly.
            let subPath = d.label.includes("/") ? d.label : null;
            if (!subPath) {
              if (d.label.includes("relationships")) subPath = "relationships/" + d.label;
              else if (d.label.includes("demo_module")) subPath = "demo/" + d.label;
              else if (d.label.includes("traits_moods")) subPath = "traits/" + d.label;
              else if (d.label.includes("assignments")) subPath = "traits/" + d.label;
              else subPath = "characters/" + d.label;
            }
            const url = `${location.origin}${location.pathname.replace(/index\.html$/,'')}data/${subPath}`;
            const display = subPath.split("/").pop();
            return h("div",{class:"kv"}, [
              h(Dot,{ok:d.status==="ok"}),
              h("a",{href:url,target:"_blank",style:"margin-left:4px"}, display)
            ]);
          })
        ),
      ]),
      h("div",{class:"card"},[
        h("h3",null,"Saves"),
        h("div",{class:"kv"},[
          h(Button,{onClick:doAutosave},"Autosave"),
          h(Button,{onClick:doManualSave},"Manual Save"),
          h(Button,{ghost:true,onClick:clearAllSaves},"Clear All"),
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
        slots.map((s,i)=>
          h("div",{class:"slot",onClick:()=>setToast(`Load Slot ${i+1} (stub)`)},[
            h("div",null,`Slot ${i+1}`),
            h("div",{class:"meta"}, s ? `${s.note} · ${s.at}` : "empty")
          ])
        )
      )
    ]),

    h("div",{class:"savebar"},[
      h(Button,{onClick:doAutosave},"Autosave"),
      h(Button,{onClick:doManualSave},"Manual Save"),
      h(Button,{ghost:true,onClick:()=>{ clearCacheAndReload(); }},"Clear Cache & Reload"),
      toast ? h(Badge,null,toast) : null
    ])
  ]);

  return h("div",{class:"app"},
    view==="relationships"
      ? h(RelationshipsView, {
          chars,
          edges,
          selected: selected || null,
          setSelected: setSelectedId,
          selectedAffinity,
          traitMap,          // traits from data/traits/assignments_v1.json
          sensCatalog,       // NEW
          sensMap,           // NEW
          sensRules,         // NEW (unused for now)
          Nav
        })
      : h(Home)
  );
}

/* ---------- Mount ---------- */
render(h(App), document.getElementById("app"));
