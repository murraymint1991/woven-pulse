// js/views/relationships.js
import { h } from "https://esm.sh/preact@10.22.0";
import { Button, Badge } from "../ui.js";
import { nameOf } from "../utils.js";

/**
 * Props:
 * - chars: [{ id, displayName, type, portrait?, baseStats? }]
 * - edges: [{ from, to, type, strength }]
 * - selected: the selected character object or null
 * - setSelected: fn(id|null)
 * - selectedAffinity: number (0-100)
 * - traitMap: { id -> { traits:[], sens:[] } }
 * - sensCatalog: { stim -> { kind, tags[], base? } }
 * - sensMap: { id -> { weights: {stim:number}, caps? } }
 * - sensRules: [ ... ]  (unused in UI for now)
 * - Nav: small nav component
 */
export default function RelationshipsView({
  chars, edges, selected, setSelected, selectedAffinity,
  traitMap, sensCatalog, sensMap, sensRules, Nav
}) {
  // Precompute traits/sensitivities for the sheet
  const traits = selected ? (traitMap[selected.id]?.traits || []) : [];
  const weights = selected ? (sensMap[selected.id]?.weights || {}) : {};
  const likes   = Object.entries(weights).filter(([_,w]) => w > 0).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const hates   = Object.entries(weights).filter(([_,w]) => w < 0).sort((a,b)=>a[1]-b[1]).slice(0,6);

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Relationships"),
      h("div", { class: "subtitle" }, "Roster, quick links, and a starter web (data-driven)."),
      h(Nav, null)
    ])),

    // Roster (clickable)
    h("div", { class: "card" }, [
      h("h3", null, `Roster (${chars.length})`),
      h("div", { class: "grid" },
        chars.map(c =>
          h("div", { class: "slot", onClick: () => setSelected(c.id) }, [
            h("div", null, c.displayName),
            h("div", { class: "meta" }, c.type)
          ])
        )
      )
    ]),

    // Web edges (from JSON)
    h("div", { class: "card", style: "margin-top:12px" }, [
      h("h3", null, `Relationship Web (${edges.length})`),
      edges.length
        ? edges.map((e) =>
            h("div", { class: "kv" }, [
              h(Badge, null, e.type),
              h("b", null, " "),
              h("span", null, `${nameOf(e.from, chars)} ↔ ${nameOf(e.to, chars)} (${e.strength})`)
            ])
          )
        : h("div", { class: "kv small" }, "No edges yet.")
    ]),

    // Detail sheet (overlay)
    selected && h("div", { class: "overlay", onClick: () => setSelected(null) },
      h("div", { class: "sheet", onClick: (e) => e.stopPropagation() }, [
        // Portrait (if provided in character JSON)
        selected.portrait ? h("img", { class: "portrait", src: selected.portrait, alt: selected.displayName }) : null,

        h("h3", null, selected.displayName),
        h("div", { class: "kv small" }, `ID: ${selected.id} · Type: ${selected.type}`),

        // Base stats
        h("div", { class: "kvgrid", style: "margin-top:8px" }, [
          h("div", { class: "label" }, "HP"),  h("div", { class: "value" }, selected.baseStats?.hp ?? "—"),
          h("div", { class: "label" }, "MP"),  h("div", { class: "value" }, selected.baseStats?.mp ?? "—"),
          h("div", { class: "label" }, "STR"), h("div", { class: "value" }, selected.baseStats?.strength ?? "—"),
          h("div", { class: "label" }, "MAG"), h("div", { class: "value" }, selected.baseStats?.magic ?? "—"),
          h("div", { class: "label" }, "DEF"), h("div", { class: "value" }, selected.baseStats?.defense ?? "—"),
          h("div", { class: "label" }, "SPD"), h("div", { class: "value" }, selected.baseStats?.speed ?? "—"),
          h("div", { class: "label" }, "LCK"), h("div", { class: "value" }, selected.baseStats?.luck ?? "—")
        ]),

        // Traits
        h("div", { class: "kv", style: "margin-top:10px" }, [
          h("div", { class: "label" }, "Traits"),
          h("div", null, traits.length ? traits.map(x => h(Badge, null, x)) : h("span", { class:"small" }, "—"))
        ]),
        // Likes / Dislikes from sensitivities
        h("div", { class: "kv", style: "margin-top:10px" }, [
          h("div", { class: "label" }, "Likes"),
          h("div", null, likes.length ? likes.map(([k,w]) => h(Badge, null, `${k} (+${w})`)) : h("span", { class:"small" }, "—"))
        ]),
        h("div", { class: "kv", style: "margin-top:6px" }, [
          h("div", { class: "label" }, "Dislikes"),
          h("div", null, hates.length ? hates.map(([k,w]) => h(Badge, null, `${k} (${w})`)) : h("span", { class:"small" }, "—"))
        ]),

        // Affinity snapshot
        h("div", { class: "kv", style: "margin-top:8px" }, [
          h(Badge, null, `Affinity snapshot: ${selectedAffinity}`)
        ]),

        h("div", { class: "sheet-actions" }, [
          h(Button, { onClick: () => setSelected(null) }, "Close"),
          h(Button, { ghost: true, onClick: () => alert('Open profile screen (todo)') }, "Open Profile")
        ])
      ])
    )
  ]);
}
