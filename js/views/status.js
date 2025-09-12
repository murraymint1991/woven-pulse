// js/views/status.js
import { h } from "https://esm.sh/preact@10.22.0";
import { useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";

import {
  // fertility helpers (optional; safe if you don’t use them yet)
  computeReproState,
  loadOverrides,
  mergedProfile,
  setPregnant,
  setDelivered,
  resetToCycle,
  getClock,
  advanceDays
} from "../systems/status.js";

// mind helpers (overrides live in localStorage)
import {
  loadMindOverrides,
  applyMoodDelta,
  applyTraitDelta,
  clearMindOverrides,
  zeroOutMind,
  mergeEffectiveMind
} from "../systems/mind.js";

// ---------------- small UI atoms ----------------
function Bar({ label, value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return h("div", { class: "kv" }, [
    h("div", { class: "label" }, label),
    h("div", { class: "barwrap" }, [
      h("div", { class: "bar", style: `width:${pct}%;` }),
      h("span", { class: "bartext" }, `${value}/${max}`)
    ])
  ]);
}

function RowNum({ label, value }) {
  return h("div", { class: "kv" }, [
    h("div", { class: "label" }, label),
    h("div", { class: "value" }, value.toFixed(2))
  ]);
}

function RowsFromObject(obj, title) {
  const keys = Object.keys(obj || {});
  return h("div", null, [
    h("div", { class: "kv small" }, title),
    keys.length
      ? keys.map((k) => h(RowNum, { label: k, value: Number(obj[k] || 0) }))
      : h("div", { class: "small" }, "—")
  ]);
}

// ------------------------------------------------

export default function StatusView({ chars, statusMap, playerFemale, fertilityMap, Nav }) {
  const options = chars.map(c => ({ id: c.id, name: c.displayName }));
  const [selId, setSelId] = useState(
    () => options.find(o => o.id === "cloud")?.id || options[0]?.id
  );
  const [rev, setRev] = useState(0);
  const [showDev, setShowDev] = useState(true);

  const selChar = useMemo(
    () => chars.find(c => c.id === selId) || null,
    [chars, selId, rev]
  );

  const s = selId ? (statusMap[selId] || {}) : {};
  const baseMind = s.mind || {};      // values from file
  const body = s.body || {};          // body file (static for now)
  const overrides = loadMindOverrides(selId);
  const effectiveMind = mergeEffectiveMind(baseMind, overrides);

  // classic sheet bits (safe defaults)
  const hp = selChar?.baseStats?.hp ?? 0;
  const mp = selChar?.baseStats?.mp ?? 0;
  const role = s.role || "Adventurer";
  const level = s.level ?? 1;
  const expNow = s.exp?.current ?? 0;
  const expNext = s.exp?.next ?? 100;
  const limit = s.limit ?? 0;
  const mood = s.mood || "Neutral";
  const effects = Array.isArray(body.effects) ? body.effects : ["well-rested"];

  // fertility/pregnancy (if configured)
  const overridesFert = loadOverrides?.() ?? {};
  const effProfile = mergedProfile?.(fertilityMap, overridesFert, selId);
  const repro =
    playerFemale && effProfile && effProfile.visible !== false
      ? computeReproState(playerFemale.cycle, effProfile)
      : null;

  // Dev actions (fertility demo)
  function doPregnant() { setPregnant?.(selId); setRev(v => v + 1); }
  function doDeliver()  { setDelivered?.(selId); setRev(v => v + 1); }
  function doReset()    { resetToCycle?.(selId); setRev(v => v + 1); }
  function doAdvance(n) { advanceDays?.(n); setRev(v => v + 1); }

  // Mind dev helpers
  function bumpMood(key, d)  { applyMoodDelta(selId, key, d); setRev(v => v + 1); }
  function bumpTrait(key, d) { applyTraitDelta(selId, key, d); setRev(v => v + 1); }

  function onClearOverrides() {
    clearMindOverrides(selId);     // removes LS only
    setRev(v => v + 1);            // UI re-renders showing file values
  }
  function onZeroAll() {
    zeroOutMind(selId, baseMind);  // write 0 overrides for all known keys
    setRev(v => v + 1);
  }

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Status & State"),
      h("div", { class: "subtitle" },
        "Overview: level, HP/MP, limit, mood, effects — plus Body/Mind & fertility dev tools."
      ),
      h(Nav, null)
    ])),

    // Character picker
    h("div", { class: "card" }, [
      h("h3", null, "Character"),
      options.length
        ? h(
            "select",
            {
              value: selId,
              onChange: (e) => setSelId(e.currentTarget.value),
              style:
                "margin: 8px 0; padding:8px; border-radius:10px; background:#0b1020; color:#9eeefc;"
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
          h("span", null, `Current Day: ${getClock?.().day ?? 0}`)
        ]
      )
    ]),

    selChar &&
      h("div", { class: "grid", style: "margin-top:12px" }, [
        // ------- Left: classic sheet -------
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

          h("div", { class: "sheet-actions" }, [
            h(Button, { ghost: true, onClick: () => alert("Open Equipment (WIP)") }, "Equipment"),
            h(Button, { ghost: true, onClick: () => alert("Open Traits (WIP)") }, "Traits")
          ])
        ]),

        // ------- Right: Body + Mind -------
        h("div", { class: "card" }, [
          h("h3", null, "Body (File)"),
          h("div", { class: "kv" }, [
            h("div", { class: "label" }, "Cycle Day"),
            h("div", { class: "value" }, `${body.cycleDay ?? 12}/28`)
          ]),
          h("div", { class: "kv" }, [
            h("div", { class: "label" }, "Ovulation"),
            h("div", { class: "value" }, body.ovulation ?? "12–16")
          ]),
          h("div", { class: "kv" }, [
            h("div", { class: "label" }, "Pregnant"),
            h("div", { class: "value" }, body.pregnant ? "Yes" : "No")
          ]),
          h("div", { class: "kv" }, [
            h("div", { class: "label" }, "Effects"),
            (body.effects || ["well-rested"]).map((e) => h(Badge, null, e))
          ]),

          h("h3", { style: "margin-top:10px" }, "Mind (File + Overrides)"),
          // effective values (file merged with overrides)
          RowsFromObject(effectiveMind.moods, "Moods"),
          RowsFromObject(effectiveMind.traits, "Traits"),

          // Dev quick buttons for a few example keys
          h("div", { class: "kv", style: "margin-top:8px" }, [
            h("div", { class: "label" }, "Mind Dev"),
            h("div", { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap;" }, [
              h(Button, { onClick: () => bumpMood("affection", +0.05) }, "+ affection"),
              h(Button, { ghost: true, onClick: () => bumpMood("shame", -0.05) }, "− shame"),
              h(Button, { onClick: () => bumpTrait("corruption", +0.05) }, "+ corruption"),
              h(Button, { ghost: true, onClick: () => bumpTrait("purity", -0.05) }, "− purity")
            ])
          ]),

          h("div", { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap; margin-top:8px" }, [
            h(Button, { onClick: onClearOverrides }, "Clear Overrides (revert to file)"),
            h(Button, { ghost: true, onClick: onZeroAll }, "Zero Out All")
          ])
        ])
      ]),

    // Notes + (optional) fertility dev panel
    h("div", { class: "card", style: "margin-top:12px" }, [
      h("h3", null, "Notes"),
      h(
        "div",
        { class: "small" },
        "Left: classic sheet + fertility simulator (if configured). Right: JSON-loaded Body/Mind from /data/status/… merged with browser-local overrides (dev)."
      ),
      !playerFemale
        ? h("div", { class: "small", style: "margin-top:6px" }, "Fertility sim disabled (missing global config).")
        : null,

      showDev &&
        h("div", { class: "kv", style: "margin-top:12px" }, [
          h("div", { class: "label" }, "Dev Panel"),
          h(
            "div",
            { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap;" },
            [
              h(Button, { onClick: () => doPregnant?.() }, "Start Pregnancy"),
              h(Button, { onClick: () => doDeliver?.(), ghost: true }, "Mark Delivery"),
              h(Button, { onClick: () => doReset?.(), ghost: true }, "Reset to Cycle"),
              h(Button, { onClick: () => doAdvance?.(1) }, "+1 Day"),
              h(Button, { onClick: () => doAdvance?.(7), ghost: true }, "+7 Days")
            ]
          ),
          h(
            "div",
            { class: "small", style: "margin-top:6px" },
            "Mind overrides are browser-local only; Clear Overrides restores the values from your JSON files."
          )
        ])
    ])
  ]);
}
