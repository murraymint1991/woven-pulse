// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import { useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";

import {
  getPairState,
  setPairState,
  appendDiaryEntry,
  logWitnessed,
  selectDesireEntries,
  selectEventLine,
} from "../systems/diary.js";

const asStr = (v) => (v == null ? "" : String(v));
const lower = (s) => asStr(s).trim().toLowerCase();
const clamp = (n, d = 0) => {
  const k = Number(n);
  return Number.isFinite(k) ? k : d;
};

function Pill({ active, onClick, children }) {
  return h(
    "span",
    {
      class: "pill",
      style:
        "display:inline-block;padding:8px 12px;border-radius:16px;cursor:pointer;user-select:none;" +
        (active
          ? "background:#1e294a;color:#9eeefc;border:1px solid #2d3b68;"
          : "background:#0b1020;color:#b7c0d1;border:1px solid #1b223d;"),
      onClick,
    },
    children
  );
}

export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = [],
  Nav, // unused here but passed from main for consistency
}) {
  // force rerenders after we mutate diary/pair state (dev style)
  const [rev, setRev] = useState(0);
  const bump = () => setRev((v) => v + 1);

  // pair state (path/stage)
  const pair = useMemo(
    () => getPairState(characterId, targetId),
    [characterId, targetId, rev]
  );
  const path = pair.path || "love";
  const stage = pair.stage || 0;

  const hasDiary = !!diary;
  const entries = hasDiary && Array.isArray(diary.entries) ? diary.entries : [];

  // ===== actions =====
  function setPath(next) {
    setPairState(characterId, targetId, { path: next });
    bump();
  }
  function incStage(n) {
    setPairState(characterId, targetId, { stage: clamp(stage + n, 0) });
    bump();
  }

  function addFreeformLine(text) {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: asStr(text) || "[dev] freeform",
      path: pair.path,
      stage: pair.stage,
      tags: ["#dev"],
    });
    bump();
  }

  // Story beats
  function addMeet() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text:
        "[We crossed paths in the slums; I told myself to keep walking… and still I looked back.]",
      path,
      stage,
      tags: ["#interaction"],
    });
    bump();
  }

  function addFirstKiss() {
    if (!diary) return;
    const line =
      selectEventLine(diary, "first_kiss", path, stage) ||
      "[dev] no first_kiss line for this path/stage";
    appendDiaryEntry(diary, {
      text: line,
      path,
      stage,
      mood: ["fluttered"],
      tags: ["#event:first_kiss", `#with:${targetId}`],
    });
    bump();
  }

  function addEnterInn() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[door closed; the world got smaller and louder]",
      path,
      stage,
      tags: ["#location:inn"],
    });
    bump();
  }

  function addBloomstone() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[used Bloomstone (Sapphire)]",
      path,
      stage,
      tags: ["#item", "#bloomstone:sapphire"],
    });
    bump();
  }

  function addRiskyAlley() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[We moved like thieves in the alley—quiet, breath shared, pulse too loud.]",
      path,
      stage,
      tags: ["#risky"],
    });
    bump();
  }

  // Witness buttons use the witnessed catalog if present
  function catchWitness(who, explicitPath) {
    if (!diary) return;
    logWitnessed(diary, who, {
      path: explicitPath || path,
      stage,
    });
    bump();
  }

  // quick desire preview (not required to add anything—just to show we can read)
  const desirePreview = useMemo(() => {
    if (!diary) return [];
    const rows = selectDesireEntries(diary, path) || [];
    // just show the first one as a tiny helper
    return rows.slice(0, 1).map((r) => (typeof r === "string" ? r : r?.text || ""));
  }, [diary, path, stage, rev]);

  return h("div", { class: "card" }, [
    h("h3", null, "DEV · Diary (timeline only)"),
    h("div", { class: "small", style: "margin-bottom:8px" }, [
      "Path: ",
      h(Badge, null, path),
      " · Stage: ",
      h(Badge, null, String(stage)),
      desirePreview.length
        ? h("span", { class: "small", style: "margin-left:8px; opacity:0.8" }, [
            "desire hint — ",
            desirePreview[0],
          ])
        : null,
    ]),

    // path & stage controls
    h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
      h("div", { class: "kv" }, [
        h("div", { class: "label" }, "Path"),
        h("div", { style: "display:flex; gap:8px; flex-wrap:wrap" }, [
          h(Pill, { active: lower(path) === "love", onClick: () => setPath("love") }, "Love"),
          h(Pill, { active: lower(path) === "corruption", onClick: () => setPath("corruption") }, "Corruption"),
          h(Pill, { active: lower(path) === "hybrid", onClick: () => setPath("hybrid") }, "Hybrid"),
        ]),
      ]),
      h("div", { class: "kv" }, [
        h("div", { class: "label" }, "Stage"),
        h("div", { style: "display:flex; gap:8px" }, [
          h(Button, { ghost: true, onClick: () => incStage(-1) }, "–"),
          h(Badge, null, String(stage)),
          h(Button, { onClick: () => incStage(+1) }, "+"),
        ]),
      ]),
    ]),

    // story beat buttons
    h("div", { class: "kv", style: "margin-top:8px; gap:8px; flex-wrap:wrap" }, [
      h("div", { class: "label" }, "Story beats"),
      h(Button, { onClick: addMeet }, "Meet"),
      h(Button, { onClick: addFirstKiss }, "First Kiss"),
      h(Button, { onClick: addEnterInn }, "Enter Inn"),
      h(Button, { onClick: addBloomstone }, "Use Bloomstone (Sapphire)"),
      h(Button, { onClick: addRiskyAlley }, "Risky · Alley Stealth"),
    ]),

    // witnessed buttons (grouped by who + per-path convenience)
    h("div", { class: "kv", style: "margin-top:10px; gap:8px; flex-wrap:wrap" }, [
      h("div", { class: "label" }, "Caught by (writes to timeline)"),
      // for each witness, show small buttons for love/corruption/hybrid
      ...witnesses.map((who) =>
        h("div", { class: "kv", style: "gap:6px; align-items:center" }, [
          h(Badge, null, who),
          h(Button, { onClick: () => catchWitness(who, "love") }, "Love"),
          h(Button, { ghost: true, onClick: () => catchWitness(who, "corruption") }, "Corruption"),
          h(Button, { ghost: true, onClick: () => catchWitness(who, "hybrid") }, "Hybrid"),
        ])
      ),
    ]),

    // freeform input
    h("div", { class: "kv", style: "margin-top:12px" }, [
      h("div", { class: "label" }, "Log current Desire line"),
    ]),
    h(FreeformInput, { onAdd: (t) => addFreeformLine(t) }),

    // ===== timeline =====
    h("div", { class: "card", style: "margin-top:16px" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class: "kv small" }, `Path: ${path}   Stage: ${stage}`),
      // a tiny “current desire hint” was already shown above; no need to duplicate here
    ]),

    h("div", { class: "card", style: "margin-top:12px" }, [
      h("h3", null, "Timeline"),
      !hasDiary
        ? h("div", { class: "small" }, "No diary loaded.")
        : entries.length === 0
        ? h("div", { class: "small" }, "[empty]")
        : h(
            "div",
            null,
            entries.map((e) =>
              h("div", { class: "logline" }, [
                // a simple tag strip
                h(
                  "div",
                  { class: "small", style: "opacity:0.7; margin-bottom:2px" },
                  [
                    e.at ? new Date(e.at).toISOString().slice(0, 10) : "0001-01-01",
                    "  ",
                    e.tags && e.tags.length
                      ? e.tags.map((t) => h(Badge, { ghost: true }, t)).slice(0, 3)
                      : null,
                  ]
                ),
                h("div", null, e.text || ""),
              ])
            )
          ),
    ]),
  ]);
}

function FreeformInput({ onAdd }) {
  const [t, setT] = useState("");
  function add() {
    if (!t.trim()) return;
    onAdd(t);
    setT("");
  }
  return h("div", { style: "display:flex; gap:8px; align-items:center" }, [
    h("input", {
      value: t,
      onInput: (e) => setT(e.currentTarget.value),
      placeholder: "Freeform line…",
      style:
        "flex:1; min-width:280px; padding:10px 12px; background:#0b1020; color:#cfe8ff; border:1px solid #1b223d; border-radius:10px;",
    }),
    h(Button, { onClick: add }, "Add"),
  ]);
}
