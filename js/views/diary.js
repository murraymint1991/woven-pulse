// js/views/diary.js  — full replacement

import { h } from "https://esm.sh/preact@10.22.0";
import { useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";

import {
  appendDiaryEntry,
  logWitnessed,
  getPairState,
  setPairState,
  selectDesireEntries,
  selectEventLine
} from "../systems/diary.js";

// ───────────────────────────────────────────────────────────────────────────────
// Small helpers
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pretty = (v) => (v == null ? "—" : String(v));

export default function DiaryView({
  diary,
  characterId,
  targetId,
  witnesses = ["tifa", "renna", "yuffie"],
  Nav
}) {
  // bump this to force re-render after we mutate the diary object
  const [rev, setRev] = useState(0);

  // derive current pair/path/stage from systems state
  const ps = useMemo(
    () => (diary ? getPairState(diary.characterId, diary.targetId) : { path: "love", stage: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diary, rev]
  );

  const curPath = String(ps?.path || "love").toLowerCase();
  const curStage = Number(ps?.stage || 0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Actions

  function setPath(p) {
    if (!diary) return;
    setPairState(diary.characterId, diary.targetId, { path: String(p).toLowerCase(), stage: 0 });
    setRev((v) => v + 1);
  }

  function incStage(delta = 1) {
    if (!diary) return;
    const n = clamp(Number(curStage) + Number(delta), 0, 99);
    setPairState(diary.characterId, diary.targetId, { stage: n });
    setRev((v) => v + 1);
  }

  function seedTest() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[test] dev seeded entry",
      path: curPath,
      stage: curStage,
      tags: ["#dev"]
    });
    setRev((v) => v + 1);
  }

  function clearEntries() {
    if (!diary) return;
    diary.entries = [];
    setRev((v) => v + 1);
  }

  function logFreeform(text) {
    if (!diary || !text?.trim()) return;
    appendDiaryEntry(diary, { text: text.trim(), path: curPath, stage: curStage });
    setRev((v) => v + 1);
  }

  function logFirstKiss() {
    if (!diary) return;
    const line =
      selectEventLine(diary, "first_kiss", curPath, curStage) ||
      (diary?.events?.first_kiss?.[curPath] || []).slice(-1)[0] ||
      null;

    appendDiaryEntry(diary, {
      text: line || "[dev] no first-kiss line found",
      path: curPath,
      stage: curStage,
      mood: ["fluttered"],
      tags: ["#event:first_kiss", `#with:${targetId}`]
    });
    setRev((v) => v + 1);
  }

  function logCurrentDesire() {
    if (!diary) return;
    const pool = selectDesireEntries(diary, curPath); // returns array for path or 'any'
    // Prefer the last line whose stageMin <= current stage. Fallback to last.
    let chosen = null;
    if (Array.isArray(pool) && pool.length) {
      // findLast poly
      chosen =
        [...pool].reverse().find((x) => (x.stageMin ?? 0) <= curStage) || pool[pool.length - 1];
    }

    appendDiaryEntry(diary, {
      text: chosen?.text || "[dev] no desire line for this stage/path",
      path: curPath,
      stage: curStage,
      tags: ["#desire"]
    });
    setRev((v) => v + 1);
  }

  function logCaught(who, pathOverride) {
    if (!diary) return;
    const p = String(pathOverride || curPath || "love").toLowerCase();
    logWitnessed(diary, who, { path: p, stage: curStage });
    setRev((v) => v + 1);
  }

  function logEnter(place) {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: `[entered ${place}]`,
      path: curPath,
      stage: curStage,
      tags: ["#location"]
    });
    setRev((v) => v + 1);
  }

  function logItem(tag) {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[used item]",
      path: curPath,
      stage: curStage,
      tags: ["#item", tag]
    });
    setRev((v) => v + 1);
  }

  function logRisky() {
    if (!diary) return;
    appendDiaryEntry(diary, {
      text: "[We moved like thieves in the alley—quiet, breath shared, pulse too loud.]",
      path: curPath,
      stage: curStage,
      tags: ["#risky"]
    });
    setRev((v) => v + 1);
  }

  function logMorning() {
    if (!diary) return;
    appendDiaryEntry(diary, { text: "[morning passes…]", path: curPath, stage: curStage, tags: ["#time"] });
    setRev((v) => v + 1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI bits

  const PathPills = () =>
    h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
      h(Badge, null, `Path: ${curPath}`),
      h(Badge, null, `Stage: ${curStage}`),
      h(Button, { onClick: () => setPath("love"), ghost: curPath !== "love" }, "Love"),
      h(Button, { onClick: () => setPath("corruption"), ghost: curPath !== "corruption" }, "Corruption"),
      h(Button, { onClick: () => setPath("hybrid"), ghost: curPath !== "hybrid" }, "Hybrid"),
      h(Button, { onClick: () => incStage(+1) }, "Stage +"),
      h(Button, { onClick: () => incStage(-1), ghost: true }, "Stage –")
    ]);

  const StoryBeats = () =>
    h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
      h(Button, { onClick: seedTest }, "Seed Test Entry"),
      h(Button, { ghost: true, onClick: clearEntries }, "Clear Entries"),

      h(Button, { onClick: () => appendDiaryEntry(diary, { text: "[we met]", path: curPath, stage: curStage, tags: ["#interaction"] }) || setRev(v => v + 1) }, "Meet"),
      h(Button, { onClick: logFirstKiss }, "First Kiss"),
      h(Button, { onClick: () => logEnter("Tent") }, "Enter Tent"),
      h(Button, { onClick: () => logEnter("Inn") }, "Enter Inn"),
      h(Button, { onClick: () => logItem("#bloomstone:sapphire") }, "Use Bloomstone (Sapphire)"),
      h(Button, { onClick: logRisky }, "Risky · Alley Stealth")
    ]);

  const TimeBeat = () =>
    h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
      h(Button, { ghost: true, onClick: logMorning }, "Time · Morning Tick")
    ]);

  const CaughtRow = ({ who }) =>
    h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
      h(Badge, null, who),
      h(Button, { onClick: () => logCaught(who, "love") }, "Love"),
      h(Button, { onClick: () => logCaught(who, "corruption") }, "Corruption"),
      h(Button, { onClick: () => logCaught(who, "hybrid") }, "Hybrid")
    ]);

  const Freeform = () => {
    let inputRef = null;
    return h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap; margin-top:8px" }, [
      h("input", {
        type: "text",
        placeholder: "Freeform line…",
        style:
          "min-width:320px; padding:10px 12px; border-radius:10px; background:#0b1020; color:#9eeefc; border:1px solid #1b2a44;",
        ref: (r) => (inputRef = r)
      }),
      h(Button, {
        onClick: () => {
          logFreeform(inputRef?.value || "");
          if (inputRef) inputRef.value = "";
        }
      }, "Add"),
      h(Button, { ghost: true, onClick: logCurrentDesire }, "Log current Desire line")
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render

  if (!diary) {
    return h("div", { class: "card" }, [
      h("h3", null, "Diary"),
      h("div", { class: "small" }, "No diary data loaded.")
    ]);
  }

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "DEV · Diary (timeline only)"),
      h("div", { class: "subtitle" }, `Path: ${curPath} · Stage: ${curStage}`),
      Nav ? h(Nav, null) : null
    ])),

    // Path + Stage controls
    h("div", { class: "card" }, [h(PathPills)]),

    // Story beats
    h("div", { class: "card" }, [
      h("h3", null, "Story beats:"),
      h(StoryBeats),
      h(TimeBeat)
    ]),

    // Witnessed quick buttons
    h("div", { class: "card" }, [
      h("h3", null, "Caught by (writes to timeline):"),
      witnesses.map((w) => h(CaughtRow, { who: w }))
    ]),

    // Freeform + Desire
    h("div", { class: "card" }, [h("h3", null, "Log current Desire line"), h(Freeform)]),

    // Timeline preview (very light)
    h("div", { class: "card" }, [
      h("h3", null, `Timeline`),
      (Array.isArray(diary.entries) && diary.entries.length
        ? diary.entries
        : []
      ).slice(-30).map((e) =>
        h("div", { class: "kv" }, [
          h(Badge, null, `${e.path}/${pretty(e.stage)}`),
          h("span", null, e.text || "—")
        ])
      )
    ])
  ]);
}
