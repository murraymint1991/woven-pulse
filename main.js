import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

/* ---------- Config ---------- */
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
  relationships: "data/relationships/relationships_v1.json"
};

const LS_KEYS = {
  AUTOSAVE: "sim_autosave_v1",
  SLOT: (n) => `sim_slot_${n}_v1`,
};

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, "0");
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
function countScenesAnywhere(obj) {
  let count = 0;
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && k.toLowerCase().includes("scene")) count += v.length;
      walk(v);
    }
  }
  walk(obj);
  return count;
}
function nameOf(id, arr){ return (arr.find(c=>c.id===id)?.displayName) || id }

/* ---------- Tiny UI helpers ---------- */
function Button(props){ return h("button",{class:"btn "+(props.ghost?"ghost":""),...props}) }
function Badge(props){ return h("span",{class:"badge",...props},props.children) }
function Dot({ok}){ return h("span",{class:"data-dot "+(ok===true?"ok":ok===false?"err":"")}) }

/* ---------- App ---------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [view, setView] = useState(() => location.hash === "#relationships" ? "relationships" : "home");

  // Data
  const [traitsFound, setTraitsFound] = useState(false);
  const [chars, setChars] = useState([]);         // [{id, displayName, type, baseStats}]
  const [scenesCount, setScenesCount] = useState(0);
  const [details, setDetails] = useState([]);
  const [edgesRaw, setEdgesRaw] = useState([]);   // [{from,to,type,strength}]

  // Example stat + saves
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);

  // Selection for detail sheet
  const [selectedId, setSelectedId] = useState(null);

  // Hash routing
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

  // Persist example stat
  useEffect(() => localStorage.setItem("sim_rel_value", String(relationship)), [relationship]);

  // Load data files
  useEffect(() => {
    (async () => {
      const d = [];

      // Traits/Moods
      const tm = await fetchJson(DATA.traitsMoods);
      if (tm.ok) {
        const obj = tm.data || {};
        const found = Boolean(obj.traits && Object.keys(obj.traits).length);
        setTraitsFound(found);
        d.push({ label: "traits_moods_v1.json", status: "ok" });
      } else d.push({ label: "traits_moods_v1.json", status: "err" });

      // Characters
      const loaded = [];
      for (const path of DATA.characters) {
        const r = await fetchJson(path);
        if (r.ok) {
          const c = r.data.character || {};
          loaded.push({
            id: c.id || path.split("/").pop().replace(".json",""),
            displayName: c.displayName || c.id || "Unknown",
            type: c.type || "Humanoid",
            portrait: c.portrait || "",
            baseStats: c.baseStats || {}
          });
          d.push({ label: path.split("/").pop(), status: "ok" });
        } else {
          d.push({ label: path.split("/").pop(), status: "err" });
        }
      }
      setChars(loaded);

      // Demo module (scenes)
      const dm = await fetchJson(DATA.demoModule);
      if (dm.ok) {
        setScenesCount(countScenesAnywhere(dm.data));
        d.push({ label: "demo_module_v0_5.json", status: "ok" });
      } else d.push({ label: "demo_module_v0_5.json", status: "err" });

      // Relationships (edges)
      const rel = await fetchJson(DATA.relationships);
      if (rel.ok) {
        setEdgesRaw(Array.isArray(rel.data.edges) ? rel.data.edges : []);
        d.push({ label: "relationships_v1.json", status: "ok" });
      } else {
        setEdgesRaw([]);
        d.push({ label: "relationships_v1.json", status: "err" });
      }

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

  // Filter edges to only include ones whose ids exist in current roster
  const edges = useMemo(() => {
    const idset = new Set(chars.map(c=>c.id));
    return edgesRaw.filter(e => idset.has(e.from) && idset.has(e.to));
  }, [edgesRaw, chars]);

  const selected = useMemo(() => chars.find(c=>c.id===selectedId) || null, [selectedId, chars]);
  const selectedAffinity = useMemo(() => {
    if (!selectedId) return 0;
    const rels = edges.filter(e => e.from === selectedId || e.to === selectedId);
    if (!rels.length) return 0;
    const avg = rels.reduce((s,e)=>s+(Number(e.strength)||0),0)/rels.length;
    return Math.round(avg);
  }, [edges, selectedId]);

  /* -------------------- Views -------------------- */
  const Nav = () => h("div", { class: "menu", style:"margin-bottom:8px" }, [
    h(Button, { onClick: ()=>{ location.hash=""; setView("home"); }, ghost: view!=="home" }, "Home"),
    h(Button, { onClick: ()=>{ location.hash="#relationships"; setView("relationships"); }, ghost: view!=="relationships" }, "Relationships")
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
        h("div",{class:"small",style:"margin-top:8px"},"Place JSON files under /data/... — this card updates on refresh."),
          h("div",{class:"small",style:"margin-top:8px"},
            details.map((d)=> {
              // Decide folder based on filename
              let sub = "data/";
              if (d.label.includes("relationships")) sub += "relationships/";
              else if (d.label.includes("demo_module")) sub += "demo/";
              else if (d.label.includes("traits_moods")) sub += "traits_moods/";
              else sub += "characters/";

              const url = `${location.origin}${location.pathname.replace(/index\.html$/,'')}${sub}${d.label}`;
              return h("div",{class:"kv"}, [
                h(Dot,{ok:d.status==="ok"}),
                h("a",{href:url,target:"_blank",style:"margin-left:4px"}, d.label)
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
          h(Button,{onClick:()=>{ setRelationship(v=>v+1); flash("+1 (kind)"); }},"Be Kind (+1)"),
          h(Button,{ghost:true,onClick:()=>{ setRelationship(v=>v-1); flash("-1 (tease)"); }},"Tease (-1)"),
        ]),
        h("div",{class:"small"},"This is just a mock stat; autosave/slots capture its value.")
      ])
    ]),

    h("div",{class:"card",style:"margin-top:12px"},[
      h("h3",null,"Manual Slots (20)"),
      h("div",{class:"grid"},
        slots.map((s,i)=>
          h("div",{class:"slot",onClick:()=>flash(`Load Slot ${i+1} (stub)`)},[
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

  const Relationships = () => h("div", null, [
    h("div", { class:"hero" }, h("div",{class:"hero-inner"},[
      h("div",{class:"stage-title"},"Relationships"),
      h("div",{class:"subtitle"},"Roster, quick links, and a starter web (data-driven)."),
      h(Nav, null)
    ])),

    // Roster grid (clickable)
    h("div",{class:"card"},[
      h("h3",null,`Roster (${chars.length})`),
      h("div",{class:"grid"},
        chars.map(c =>
          h("div",{class:"slot", onClick:()=>setSelectedId(c.id)},[
            h("div",null,c.displayName),
            h("div",{class:"meta"}, c.type)
          ])
        )
      )
    ]),

    // Web edges (from JSON)
    h("div",{class:"card",style:"margin-top:12px"},[
      h("h3",null,`Relationship Web (${edges.length})`),
      edges.length
        ? edges.map((e) => h("div",{class:"kv"},[
            h(Badge,null,e.type),
            h("b",null," "),
            h("span",null,`${nameOf(e.from,chars)} ↔ ${nameOf(e.to,chars)} (${e.strength})`)
          ]))
        : h("div",{class:"kv small"},"No edges yet.")
    ]),

    // Detail sheet (overlay)
    selected && h("div",{class:"overlay", onClick:()=>setSelectedId(null)},
      h("div",{class:"sheet", onClick:(e)=>e.stopPropagation()},[
        h("h3",null,selected.displayName),
        h("div",{class:"kv small"},`ID: ${selected.id} · Type: ${selected.type}`),
        h("div",{class:"kvgrid", style:"margin-top:8px"},[
          h("div",{class:"label"},"HP"),    h("div",{class:"value"}, selected.baseStats?.hp ?? "—"),
          h("div",{class:"label"},"MP"),    h("div",{class:"value"}, selected.baseStats?.mp ?? "—"),
          h("div",{class:"label"},"STR"),   h("div",{class:"value"}, selected.baseStats?.strength ?? "—"),
          h("div",{class:"label"},"MAG"),   h("div",{class:"value"}, selected.baseStats?.magic ?? "—"),
          h("div",{class:"label"},"DEF"),   h("div",{class:"value"}, selected.baseStats?.defense ?? "—"),
          h("div",{class:"label"},"SPD"),   h("div",{class:"value"}, selected.baseStats?.speed ?? "—"),
          h("div",{class:"label"},"LCK"),   h("div",{class:"value"}, selected.baseStats?.luck ?? "—")
        ]),
        h("div",{class:"kv",style:"margin-top:8px"},[
          h(Badge,null,`Affinity snapshot: ${selectedAffinity}`)
        ]),
        h("div",{class:"sheet-actions"},[
          h(Button,{onClick:()=>setSelectedId(null)},"Close"),
          h(Button,{ghost:true,onClick:()=>alert('Open profile screen (todo)')},"Open Profile")
        ])
      ])
    )
  ]);

  return h("div",{class:"app"}, view==="relationships" ? h(Relationships) : h(Home));
}

/* ---------- Mount ---------- */
render(h(App), document.getElementById("app"));
