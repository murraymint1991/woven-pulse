// ===============================
// main.js  (pair-aware diaries) — Status (Mind/Body) + fertility placeholders
// ===============================

import { h, render } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";

import { sleep, nowStamp, fetchJson, countScenesAnywhere } from "./js/utils.js";
import { Button, Badge, Dot } from "./js/ui.js";
import RelationshipsView from "./js/views/relationships.js";
import StatusView from "./js/views/status.js";
import {
  DiaryIndexSchema,
  DesiresSchema,
  WitnessedSchema,
  EventFileSchema,
  validateUrl,
  // NEW:
  CharacterFileSchema,
  RelationshipsFileSchema,
  StatusLooseSchema,
  countNumericOutOfRange,
  validateUrlPlus
} from "./js/validation.js";

//----- Relationships
import { TIERS, NEUTRAL_IDX, addSlow, decay } from "./js/systems/relationships.js";

// ----- Traits
import { loadAssignments as loadTraitAssignments } from "./js/systems/traits.js";

// ----- Sensitivities
import {
  loadCatalog as loadSensCatalog,     // (kept for parity if you later use)
  loadAssignments as loadSensAssignments,
  loadEvolution as loadSensEvolution
} from "./js/systems/sensitivities.js";

// ----- Diary
import DiaryView from "./js/views/diary.js";
import {
  loadDiary,
  appendDiaryEntry,
  logWitnessed,
  getPairState,
  selectEventLine
} from "./js/systems/diary.js";

/* ============================================================== */
/* BASE + URL HELPERS                                             */
/* ============================================================== */
function assetUrl(relPath) {
  const rel = String(relPath || "");
  if (/^https?:\/\//i.test(rel)) return rel; // already absolute
  const { origin, pathname } = location;
  const baseDir = pathname.endsWith("/") ? pathname : pathname.replace(/[^/]+$/, "");
  return origin + baseDir + rel.replace(/^\//, "");
}

function showDevBanner(msg) {
  const b = document.createElement("div");
  b.style.cssText =
    "position:fixed;left:8px;bottom:8px;max-width:92vw;padding:8px 10px;background:#220c;border:1px solid #f66;color:#fff;font:12px ui-monospace,monospace;z-index:9999;border-radius:8px";
  b.textContent = msg;
  document.body.appendChild(b);
}

/* ============================================================== */
/* CONFIG (DATA PATHS)  ←— DATA MAP                               */
/* ============================================================== */
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

  // Pair-specific diary files
  diaries: {
    "aerith:vagrant": "data/diaries/aerith_vagrant/index.json"
  },

  // Status files by character (mind/body)
  statusByChar: {
    aerith: {
      mind: "data/status/aerith/mind_v1.json",
      body: "data/status/aerith/body_v1.json"
    }
  }
};

const LS_KEYS = { AUTOSAVE: "sim_autosave_v1", SLOT: (n) => `sim_slot_${n}_v1` };

/* ============================================================== */
/* HELPERS (PAIR → PATH)                                          */
/* ============================================================== */
const pairKey = (characterId, targetId) => `${characterId}:${targetId}`;
const getDiaryPath = (characterId, targetId) =>
  DATA.diaries[pairKey(characterId, targetId)] || null;

/* ============================================================== */
/* APP                                                            */
/* ============================================================== */
function App() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // -------- ROUTING --------
  const [view, setView] = useState(() =>
    location.hash === "#relationships"
      ? "relationships"
      : location.hash === "#status"
      ? "status"
      : location.hash === "#diary"
      ? "diary"
      : "home"
  );
  useEffect(() => {
    const onHash = () =>
      setView(
        location.hash === "#relationships"
          ? "relationships"
          : location.hash === "#status"
          ? "status"
          : location.hash === "#diary"
          ? "diary"
          : "home"
      );
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
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

  // status (mind/body) by character → { aerith: { mind, body } }
  const [statusMap, setStatusMap] = useState({});

  // NEW — fertility globals (placeholders; wire real files later)
  const [playerFemale, setPlayerFemale] = useState(null);
  const [fertilityMap, setFertilityMap] = useState(null);

  // Pair/diary cache
  const [pair, setPair] = useState({ characterId: "aerith", targetId: "vagrant" });
  const [diaryByPair, setDiaryByPair] = useState({});

  const [slots, setSlots] = useState(Array.from({ length: 20 }, () => null));
  const [autosaveMeta, setAutosaveMeta] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  
  // One-off flags per pair, e.g. { "aerith:vagrant": { firstKiss: true } }
  const [pairFlags, setPairFlags] = useState({});
  
  function getFlag(pairId, key) {
    return Boolean(pairFlags?.[pairId]?.[key]);
  }
  
  function setFlag(pairId, key, val = true) {
    setPairFlags(prev => ({
      ...prev,
      [pairId]: { ...(prev[pairId] || {}), [key]: !!val }
    }));
  }
function canScore(pid, key, days = 1) {
  const v = pairFlags?.[pid]?.[key];
  if (!v) return true;
  const lastDay = Number(v.lastDay || -999);
  return (day - lastDay) >= days;
}
function stampScore(pid, key) {
  setPairFlags(prev => ({
    ...prev,
    [pid]: { ...(prev[pid] || {}), [key]: { lastDay: day } }
  }));
}
// per-pair: { "aerith:vagrant": { tier: idx, score: 0..100, lastDay, lastGainDay, gainedToday } }
const [pairRel, setPairRel] = useState({});
function getPairRel(pid) { return pairRel[pid] || { tier: NEUTRAL_IDX, score: 0, lastDay: day }; }
function setPairRelState(pid, next) {
  setPairRel(prev => ({ ...prev, [pid]: (typeof next === "function" ? next(getPairRel(pid)) : next) }));
}

// Apply a change where basePercent > 0 moves toward better tiers, < 0 toward worse.
function addRelationshipSlow(pid, basePercent = 10, opts = {}) {
  setPairRelState(pid, (cur) =>
    addSlow(cur, basePercent, {
      day,
      stiffness: opts.stiffness ?? 1.3,
      dailyCap: opts.dailyCap ?? 30,
      gateCheck: (flag) => getFlag(pid, flag),
      NEUTRAL: NEUTRAL_IDX
    })
  );
}

function applyDailyDecay(pid, days = 1) {
  setPairRelState(pid, (cur) =>
    decay(cur, days, { day, NEUTRAL: NEUTRAL_IDX })
  );
}

  // Health Checker
  const [health, setHealth] = useState([]);
  const [healthRunning, setHealthRunning] = useState(false);


  // -------- LOAD SAVES --------
  useEffect(() => {
    const next = [];
    for (let i = 1; i <= 20; i++) {
      const raw = localStorage.getItem(LS_KEYS.SLOT(i));
      next.push(raw ? JSON.parse(raw) : null);
    }
      const autoRaw = localStorage.getItem(LS_KEYS.AUTOSAVE);
      setAutosaveMeta(autoRaw ? JSON.parse(autoRaw) : null);
      
      try {
        const auto = autoRaw ? JSON.parse(autoRaw) : null;
        if (auto) {
          if (auto.pairRel)   setPairRel(auto.pairRel);
          if (auto.pairFlags) setPairFlags(auto.pairFlags);
          if (auto.pair)      setPair(auto.pair);
          if (typeof auto.day === "number") setDay(auto.day);
        }
      } catch {}
      
      setSlots(next);

  }, []);

  /* ============================================================== */
  /* LOAD STATIC DATA  ←— status (mind/body) load happens here      */
  /* ============================================================== */
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
            id: c.id || file.replace(".json", ""),
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
      if (dm.ok) {
        setScenesCount(countScenesAnywhere(dm.data));
        d.push({ label: "demo/demo_module_v0_5.json", status: "ok" });
      } else d.push({ label: "demo/demo_module_v0_5.json", status: "err" });

      // Relationships
      const rel = await fetchJson(assetUrl(DATA.relationships));
      if (rel.ok) {
        setEdgesRaw(Array.isArray(rel.data?.edges) ? rel.data.edges : []);
        d.push({ label: "relationships/relationships_v1.json", status: "ok" });
      } else {
        setEdgesRaw([]);
        d.push({ label: "relationships/relationships_v1.json", status: "err" });
      }

      // Traits assignments
      const ta = await loadTraitAssignments(assetUrl(DATA.traitAssignments));
      if (ta.ok) {
        setTraitMap(ta.map);
        d.push({ label: "traits/assignments_v1.json", status: "ok" });
      } else {
        setTraitMap({}); d.push({ label: "traits/assignments_v1.json", status: "err" });
      }

      // Sensitivities
      const sc = await fetchJson(assetUrl(DATA.sensCatalog));
      setSensCatalog(sc.ok ? sc.data?.stimuli || {} : {});
      d.push({ label: "sensitivities/catalog_v1.json", status: sc.ok ? "ok" : "err" });

      const sa = await fetchJson(assetUrl(DATA.sensAssignments));
      setSensMap(sa.ok ? sa.data?.characters || {} : {});
      d.push({ label: "sensitivities/assignments_v1.json", status: sa.ok ? "ok" : "err" });

      const sr = await fetchJson(assetUrl(DATA.sensEvolution));
      setSensRules(sr.ok ? sr.data?.rules || [] : []);
      d.push({ label: "sensitivities/evolution_v1.json", status: sr.ok ? "ok" : "err" });

      // ===== NEW: load Aerith status (mind/body) =====
      if (DATA.statusByChar?.aerith) {
        const [mindRes, bodyRes] = await Promise.all([
          fetchJson(assetUrl(DATA.statusByChar.aerith.mind)),
          fetchJson(assetUrl(DATA.statusByChar.aerith.body))
        ]);
        const mind = mindRes.ok ? (mindRes.data?.mind || mindRes.data || {}) : {};
        const body = bodyRes.ok ? (bodyRes.data?.body || bodyRes.data || {}) : {};
        setStatusMap((prev) => ({ ...prev, aerith: { mind, body } }));

        // export to window for quick console inspection
        if (typeof window !== "undefined") {
          window.__statusMap = window.__statusMap || {};
          window.__statusMap.aerith = { mind, body };
        }

        d.push({
          label: "status/aerith/mind_v1.json",
          status: Object.keys(mind).length ? "ok" : "err"
        });
        d.push({
          label: "status/aerith/body_v1.json",
          status: Object.keys(body).length ? "ok" : "err"
        });

        // (Optional) demo-enable fertility widgets; remove when real files are used
        // setPlayerFemale({ cycleLength: 28, luteal: 12 });
        // setFertilityMap({ aerith: { visible: true, cycleStartDay: 12 } });
      }
      // ===============================================

      setDetails(d);
      await sleep(100);
      setLoading(false);
    })();
  }, []);

  /* ============================================================== */
  /* LOAD / RESOLVE PAIR DIARY                                      */
  /* ============================================================== */
  useEffect(() => {
    (async () => {
      const key = pairKey(pair.characterId, pair.targetId);
      if (diaryByPair[key]) return; // cached

      const relPath = getDiaryPath(pair.characterId, pair.targetId);
      if (!relPath) {
        console.warn("[Diary path missing]", { pair });
        return;
      }

      const diaryUrl = assetUrl(relPath) + `?v=${Date.now()}`;

      // Probe for clear errors (helps on mobile)
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
          showDevBanner(`Diary JSON error: ${String(e).slice(0, 120)} …`);
          console.log("[Diary probe preview]", text.slice(0, 500));
          return;
        }
      } catch (e) {
        showDevBanner(`Diary fetch threw: ${String(e)}`);
        return;
      }

      const diary = await loadDiary(diaryUrl);
      if (diary) {
        setDiaryByPair((prev) => ({ ...prev, [key]: diary }));
        if (typeof window !== "undefined") {
          window.__diaryByPair = window.__diaryByPair || {};
          window.__diaryByPair[key] = diary;
        }
        console.log("[Diary loaded]", {
          key,
          characterId: diary.characterId,
          targetId: diary.targetId,
          keys: Object.keys(diary || {}),
          entriesCount: Array.isArray(diary.entries) ? diary.entries.length : 0
        });
      } else {
        console.warn("[Diary missing]", { key, path: diaryUrl });
        showDevBanner(`Diary failed to load: ${diaryUrl}`);
      }
    })();
  }, [pair, diaryByPair]);

  // =================================================================
  // GAME EVENT DISPATCH (used by DiaryView dev buttons)
  // =================================================================
  function emitGameEvent(type, payload = {}) {
    setLastEvent(type);
    const key = pairKey(pair.characterId, pair.targetId);
    const diary = diaryByPair[key];
    if (!diary) return;
    const ps = getPairState(pair.characterId, pair.targetId);

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
        push(
          "[We crossed paths in the slums; I told myself to keep walking… and still I looked back.]",
          { tags: ["#interaction"] }
        );
        break;

      case "interaction.firstKiss": {
        const pairId = pairKey(pair.characterId, pair.targetId);
      
        // already happened? -> soft echo only, no score
        if (getFlag(pairId, "firstKiss")) {
          appendDiaryEntry(diary, {
            text: "[We stole another quick kiss—sweet, familiar, and somehow braver than before.]",
            path: ps.path,     // use ps here (defined at top of emitGameEvent)
            stage: ps.stage,
            mood: ["warm"],
            tags: ["#event:first_kiss:repeat", `#with:${pair.targetId}`]
          });
          break;
        }
      
        // first time
        const ps2 = getPairState(pair.characterId, pair.targetId);
        const line =
          selectEventLine(diary, "first_kiss", ps2.path, ps2.stage) ||
          (diary?.events?.first_kiss?.[ps2.path] || []).slice(-1)[0] ||
          null;
      
        appendDiaryEntry(diary, {
          text: line || "[dev] no first-kiss line found",
          path: ps2.path,
          stage: ps2.stage,
          mood: ["fluttered"],
          tags: ["#event:first_kiss", `#with:${pair.targetId}`]
        });
      
        setFlag(pairId, "firstKiss", true);
        addRelationshipSlow(pairId, 18); // forward slow-burn gain (tuned)
        break;
      }

      case "location.enter":
        push(`[entered ${payload.place || "somewhere"}]`, { tags: ["#location"] });
        break;

      case "item.bloomstone.sapphire":
        push("[used item]", { tags: ["#item", "#bloomstone:sapphire"] });
        break;

      case "risky.alleyStealth":
        push("[We moved like thieves in the alley—quiet, breath shared, pulse too loud.]", {
          tags: ["#risky"]
        });
        break;

      case "time.morningTick":
        push("[morning passes…]", { tags: ["#time"] });
        break;

      case "witness.seen":
        logWitnessed(diary, payload.witness || "tifa", {
          text:
            "I caught someone watching us. Heat ran through me—and I didn’t look away.",
          path: ps.path,
          stage: ps.stage
        });
        break;

    default:
      push(`[event:${type}]`, { tags: ["#event"] });
      break;
  }
  
  // ➜ force re-render so diary entries appear immediately
  setDiaryByPair(prev => ({ ...prev }));
}
if (typeof window !== "undefined") window.emitGameEvent = (t, p) => emitGameEvent(t, p);

  // -------- UI HELPERS --------
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1200);
  };
// Autosave
const doAutosave = () => {
  // compute headline from current pairRel
  const pid = `${pair.characterId}:${pair.targetId}`;
  const pr  = getPairRel(pid);
  const headline = { pairId: pid, tier: TIERS[pr.tier]?.id || "neutral", score: pr.score };

  const snapshot = {
    at: nowStamp(),
    rel: headline,          // headline summary (replaces old single number)
    pairRel,                // tier/score map
    pairFlags,              // once-only / per-day gates
    pair,                   // current pair
    day,                    // current sim day
    roster: chars.map(c => c.id),
    info: { chars: chars.length, scenes: scenesCount, traits: traitsFound ? "yes" : "no" }
  };

  localStorage.setItem(LS_KEYS.AUTOSAVE, JSON.stringify(snapshot));
  setAutosaveMeta(snapshot);
  flash("Autosaved.");
};
// Manual save
const doManualSave = () => {
  // compute headline from current pairRel
  const pid = `${pair.characterId}:${pair.targetId}`;
  const pr  = getPairRel(pid);
  const headline = { pairId: pid, tier: TIERS[pr.tier]?.id || "neutral", score: pr.score };

  const payload = { at: nowStamp(), rel: headline, note: "Manual" };
  const idx = (slots.findIndex(s => s === null) + 20) % 20;
  const next = slots.slice();
  next[idx] = payload;

  localStorage.setItem(LS_KEYS.SLOT(idx + 1), JSON.stringify(payload));
  setSlots(next);
  flash(`Saved to Slot ${idx + 1}.`);
  };
  const restoreAutosave = () => {
  const raw = localStorage.getItem(LS_KEYS.AUTOSAVE);
  if (!raw) return flash("No autosave found.");
  try {
    const auto = JSON.parse(raw);
    if (auto.pairRel)   setPairRel(auto.pairRel);
    if (auto.pairFlags) setPairFlags(auto.pairFlags);
    if (auto.pair)      setPair(auto.pair);
    if (typeof auto.day === "number") setDay(auto.day);
    setAutosaveMeta(auto);
    flash("Autosave restored.");
  } catch {
    flash("Autosave was corrupted.");
  }
};
  const clearAllSaves = () => {
    localStorage.removeItem(LS_KEYS.AUTOSAVE);
    for (let i = 1; i <= 20; i++) localStorage.removeItem(LS_KEYS.SLOT(i));
    setAutosaveMeta(null);
    setSlots(Array.from({ length: 20 }, () => null));
    flash("All save slots cleared.");
  };
  const clearCacheAndReload = () => {
    clearAllSaves();
    location.reload();
  };
  // ---- Health report → Markdown + Copy ----
  const healthToMarkdown = (rows) => {
    if (!rows || !rows.length) return "# Health Check Report\n\n- (no results)\n";
    const total = rows.length;
    const errors = rows.filter(r => r.error).length;
    const warns  = rows.filter(r => !r.error && typeof r.issues === "number" && r.issues > 0).length;

    const lines = [];
    lines.push("# Health Check Report");
    lines.push("");
    lines.push(`- Total checks: **${total}**`);
    lines.push(`- Errors: **${errors}**`);
    lines.push(`- Warnings: **${warns}**`);
    lines.push("");

    for (const r of rows) {
      const status = r.error ? "⛔ error" : (r.issues ? `⚠️ ${r.issues} issue${r.issues === 1 ? "" : "s"}` : "✅ ok");
      lines.push(`- ${status} — ${r.label}`);
      if (r.error) {
        const err = Array.isArray(r.error) ? r.error.map(e => e.message || JSON.stringify(e)).join("; ") : String(r.error);
        lines.push(`  - detail: ${err}`);
      }
    }
    lines.push("");
    lines.push(`_Generated: ${new Date().toLocaleString()}_`);
    return lines.join("\n");
  };

  const copyHealthMarkdown = () => {
    const md = healthToMarkdown(health);
    navigator.clipboard.writeText(md);
    flash("Copied Health report.");
  };

    // ---- Dev HUD (overlay) ----
  const [hudVisible, setHudVisible] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [day, setDay] = useState(1);

  // global toggle via F10
  useEffect(() => {
    const onKey = (e) => {
      // F10 (some keyboards report 'F10', code 'F10')
      if (e.key === "F10") {
        e.preventDefault();
        setHudVisible((v) => !v);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  function ensureHudRoot() {
    let el = document.getElementById("dev-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "dev-hud";
      el.style.cssText = [
        "position:fixed;top:12px;right:12px;z-index:9999",
        "min-width:240px;max-width:320px",
        "padding:10px;border-radius:10px",
        "background:rgba(17,24,39,0.92);color:#fff",
        "font:12px ui-monospace, SFMono-Regular, Menlo, monospace",
        "box-shadow:0 6px 20px rgba(0,0,0,.35)",
        "backdrop-filter: blur(4px)"
      ].join(";");
      document.body.appendChild(el);
    }
    return el;
  }

  function renderHud() {
    const el = ensureHudRoot();
    if (!hudVisible) { el.style.display = "none"; return; }
    el.style.display = "block";

    const pairTxt = `${pair.characterId}:${pair.targetId}`;
    const status = statusMap?.aerith || {};
    const mindCount = status.mind ? Object.keys(status.mind).length : 0;
    const bodyCount = status.body ? Object.keys(status.body).length : 0;
    const relObj = getPairRel(pairTxt);
    const tierName = TIERS[relObj.tier]?.name || "Neutral";

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="font-weight:700;">DEV HUD</div>
        <div style="margin-left:auto;opacity:.75">F10 to toggle</div>
      </div>
      <div style="margin-top:8px;display:grid;gap:6px;">
        <div>Pair: <strong>${pairTxt}</strong></div>
        <div>Day: <strong>${day}</strong></div>
        <div>Tier: <strong>${tierName}</strong> · Score: <strong>${relObj.score}</strong>/100</div>
        <div>Last event: <strong>${lastEvent || "—"}</strong></div>
        <div>Aerith Mind keys: <strong>${mindCount}</strong> · Body keys: <strong>${bodyCount}</strong></div>
      </div>

      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <button id="hud-run"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Run Health</button>
      <button id="hud-copy" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Copy Report</button>
      <button id="hud-day"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">+ Day</button>
      <button id="hud-hold"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Hand Hold (+6)</button>
      <button id="hud-snipe" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Snide Remark (−6)</button>
        <!-- NEW -->
        <button id="hud-kiss" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">
          Test: First Kiss
        </button>
      </div>
    `;

    // wire buttons
    const btnRun  = el.querySelector("#hud-run");
    const btnCopy = el.querySelector("#hud-copy");
    const btnDay  = el.querySelector("#hud-day");
    if (btnRun)  btnRun.onclick  = () => !healthRunning && runHealthCheck();
    if (btnCopy) btnCopy.onclick = () => copyHealthMarkdown();
    if (btnDay)  btnDay.onclick  = () => {
      setDay((d) => d + 1);
      const pid = `${pair.characterId}:${pair.targetId}`;
      applyDailyDecay(pid, 1);
    };
    const btnKiss = el.querySelector("#hud-kiss");
    if (btnKiss) btnKiss.onclick = () => emitGameEvent("interaction.firstKiss");

    const btnHold  = el.querySelector("#hud-hold");
const btnSnipe = el.querySelector("#hud-snipe");

if (btnHold) btnHold.onclick = () => {
  const pid = `${pair.characterId}:${pair.targetId}`;
  if (!canScore(pid, "holdDaily", 1)) { flash("Already held hands today."); return; }
  addRelationshipSlow(pid, 6);
  stampScore(pid, "holdDaily");

  const ps = getPairState(pair.characterId, pair.targetId);
  const d  = diaryByPair[pid];
  if (d) appendDiaryEntry(d, {
    text: "[Our fingers laced—simple, warm, grounding.]",
    path: ps.path, stage: ps.stage, mood: ["warm"], tags: ["#hud:hand_hold"]
  });
  setDiaryByPair(prev => ({ ...prev }));
};

if (btnSnipe) btnSnipe.onclick = () => {
  const pid = `${pair.characterId}:${pair.targetId}`;
  if (!canScore(pid, "snipeDaily", 1)) { flash("Already had a rough moment today."); return; }
  addRelationshipSlow(pid, -6);
  stampScore(pid, "snipeDaily");

  const ps = getPairState(pair.characterId, pair.targetId);
  const d  = diaryByPair[pid];
  if (d) appendDiaryEntry(d, {
    text: "[A sharp remark slipped out. The air went colder for a beat.]",
    path: ps.path, stage: ps.stage, mood: ["irritated"], tags: ["#hud:snide_remark"]
  });
  setDiaryByPair(prev => ({ ...prev }));
};
  }

  // re-render HUD whenever these change
useEffect(() => { renderHud(); }, [
  hudVisible, pair.characterId, pair.targetId, lastEvent, statusMap, day, healthRunning
]);

  // -------- MEMOS --------
  const summaryText = useMemo(
    () => `${chars.length} char · ${scenesCount} scenes · traits: ${traitsFound ? "yes" : "no"}`,
    [chars.length, scenesCount, traitsFound]
  );
  const edges = useMemo(() => {
    const idset = new Set(chars.map((c) => c.id));
    return edgesRaw.filter((e) => idset.has(e.from) && idset.has(e.to));
  }, [edgesRaw, chars]);
  const selected = useMemo(
    () => chars.find((c) => c.id === selectedId) || null,
    [selectedId, chars]
  );
  const selectedAffinity = useMemo(() => {
    if (!selectedId) return 0;
    const rels = edges.filter((e) => e.from === selectedId || e.to === selectedId);
    if (!rels.length) return 0;
    const avg = rels.reduce((s, e) => s + (Number(e.strength) || 0), 0) / rels.length;
    return Math.round(avg);
  }, [edges, selectedId]);

  // -------- NAV --------
  const Nav = () =>
    h(
      "div",
      { class: "menu", style: "margin-bottom:8px; display:flex; gap:8px; flex-wrap:wrap" },
      [
        h(
          Button,
          { onClick: () => { location.hash = ""; setView("home"); }, ghost: view !== "home" },
          "Home"
        ),
        h(
          Button,
          { onClick: () => { location.hash = "#status"; setView("status"); }, ghost: view !== "status" },
          "Status"
        ),
        h(
          Button,
          { onClick: () => { location.hash = "#relationships"; setView("relationships"); }, ghost: view !== "relationships" },
          "Relationships"
        ),
        h(
          Button,
          { onClick: () => { location.hash = "#diary"; setView("diary"); }, ghost: view !== "diary" },
          "Diary"
        )
      ]
    );

  // -------- HOME --------
const Home = () =>
  h("div", null, [
    // hero
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "SIM Prototype — Start"),
      h("div", { class: "subtitle" }, "No-build demo (GitHub Pages · Preact ESM)"),
      h(Nav, null)
    ])),

// top grid: Data / Saves / Health
h("div", { class: "grid" }, [
  // Data Import
  h("div", { class: "card" }, [
    h("h3", null, "Data Import"),
    loading
      ? h("div", { class: "kv" }, "Loading data…")
      : h("div", { class: "kv" }, h(Badge, null, [h(Dot, { ok: chars.length > 0 }), " ", summaryText])),
    h("div", { class: "small", style: "margin-top:8px" },
      "Files under /data/... — tap any to open raw JSON."
    ),
    h("div", { class: "small", style: "margin-top:8px" },
      details.map((d, i) =>
        h("div", { class: "kv", key: i }, [
          h(Dot, { ok: d.status === "ok" }),
          h(
            "a",
            { href: assetUrl(`data/${d.label}`), target: "_blank", style: "margin-left:4px" },
            d.label
          )
        ])
      )
    )
  ]),

  // Saves
  h("div", { class: "card" }, [
    h("h3", null, "Saves"),
    h("div", { class: "kv" }, [
      h(Button, { ghost: true, onClick: restoreAutosave }, "Load Autosave"),
      h(Button, { onClick: doAutosave }, "Autosave"),
      h(Button, { onClick: doManualSave }, "Manual Save"),
      h(Button, { ghost: true, onClick: clearAllSaves }, "Clear All")
    ]),
    autosaveMeta
      ? h("div", { class: "kv" },
      h(
        Badge,
        null,
        `Autosave · ${autosaveMeta.at} · ${autosaveMeta.rel?.pairId || ""} · ${autosaveMeta.rel?.tier || "neutral"} ${autosaveMeta.rel?.score ?? 0}/100`
      )
        )
      : h("div", { class: "kv small" }, "No autosave yet."),
    h("div", { class: "small" }, "Slot clicks are stubs for now (load logic not wired yet).")
  ]),

  // Health Checker
  h("div", { class: "card" }, [
    h("h3", null, "Health Check"),
    h("div", { class: "kv" }, [
      h(
        Button,
        { onClick: () => !healthRunning && runHealthCheck(), disabled: healthRunning },
        healthRunning ? "Running…" : "Run Health Check"
      ),
      h(
        Button,
        {
          ghost: true,
          onClick: () => copyHealthMarkdown(),
          disabled: !health || !health.length
        },
        "Copy Report (MD)"
      ),
      healthRunning ? h(Badge, null, "Working…") : null
    ]),

    // Toggle Button
    h(
  Button,
  { ghost: true, onClick: () => setHudVisible(v => !v) },
  hudVisible ? "Hide HUD" : "Show HUD"
),
    // Results list
    h(
      "div",
      { class: "small", style: "margin-top:8px" },
      health && health.length
        ? health.map((r, i) =>
            h("div", { class: "kv", key: i }, [
              h(Dot, { ok: !!r.ok }),
              h("span", { style: "margin-left:6px" }, r.label),
              r.error
                ? h(Badge, { ghost: true, style: "margin-left:6px" }, "error")
                : null,
              (typeof r.issues === "number" && r.issues > 0)
                ? h(
                    Badge,
                    { ghost: true, style: "margin-left:6px" },
                    `${r.issues} issue${r.issues === 1 ? "" : "s"}`
                  )
                : null
            ])
          )
        : h("div", null, "No results yet.")
    )
  ])
]),

    // Manual Slots section
    h("div", { class: "card", style: "margin-top:12px" }, [
      h("h3", null, "Manual Slots (20)"),
      h("div", { class: "grid" },
        slots.map((s, i) =>
          h(
            "div",
            { class: "slot", onClick: () => setToast(`Load Slot ${i + 1} (stub)`) },
            [
              h("div", null, `Slot ${i + 1}`),
              h("div", { class: "meta" }, s ? `${s.note} · ${s.at}` : "empty")
            ]
          )
        )
      )
    ]),

    // Savebar
    h("div", { class: "savebar" }, [
      h(Button, { onClick: doAutosave }, "Autosave"),
      h(Button, { onClick: doManualSave }, "Manual Save"),
      h(Button, { ghost: true, onClick: () => { clearCacheAndReload(); } }, "Clear Cache & Reload"),
      toast ? h(Badge, null, toast) : null
    ])
  ]);

  // -------- CURRENT DIARY (derived) --------
  const currentDiary = diaryByPair[pairKey(pair.characterId, pair.targetId)] || null;

  // -------- PAIR PICKER (dev) --------
  const PairPicker = () =>
    h("div", { class: "kv", style: "gap:6px; flex-wrap:wrap" }, [
      h(Badge, null, `Actor: ${pair.characterId}`),
      h(Badge, null, `Target: ${pair.targetId}`),
      h(Button, { ghost: true, onClick: () => setPair({ characterId: "aerith", targetId: "vagrant" }) }, "AERITH ↔ VAGRANT")
    ]);

  // -------- DEV STRIP (diary quick actions) --------
  const DiaryDevStrip = () =>
    h("div", { class: "kv", style: "gap:6px; flex-wrap:wrap; margin: 8px 0" }, [
      h(
        Button,
        {
          onClick: () => {
            const key = pairKey(pair.characterId, pair.targetId);
            const d = diaryByPair[key];
            if (!d) return;
            const ps = getPairState(pair.characterId, pair.targetId);
            appendDiaryEntry(d, {
              text: "[test] dev seeded entry",
              path: ps.path,
              stage: ps.stage,
              tags: ["#dev"]
            });
            setDiaryByPair((prev) => ({ ...prev })); // force re-render
          }
        },
        "Seed Test Entry"
      ),
      h(
        Button,
        {
          ghost: true,
          onClick: () => {
            const key = pairKey(pair.characterId, pair.targetId);
            const d = diaryByPair[key];
            if (!d) return;
            d.entries = [];
            setDiaryByPair((prev) => ({ ...prev })); // force re-render
          }
        },
        "Clear Entries"
      )
    ]);

  // -------- Run Health Check -------
  async function runHealthCheck() {
  setHealthRunning(true);
  const rows = [];
  const add = (ok, label, extra = {}) => rows.push({ ok, label, ...extra });

  // validate all pair diaries declared in DATA.diaries
  const diaryPairs = Object.entries(DATA.diaries || {});
  for (const [pairKeyStr, relPath] of diaryPairs) {
    const indexUrl = assetUrl(relPath) + `?v=${Date.now()}`;

    // index.json
    const idx = await validateUrl(indexUrl, DiaryIndexSchema, `${pairKeyStr} · index.json`);
    add(idx.ok, idx.label, idx.ok ? {} : { error: idx.error || idx.issues });
    if (!idx.ok) continue;

    const sources = idx.data.sources || {};

    // desires
    if (sources.desires) {
      const r = await validateUrl(assetUrl(sources.desires), DesiresSchema, `${pairKeyStr} · desires.json`);
      add(r.ok, r.label, r.ok ? {} : { error: r.error || r.issues });
    }

    // witnessed
    if (sources.witnessed) {
      const r = await validateUrl(assetUrl(sources.witnessed), WitnessedSchema, `${pairKeyStr} · caught_others.json`);
      add(r.ok, r.label, r.ok ? {} : { error: r.error || r.issues });
    }

    // events (e.g., first_kiss.json)
    if (sources.events) {
      for (const [evKey, evPath] of Object.entries(sources.events)) {
        const r = await validateUrl(assetUrl(evPath), EventFileSchema, `${pairKeyStr} · ${evKey}.json`);
        add(r.ok, r.label, r.ok ? {} : { error: r.error || r.issues });
      }
    }
  }
  // ---- NEW: Characters / Relationships / Status checks ----

  // Characters (iterate your DATA.characters list)
  for (const path of DATA.characters) {
    const url = assetUrl(path) + `?v=${Date.now()}`;
    const file = path.split("/").pop();
    const r = await validateUrlPlus(url, CharacterFileSchema, `characters/${file}`);
    // r.issues will show as a badge if > 0
    add(r.ok, r.label, r.ok ? { issues: r.issues } : { error: r.error });
  }

  // Relationships (single file in DATA.relationships)
  if (DATA.relationships) {
    const relUrl = assetUrl(DATA.relationships) + `?v=${Date.now()}`;
    const rel = await validateUrl(relUrl, RelationshipsFileSchema, "relationships_v1.json");
    add(rel.ok, rel.label, rel.ok ? {} : { error: rel.error || rel.issues });
  }

  // Status (mind/body) — loop each character in DATA.statusByChar
  const sbc = DATA.statusByChar || {};
  for (const [charId, paths] of Object.entries(sbc)) {
    for (const key of ["mind", "body"]) {
      const p = paths[key];
      if (!p) continue;
      const url = assetUrl(p) + `?v=${Date.now()}`;
      const label = `${charId} · ${key}`;
      const r = await validateUrlPlus(
        url,
        StatusLooseSchema,
        label,
        // count simple out-of-range numbers as "issues" (0..100)
        (data) => countNumericOutOfRange(data, 0, 100)
      );
      // show issues badge if any; otherwise error badge if invalid
      add(r.ok, label, r.ok ? (r.issues ? { issues: r.issues } : {}) : { error: r.error });
    }
  }

  setHealth(rows);
  setHealthRunning(false);
}

  // -------- RETURN (routes) --------
  return h(
    "div",
    { class: "app" },
    view === "status"
      ? h(StatusView, { chars, statusMap, playerFemale, fertilityMap, Nav })
      : view === "relationships"
      ? h(RelationshipsView, {
          chars,
          edges,
          selected: selected || null,
          setSelected: setSelectedId,
          selectedAffinity,
          traitMap,
          sensCatalog,
          sensMap,
          sensRules,
          Nav
        })
      : view === "diary"
      ? h("div", null, [
          h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
            h("div", { class: "stage-title" }, "Diary · Pair"),
            h(Nav, null),
            h(PairPicker, null)
          ])),
          h(DiaryDevStrip, null),
          h(DiaryView, {
            diary: currentDiary,
            characterId: pair.characterId,
            targetId: pair.targetId,
            witnesses: ["tifa", "renna", "yuffie"],
            Nav
          })
        ])
      : h(Home)
  );
}

/* ============================================================== */
/* MOUNT                                                          */
/* ============================================================== */
render(h(App), document.getElementById("app"));
