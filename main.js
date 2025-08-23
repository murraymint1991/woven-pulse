import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

/* ---------- Config ---------- */
const DATA = {
  traitsMoods: "data/traits_moods/traits_moods_v1.json",
  characters: [
    // Keep this list in sync with your repo
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

/* ---------- Small components ---------- */
function Button(props){ return h("button",{class:"btn "+(props.ghost?"ghost":""),...props}) }
function Badge(props){ return h("span",{class:"badge",...props},props.children) }
function Dot({ok}){ return h("span",{class:"data-dot "+(ok===true?"ok":ok===false?"err":"")}) }

/* ---------- App ---------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [view, setView] = useState(() => location.hash === "#relationships" ? "relationships" : "home");

  // Data state
  const [traitsFound, setTraitsFound] = useState(false);
  const [chars, setChars] = useState([]); // [{id, displayName, type, portrait}]
  const [scenesCount, setScenesCount] = useState(0);
  const [details, setDetails] = useState([]);

  // Example stat + saves
  const [relationship, setRelationship] = useState(Number(localStorage.getItem("sim_rel_value")) || 0);
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);

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
    const idx = (slots.findIndex(s=>s===null) + 20) % 20; // first empty or 0
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

  /* ------- Relationship data (starter edges; replace with JSON later) ------- */
  const edges = useMemo(() => {
    // Define key-to-key pairs and a label (affinity)
    const raw = [
      ["cloud","tifa","bond"],
      ["renna","kaien","bond"],
      ["yuffie","aerith","ally"],
      ["barret","cloud","ally"],
      ["nanaki","cloud","ally"],
      ["marek_voss","the_fractured","serves"],
      ["don_corneo","tifa","antagonist"],
      ["beggar","vagrant","acquaintance"]
    ];
    // Keep pairs only if both characters exist
    const idset = new Set(chars.map(c=>c.id));
    return raw.filter(([a,b]) => idset.has(a) && idset.has(b));
  }, [chars]);

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

    // Data / Saves / Mock Choice
    h("div",{class:"grid"},[
      h("div",{class:"card"},[
        h("h3",null,"Data Import"),
        loading ? h("div",{class:"kv"},"Loading data…")
        : h("div",{class:"kv"}, h(Badge,null, [h(Dot,{ok:chars.length>0}), " ", summaryText])),
        h("div",{class:"small",style:"margin-top:8px"},"Place JSON files under /data/... — this card updates on refresh."),
        h("div",{class:"small",style:"margin-top:8px"},
          details.map((d)=>h("div",{class:"kv"}, h(Dot,{ok:d.status==="ok"}), h("span",null,d.label)))
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
      h("div",{class:"subtitle"},"Roster, quick links, and a starter web (placeholder)."),
      h(Nav, null)
    ])),

    // Roster grid
    h("div",{class:"card"},[
      h("h3",null,`Roster (${chars.length})`),
      h("div",{class:"grid"},
        chars.map(c =>
          h("div",{class:"slot"},[
            h("div",null,c.displayName),
            h("div",{class:"meta"}, c.type)
          ])
        )
      )
    ]),

    // Web edges (simple list for now)
    h("div",{class:"card",style:"margin-top:12px"},[
      h("h3",null,`Relationship Web (${edges.length})`),
      edges.length
        ? edges.map(([a,b,label]) => h("div",{class:"kv"},[
            h(Badge,null,label),
            h("b",null," "),
            h("span",null,`${nameOf(a,chars)} ↔ ${nameOf(b,chars)}`)
          ]))
        : h("div",{class:"kv small"},"No edges yet.")
    ])
  ]);

  function nameOf(id, arr){ return (arr.find(c=>c.id===id)?.displayName) || id }

  return h("div",{class:"app"}, view==="relationships" ? h(Relationships) : h(Home));
}

/* ---------- Mount ---------- */
render(h(App), document.getElementById("app"));
