// js/views/status.js
import { h } from "https://esm.sh/preact@10.22.0";
import { useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";

function Bar({ label, value, max=100 }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return h("div", { class: "kv" }, [
    h("div", { class: "label" }, label),
    h("div", { class: "barwrap" }, [
      h("div", { class: "bar", style: `width:${pct}%;` }),
      h("span", { class: "bartext" }, `${value}/${max}`)
    ])
  ]);
}

export default function StatusView({ chars, statusMap, playerFemale, Nav }) {
  const options = chars.map(c => ({ id: c.id, name: c.displayName }));
  const [selId, setSelId] = useState(() => options.find(o => o.id === "cloud")?.id || options[0]?.id);

  const selChar = useMemo(() => chars.find(c => c.id === selId) || null, [chars, selId]);
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

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Status & State"),
      h("div", { class: "subtitle" }, "Overview: level, HP/MP, limit, mood, and effects."),
      h(Nav, null)
    ])),

    h("div", { class: "card" }, [
      h("h3", null, "Character"),
      options.length
        ? h("select", {
            value: selId,
            onChange: e => setSelId(e.currentTarget.value),
            style: "margin: 8px 0; padding:8px; border-radius:10px; background:#0b1020; color:#9eeefc;"
          }, options.map(o => h("option", { value: o.id }, o.name)))
        : h("div", { class: "small" }, "No characters loaded.")
    ]),

    selChar && h("div", { class: "grid", style: "margin-top:12px" }, [
      h("div", { class: "card" }, [
        // Portrait
        selChar.portrait ? h("img", { class: "portrait", src: selChar.portrait, alt: selChar.displayName }) : null,

        h("h3", null, selChar.displayName),
        h("div", { class: "kv small" }, `Role: ${role} · Level ${level}`),

        // EXP bar
        h(Bar, { label: "EXP", value: expNow, max: expNext }),
        // HP/MP (from base stats)
        h("div", { class: "kvgrid", style: "margin-top:8px" }, [
          h("div", { class: "label" }, "HP"), h("div", { class: "value" }, hp),
          h("div", { class: "label" }, "MP"), h("div", { class: "value" }, mp)
        ]),
        // Limit gauge
        h(Bar, { label: "Limit", value: limit, max: 100 }),

        // Mood
        h("div", { class: "kv", style: "margin-top:8px" }, [
          h("div", { class: "label" }, "Mood"),
          h(Badge, null, mood)
        ]),

        // Active effects
        h("div", { class: "kv", style: "margin-top:8px" }, [
          h("div", { class: "label" }, "Status Effects"),
          effects.length ? effects.map(e => h(Badge, null, e)) : h("span", { class: "small" }, "—")
        ]),

        // Placeholder buttons (future)
        h("div", { class: "sheet-actions" }, [
          h(Button, { ghost: true, onClick: () => alert("Open Equipment (WIP)") }, "Equipment"),
          h(Button, { ghost: true, onClick: () => alert("Open Traits (WIP)") }, "Traits")
        ])
      ]),

      // Reserved: later add a right column card for Materia grid or quick stats
      h("div", { class: "card" }, [
        h("h3", null, "Notes"),
        h("div", { class: "small" }, "This area can hold Materia slots, quick gear summary, or recent interactions."),
        playerFemale ? h("div", { class: "small", style: "margin-top:6px" }, "Player (Female) cycle data loaded.") : null
      ])
    ])
  ]);
}
