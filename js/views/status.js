// js/views/status.js
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
} from "../systems/status.js"; // cache-bust

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

export default function StatusView({ chars, statusMap, playerFemale, fertilityMap, Nav }) {
  const options = chars.map(c => ({ id: c.id, name: c.displayName }));
  const [selId, setSelId] = useState(
    () => options.find(o => o.id === "cloud")?.id || options[0]?.id
  );
  const [rev, setRev] = useState(0);
  const [showDev, setShowDev] = useState(false);

  const selChar = useMemo(
    () => chars.find(c => c.id === selId) || null,
    [chars, selId, rev]
  );
  const s = selId ? (statusMap[selId] || {}) : {};

  const hp = selChar?.baseStats?.hp ?? 0;
  const mp = selChar?.baseStats?.mp ?? 0;
  const role = s.role || "Adventurer";
  const level = s.level ?? 1;
  const expNow = s.exp?.current ?? 0;
  const expNext = s.exp?.next ?? 100;
  const limit = s.limit ?? 0;
  const mood = s.mood || "Neutral";
  const effects = Array.isArray(s.effects) ? s.effects : [];

  // fertility/pregnancy state (if enabled for this char)
  const overrides = loadOverrides();
  const effProfile = mergedProfile(fertilityMap, overrides, selId);
  const repro = (playerFemale && effProfile && effProfile.visible !== false)
    ? computeReproState(playerFemale.cycle, effProfile)
    : null;

  // Dev actions
  function doPregnant() { setPregnant(selId); setRev(v => v + 1); }
  function doDeliver()  { setDelivered(selId); setRev(v => v + 1); }
  function doReset()    { resetToCycle(selId); setRev(v => v + 1); }
  function doAdvance(n) { advanceDays(n); setRev(v => v + 1); }

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Status & State"),
      h("div", { class: "subtitle" },
        "Overview: level, HP/MP, limit, mood, effects — plus fertility/pregnancy when enabled."
      ),
      h(Nav, null)
    ])),

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

      // dev toggle + current game day
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

    selChar &&
      h("div", { class: "grid", style: "margin-top:12px" }, [
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

          // Cycle / Pregnancy / Postpartum
          repro &&
            repro.kind === "cycle" &&
            h("div", { class: "kv", style: "margin-top:10px" }, [
              h("div", { class: "label" }, "Fertility"),
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
              h("div", { class: "label" }, "Pregnancy"),
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
              h("div", { class: "label" }, "Postpartum"),
              h("div", null, [h(Badge, null, `Week ${repro.weeksSince}`)])
            ]),
          repro && repro.kind === "postpartum" && h(Bar, { label: "Recovery", value: repro.percent, max: 100 }),

          h("div", { class: "sheet-actions" }, [
            h(Button, { ghost: true, onClick: () => alert("Open Equipment (WIP)") }, "Equipment"),
            h(Button, { ghost: true, onClick: () => alert("Open Traits (WIP)") }, "Traits")
          ])
        ]),

        h("div", { class: "card" }, [
          h("h3", null, "Notes"),
          h(
            "div",
            { class: "small" },
            "Fertility/pregnancy visibility is controlled by data under /data/status/fertility_v1.json."
          ),
          playerFemale
            ? h("div", { class: "small", style: "margin-top:6px" }, "Global female cycle config loaded.")
            : null,

          // Dev Panel
          showDev &&
            h("div", { class: "kv", style: "margin-top:12px" }, [
              h("div", { class: "label" }, "Dev Panel"),
              h(
                "div",
                { class: "kv", style: "gap:8px; display:flex; flex-wrap:wrap;" },
                [
                  h(Button, { onClick: () => doPregnant() }, "Start Pregnancy"),
                  h(Button, { onClick: () => doDeliver(), ghost: true }, "Mark Delivery"),
                  h(Button, { onClick: () => doReset(), ghost: true }, "Reset to Cycle"),
                  h(Button, { onClick: () => doAdvance(1) }, "+1 Day"),
                  h(Button, { onClick: () => doAdvance(7), ghost: true }, "+7 Days")
                ]
              ),
              h(
                "div",
                { class: "small", style: "margin-top:6px" },
                "Actions write browser‑local overrides and advance the global game day."
              )
            ])
        ])
      ])
  ]);
}
