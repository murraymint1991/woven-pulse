// js/views/status.js
// Status screen that keeps your existing fertility/pregnancy dev tools
// AND adds readouts for statusMap.aerith (Mind/Body JSON).

import { h } from "https://esm.sh/preact@10.22.0";
import { useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";
import {
  computeReproState,
  loadOverrides,
  mergedProfile,
  setPregnant,
  setDelivered,
  resetToCycle,
  getClock,
  advanceDays
} from "../systems/status.js";

// Optional: dev helpers for your new Mind system (safe to keep even if unused)
import {
  getMindState,
  applyMoodDelta,
  applyTraitDelta,
  resetMindOverrides
} from "../systems/mind.js";

// ---------- Small UI helpers ----------
function Bar({ label, value, max = 100 }) {
  const safeMax = max || 1;
  const pct = Math.max(0, Math.min(100, Math.round((Number(value || 0) / safeMax) * 100)));
  return h("div", { class: "kv" }, [
    h("div", { class: "label" }, label),
    h("div", { class: "barwrap" }, [
      h("div", { class: "bar", style: `width:${pct}%;` }),
      h("span", { class: "bartext" }, `${value}/${safeMax}`)
    ])
  ]);
}

function RowTable(obj = {}, fmt = (k, v) => `${v}`) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return h("div", { class: "small" }, "—");
  return h(
    "div",
    { class: "kvgrid", style: "margin-top:6px" },
    entries.flatMap(([k, v]) => [
      h("div", { class: "label" }, k),
      h("div", { class: "value" }, fmt(k, v))
    ])
  );
}

function PillList({ title, items }) {
  return h("div", { class: "kv" }, [
    h("div", { class: "label" }, title),
    h(
      "div",
      { style: "display:flex; gap:6px; flex-wrap:wrap" },
      (items || []).map((t) => h(Badge, { ghost: true }, String(t)))
    )
  ]);
}

// =====================================================================================

export default function StatusView({
  chars,
  statusMap,         // <- holds { aerith: { mind, body } } once main.js loads /data/status/aerith/*
  playerFemale,      // <- optional (old fertility system global)
  fertilityMap,      // <- optional (old fertility system per-char map)
  Nav
}) {
  // Character picker (kept as you had it)
  const options = (chars || []).map((c) => ({ id: c.id, name: c.displayName }));
  const [selId, setSelId] = useState(
    () => options.find((o) => o.id === "cloud")?.id || options[0]?.id || ""
  );
  const [rev, setRev] = useState(0);
  const [showDev, setShowDev] = useState(true); // default on, like before

  const selChar = useMemo(
    () => (chars || []).find((c) => c.id === selId) || null,
    [chars, selId, rev]
  );

  // Old sheet-style stats (HP/MP/etc.) from characters file
  const s = selId ? statusMap?.[selId] || {} : {};
  const hp = selChar?.baseStats?.hp ?? 0;
  const mp = selChar?.baseStats?.mp ?? 0;
  const role = s.role || "Adventurer";
  const level = s.level ?? 1;
  const expNow = s.exp?.current ?? 0;
  const expNext = s.exp?.next ?? 100;
  const limit = s.limit ?? 0;
  const mood = s.mood || "Neutral";
  const effects = Array.isArray(s.effects) ? s.effects : [];

  // ===== New: Mind/Body JSON readout for Aerith (statusMap.aerith) =====
  const aerithStatus = statusMap?.aerith || {};
  const mind = aerithStatus.mind || {};     // { moods, traits }
  const body = aerithStatus.body || {};     // { cycle, pregnancy, effects }
  const cycle = body.cycle || null;
  const preg  = body.pregnancy || null;

  // ===== Existing fertility/pregnancy simulation (optional) =====
  const overrides = loadOverrides();
  const effProfile =
    selId && fertilityMap ? mergedProfile(fertilityMap, overrides, selId) : null;
  const repro =
    playerFemale && effProfile && effProfile.visible !== false
      ? computeReproState(playerFemale.cycle, effProfile)
      : null;

  // Dev actions (existing)
  function doPregnant() {
    setPregnant(selId);
    setRev((v) => v + 1);
  }
  function doDeliver() {
    setDelivered(selId);
    setRev((v) => v + 1);
  }
  function doReset() {
    resetToCycle(selId);
    setRev((v) => v + 1);
  }
  function doAdvance(n) {
    advanceDays(n);
    setRev((v) => v + 1);
  }

  // ===== Mind (dev nudges) — only shown if Aerith is selected =====
  function nudgeMood(key, delta) {
    if (selId !== "aerith") return;
    applyMoodDelta("aerith", key, delta);
    setRev((v) => v + 1);
  }
  function nudgeTrait(key, delta) {
    if (selId !== "aerith") return;
    applyTraitDelta("aerith", key, delta);
    setRev((v) => v + 1);
  }
  function resetMind() {
    if (selId !== "aerith") return;
    resetMindOverrides("aerith");
    setRev((v) => v + 1);
  }

  return h("div", null, [
    // Header
    h(
      "div",
      { class: "hero" },
      h("div", { class: "hero-inner" }, [
        h("div", { class: "stage-title" }, "Status & State"),
        h(
          "div",
          { class: "subtitle" },
          "Overview: level, HP/MP, limit, mood, effects — plus Body/Mind & fertility dev tools."
        ),
        h(Nav, null)
      ])
    ),

    // Character selector + dev toggle
    h("div", { class: "card" }, [
      h("h3", null, "Character"),
      options.length
        ? h(
            "select",
            {
              value: selId,
              onChange: (e) => setSelId(e.currentTarget.value),
              style:
                "margin:8px 0; padding:8px; border-radius:10px; background:#0b1020; color:#9eeefc;"
            },
            options.map((o) => h("option", { value: o.id }, o.name))
          )
        : h("div", { class: "small" }, "No characters loaded."),
      h(
        "div",
        {
          class: "small",
          style: "margin-top:6px; display:flex; gap:16px; align-items:center;"
        },
        [
          h(
            "label",
            { style: "display:inline-flex; align-items:center; gap:8px; cursor:pointer;" },
            [
              h("input", {
                type: "checkbox",
                checked: showDev,
                onChange: (e) => setShowDev(e.currentTarget.checked)
              }),
              "Show Dev Panel"
            ]
          ),
          h("span", null, `Current Day: ${getClock().day}`)
        ]
      )
    ]),

    // Two-column layout
    selChar &&
      h("div", { class: "grid", style: "margin-top:12px" }, [
        // ===== Left card: Classic sheet + Fertility Sim =====
        h("div", { class: "card" }, [
          selChar.portrait
            ? h("img", {
                class: "portrait",
                src: selChar.portrait,
                alt: selChar.displayName
              })
            : null,

          h("h3", null, selChar.displayName),
          h("div", { class: "kv small" }, `Role: ${role} · Level ${level}`),

          h(Bar, { label: "EXP", value: expNow, max: expNext }),
          h("div", { class: "kvgrid", style: "margin-top:8px" }, [
            h("div", { class: "label" }, "HP"),
            h("div", { class: "value" }, hp),
            h("div", { class: "label" }, "MP"),
            h("div", { class: "value" }, mp)
          ]),
          h(Bar, { label: "Limit", value: limit, max: 100 }),

          h("div", { class: "kv", style: "margin-top:8px" }, [
            h("div", { class: "label" }, "Mood"),
            h(Badge, null, mood)
          ]),

          h("div", { class: "kv", style: "margin-top:8px" }, [
            h("div", { class: "label" }, "Status Effects"),
            effects.length
              ? effects.map((e) => h(Badge, null, e))
              : h("span", { class: "small" }, "—")
          ]),

          // ===== Existing fertility/pregnancy/postpartum (if configured) =====
          repro &&
            repro.kind === "cycle" &&
            h("div", { class: "kv", style: "margin-top:10px" }, [
              h("div", { class: "label" }, "Fertility (Sim)"),
              h("div", null, [
                h(Badge, null, repro.phase),
                h(
                  "span",
                  { class: "small", style: "margin-left:8px" },
                  `Day ${repro.dayInCycle}/${repro.length}`
                )
              ])
            ]),
          repro && repro.kind === "cycle" && h(Bar, { label: "Cycle Progress", value: repro.percent, max: 100 }),

          repro &&
            repro.kind === "pregnant" &&
            h("div", { class: "kv", style: "margin-top:10px" }, [
              h("div", { class: "label" }, "Pregnancy (Sim)"),
              h("div", null, [
                h(Badge, null, `Trimester ${repro.trimester}`),
                h(
                  "span",
                  { class: "small", style: "margin-left:8px" },
                  `Week ${repro.weeks} · ETA ${repro.etaDays}d`
                )
              ])
            ]),
          repro && repro.kind === "pregnant" && h(Bar, { label: "Pregnancy Progress", value: repro.percent, max: 100 }),

          repro &&
            repro.kind === "postpartum" &&
            h("div", { class: "kv", style: "margin-top:10px" }, [
              h("div", { class: "label" }, "Postpartum (Sim)"),
              h("div", null, [h(Badge, null, `Week ${repro.weeksSince}`)])
            ]),
          repro && repro.kind === "postpartum" && h(Bar, { label: "Recovery", value: repro.percent, max: 100 }),

          h("div", { class: "sheet-actions" }, [
            h(Button, { ghost: true, onClick: () => alert("Open Equipment (WIP)") }, "Equipment"),
            h(Button, { ghost: true, onClick: () => alert("Open Traits (WIP)") }, "Traits")
          ])
        ]),

        // ===== Right card: NEW Mind/Body (from statusMap.aerith JSON) =====
        h("div", { class: "card" }, [
          h("h3", null, "Body (File)"),
          cycle
            ? h("div", null, [
                h("div", { class: "kv" }, [
                  h("div", { class: "label" }, "Cycle Day"),
                  h("div", null, `${cycle.day}/${cycle.length}`)
                ]),
                h("div", { class: "kv" }, [
                  h("div", { class: "label" }, "Ovulation"),
                  h("div", null, `${cycle.ovulationStart}–${cycle.ovulationEnd}`)
                ])
              ])
            : h("div", { class: "small" }, "No cycle data."),
          preg
            ? h("div", { style: "margin-top:8px" }, [
                h("div", { class: "kv" }, [
                  h("div", { class: "label" }, "Pregnant"),
                  h("div", null, preg.isPregnant ? "Yes" : "No")
                ]),
                preg.isPregnant && preg.weeks != null
                  ? h("div", { class: "kv" }, [
                      h("div", { class: "label" }, "Weeks"),
                      h("div", null, String(preg.weeks))
                    ])
                  : null,
                preg.isPregnant && preg.fatherId
                  ? h("div", { class: "kv" }, [
                      h("div", { class: "label" }, "Father"),
                      h("div", null, String(preg.fatherId))
                    ])
                  : null,
                preg.dueDay
                  ? h("div", { class: "kv" }, [
                      h("div", { class: "label" }, "Due Day"),
                      h("div", null, String(preg.dueDay))
                    ])
                  : null
              ])
            : null,
          body.effects && body.effects.length
            ? h("div", { style: "margin-top:8px" }, PillList({ title: "Effects", items: body.effects }))
            : null,

          h("h3", { style: "margin-top:12px" }, "Mind (File)"),
          h("div", { class: "kv" }, [
            h("div", { class: "label" }, "Moods"),
            RowTable(mind.moods || {}, (_k, v) => (typeof v === "number" ? v.toFixed(2) : String(v)))
          ]),
          h("div", { class: "kv", style: "margin-top:8px" }, [
            h("div", { class: "label" }, "Traits"),
            RowTable(mind.traits || {}, (_k, v) => (typeof v === "number" ? v.toFixed(2) : String(v)))
          ]),

          // Mind (dev nudges) — only useful for Aerith while you iterate
          showDev && selId === "aerith" &&
            h("div", { class: "kv", style: "margin-top:12px" }, [
              h("div", { class: "label" }, "Mind Dev"),
              h("div", { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap;" }, [
                h(Button, { onClick: () => nudgeMood("affection", +0.05) }, "+ affection"),
                h(Button, { onClick: () => nudgeMood("shame", -0.05), ghost: true }, "– shame"),
                h(Button, { onClick: () => nudgeTrait("corruption", +0.05) }, "+ corruption"),
                h(Button, { onClick: () => nudgeTrait("purity", -0.05), ghost: true }, "– purity"),
                h(Button, { onClick: resetMind, ghost: true }, "Reset Mind Overrides")
              ])
            ])
        ])
      ]),

    // ===== Notes + Dev panel (existing) =====
    h("div", { class: "card", style: "margin-top:12px" }, [
      h("h3", null, "Notes"),
      h(
        "div",
        { class: "small" },
        "Left: classic sheet + fertility simulator (if configured). Right: JSON-loaded Body/Mind from /data/status/aerith/."
      ),
      playerFemale
        ? h("div", { class: "small", style: "margin-top:6px" }, "Global female cycle config detected (sim enabled).")
        : h("div", { class: "small", style: "margin-top:6px" }, "Fertility sim disabled (missing global config)."),

      // Dev controls (unchanged)
      showDev &&
        h("div", { class: "kv", style: "margin-top:12px" }, [
          h("div", { class: "label" }, "Dev Panel"),
          h("div", { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap;" }, [
            h(Button, { onClick: () => doPregnant() }, "Start Pregnancy"),
            h(Button, { onClick: () => doDeliver(), ghost: true }, "Mark Delivery"),
            h(Button, { onClick: () => doReset(), ghost: true }, "Reset to Cycle"),
            h(Button, { onClick: () => doAdvance(1) }, "+1 Day"),
            h(Button, { onClick: () => doAdvance(7), ghost: true }, "+7 Days")
          ]),
          h(
            "div",
            { class: "small", style: "margin-top:6px" },
            "Actions write browser-local overrides and advance the global game day."
          )
        ])
    ])
  ]);
}
