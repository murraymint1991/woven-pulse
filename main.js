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
};

const LS_KEYS = {
  AUTOSAVE: "sim_autosave_v1",
  SLOT: (n) => `sim_slot_${n}_v1`,
  META: "sim_meta_v1",
};

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
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

// Count any arrays under keys named "scenes" (or similar)
function countScenesAnywhere(obj) {
  let count = 0;
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && k.toLowerCase().includes("scene")) {
        count += v.length;
      }
      walk(v);
    }
  }
  walk(obj);
  return count;
}

/* ---------- UI ---------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [dataInfo, setDataInfo] = useState({
    traitsFound: false,
    moodsFound: false,
    charsLoaded: 0,
    scenesLoaded: 0,
    details: [],
  });
  const [relationship, setRelationship] = useState(
    Number(localStorage.getItem("sim_rel_value")) || 0
  );
  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [toast, setToast] = useState("");

  // Load saves at boot
  useEffect(() => {
    const nextSlots = slots.slice();
    for (let i = 1; i <= 20; i++) {
      const raw = localStorage.getItem(LS_KEYS.SLOT(i));
      nextSlots[i - 1] = raw ? JSON.parse(raw) : null;
    }
    const autoRaw = localStorage.getItem(LS_KEYS.AUTOSAVE);
    setAutosaveMeta(autoRaw ? JSON.parse(autoRaw) : null);
    setSlots(nextSlots);
  }, []);

  // Load data files
  useEffect(() => {
    (async () => {
      const details = [];

      // Traits/Moods
      const tm = await fetchJson(DATA.traitsMoods);
      let traitsFound = false,
        moodsFound = false;
      if (tm.ok) {
        const obj = tm.data || {};
        traitsFound = Boolean(obj.traits && Object.keys(obj.traits).length);
        moodsFound = Boolean(obj.moods && Object.keys(obj.moods).length);
        details.push({ label: "traits_moods_v1.json", status: "ok" });
      } else {
        details.push({ label: "traits_moods_v1.json", status: "err" });
      }

      // Characters
      let charsLoaded = 0;
      for (const path of DATA.characters) {
        const r = await fetchJson(path);
        if (r.ok) {
          charsLoaded++;
          details.push({ label: path.split("/").pop(), status: "ok" });
        } else {
          details.push({ label: path.split("/").pop(), status: "err" });
        }
      }

      // Demo module (scenes)
      let scenesLoaded = 0;
      const dm = await fetchJson(DATA.demoModule);
      if (dm.ok) {
        scenesLoaded = countScenesAnywhere(dm.data);
        details.push({ label: "demo_module_v0_5.json", status: "ok" });
      } else {
        details.push({ label: "demo_module_v0_5.json", status: "err" });
      }

      setDataInfo({
        traitsFound,
        moodsFound,
        charsLoaded,
        scenesLoaded,
        details,
      });

      // tiny boot delay for nicer feel
      await sleep(150);
      setLoading(false);
    })();
  }, []);

  // Persist relationship locally (keeps state between reloads)
  useEffect(() => {
    localStorage.setItem("sim_rel_value", String(relationship));
  }, [relationship]);

  function doAutosave() {
    const snapshot = {
      at: nowStamp(),
      rel: relationship,
      info: {
        chars: dataInfo.charsLoaded,
        scenes: dataInfo.scenesLoaded,
        traits: dataInfo.traitsFound ? "yes" : "no",
      },
    };
    localStorage.setItem(LS_KEYS.AUTOSAVE, JSON.stringify(snapshot));
    setAutosaveMeta(snapshot);
    flash("Autosaved.");
  }

  function doManualSave() {
    const payload = {
      at: nowStamp(),
      rel: relationship,
      note: "Manual",
    };
    let idx = slots.findIndex((s) => s === null);
    if (idx === -1) idx = 19; // overwrite last if full
    const next = slots.slice();
    next[idx] = payload;
    localStorage.setItem(LS_KEYS.SLOT(idx + 1), JSON.stringify(payload));
    setSlots(next);
    flash(`Saved to Slot ${idx + 1}.`);
  }

  function clearAllSaves() {
    localStorage.removeItem(LS_KEYS.AUTOSAVE);
    for (let i = 1; i <= 20; i++) localStorage.removeItem(LS_KEYS.SLOT(i));
    setAutosaveMeta(null);
    setSlots(Array.from({ length: 20 }, () => null));
    flash("All save slots cleared.");
  }

  function clearCacheAndReload() {
    clearAllSaves();
    location.reload();
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1200);
  }

  const summaryText = useMemo(() => {
    const t = dataInfo.traitsFound ? "yes" : "no";
    return `${dataInfo.charsLoaded} char · ${dataInfo.scenesLoaded} scenes · traits: ${t}`;
  }, [dataInfo]);

  return h(
    "div",
    { class: "app" },
    h("div", { class: "hero" }, [
      h("div", { class: "hero-inner" }, [
        h("div", { class: "stage-title" }, "SIM Prototype — Start"),
        h(
          "div",
          { class: "subtitle" },
          "No-build demo (GitHub Pages · Preact ESM)"
        ),
        h("div", { class: "menu" }, [
          h("button", { class: "btn", onClick: () => flash("New Game → stub") }, "New Game"),
          h("button", { class: "btn ghost", onClick: () => flash("Continue → stub") }, "Continue"),
          h("button", { class: "btn ghost", onClick: () => flash("Options → stub") }, "Options"),
        ]),
      ]),
    ]),

    /* Data Import Card */
    h("div", { class: "grid" }, [
      h("div", { class: "card" }, [
        h("h3", null, "Data Import"),
        loading
          ? h("div", { class: "kv" }, "Loading data…")
          : h("div", { class: "kv" }, [
              h("span", { class: "badge" }, [
                h("span", {
                  class:
                    "data-dot " +
                    (dataInfo.charsLoaded === 4 ? "ok" : dataInfo.charsLoaded ? "" : "err"),
                }),
                summaryText,
              ]),
            ]),
        h(
          "div",
          { class: "small", style: "margin-top:8px" },
          "Place JSON files under /data/... — this card updates on refresh."
        ),
        h(
          "div",
          { class: "small", style: "margin-top:8px" },
          dataInfo.details.map((d) =>
            h(
              "div",
              { class: "kv" },
              h("span", {
                class:
                  "data-dot " + (d.status === "ok" ? "ok" : d.status === "err" ? "err" : ""),
              }),
              h("span", null, d.label)
            )
          )
        ),
      ]),

      /* Saves */
      h("div", { class: "card" }, [
        h("h3", null, "Saves"),
        h("div", { class: "kv" }, [
          h("button", { class: "btn", onClick: doAutosave }, "Autosave"),
          h("button", { class: "btn", onClick: doManualSave }, "Manual Save"),
          h("button", { class: "btn ghost", onClick: clearAllSaves }, "Clear All"),
        ]),
        autosaveMeta
          ? h(
              "div",
              { class: "kv" },
              h("div", { class: "badge" }, `Autosave · ${autosaveMeta.at} · rel ${autosaveMeta.rel}`)
            )
          : h("div", { class: "kv small" }, "No autosave yet."),
        h(
          "div",
          { class: "small" },
          "Slot clicks are stubs for now (load logic not wired yet)."
        ),
      ]),

      /* Optional tiny Choice card (proves interactivity) */
      h("div", { class: "card" }, [
        h("h3", null, "Choice (example)"),
        h("div", { class: "kv" }, `Relationship: ${relationship}`),
        h("div", { class: "kv" }, [
          h(
            "button",
            {
              class: "btn",
              onClick: () => {
                setRelationship((v) => v + 1);
                flash("+1 (kind)");
              },
            },
            "Be Kind (+1)"
          ),
          h(
            "button",
            {
              class: "btn ghost",
              onClick: () => {
                setRelationship((v) => v - 1);
                flash("-1 (tease)");
              },
            },
            "Tease (-1)"
          ),
        ]),
        h(
          "div",
          { class: "small" },
          "This is just a mock stat; autosave/slots capture its value."
        ),
      ]),
    ]),

    /* Slots list */
    h(
      "div",
      { class: "card", style: "margin-top:12px" },
      h("h3", null, "Manual Slots (20)"),
      h(
        "div",
        { class: "grid" },
        slots.map((s, i) =>
          h("div", { class: "slot", onClick: () => flash(`Load Slot ${i + 1} (stub)`) }, [
            h("div", null, `Slot ${i + 1}`),
            h("div", { class: "meta" }, s ? `${s.note} · ${s.at}` : "empty"),
          ])
        )
      )
    ),

    /* Bottom savebar for mobile convenience */
    h("div", { class: "savebar" }, [
      h("button", { class: "btn", onClick: doAutosave }, "Autosave"),
      h("button", { class: "btn", onClick: doManualSave }, "Manual Save"),
      h("button", { class: "btn ghost", onClick: clearCacheAndReload }, "Clear Cache & Reload"),
      toast ? h("span", { class: "badge" }, toast) : null,
    ])
  );
}

/* ---------- Mount ---------- */
render(h(App), document.getElementById("app"));
