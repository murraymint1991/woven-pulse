// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import { useEffect, useMemo, useState } from "https://esm.sh/preact@10.22.0/hooks";
import { Button, Badge } from "../ui.js";

import {
  appendDiaryEntry,
  getPairState,
  setPairState,
  logWitnessed,
  selectEventLine,
  selectDesireLine,
} from "../systems/diary.js";

/* small pretty helpers */
const Title = ({ children }) => h("div", { class: "stage-title", style: "margin-bottom:8px" }, children);
const Section = ({ title, children }) =>
  h("div", { class: "card" }, [h("h3", null, title), children]);
const Tag = ({ children }) => h(Badge, null, children);

/* ===========================
   Main
   =========================== */
export default function DiaryView({
  diary,
  characterId,
  targetId,
  witnesses = [],
  Nav
}) {
  // persist path+stage through the systems pair state
  const [rev, setRev] = useState(0);
  const ps = useMemo(() => getPairState(characterId, targetId), [characterId, targetId, rev]);
  const [path, setPath] = useState(ps.path || "love");
  const [stage, setStage] = useState(ps.stage || 0);

  // keep local UI == system state
  useEffect(() => {
    const cur = getPairState(characterId, targetId);
    setPath(cur.path || "love");
    setStage(cur.stage || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, targetId, diary]);

  function updatePath(p) {
    setPairState(characterId, targetId, { path: p });
    setPath(p);
    setRev(v => v + 1);
  }
  function updateStage(n) {
    const s = Math.max(0, Number(n) || 0);
    setPairState(characterId, targetId, { stage: s });
    setStage(s);
    setRev(v => v + 1);
  }

  const hasDiary = !!diary;

  /* ===========================
     Story beat handlers
     =========================== */
  function pushLine(text, extra = {}) {
    if (!hasDiary) return;
    appendDiaryEntry(diary, {
      text,
      path,
      stage,
      tags: extra.tags || [],
      mood: extra.mood || []
    });
    setRev(v => v + 1);
  }

  function doMeet() {
    pushLine("[We crossed paths in the slums; I told myself to keep walking… and still I looked back.]", { tags: ["#interaction"] });
  }

  function doFirstKiss() {
    if (!hasDiary) return;
    const line =
      selectEventLine(diary, "first_kiss", path, stage) ||
      selectEventLine(diary, "first_kiss", "any", stage) ||
      null;

    appendDiaryEntry(diary, {
      text: line || "[dev] no first-kiss line found",
      path,
      stage,
      mood: ["fluttered"],
      tags: ["#event:first_kiss", `#with:${targetId}`]
    });
    setRev(v => v + 1);
  }

  function doEnterTent()  { pushLine("[We ducked into a threadbare tent; quiet, close, shadows breathing with us.]", { tags: ["#location"] }); }
  function doEnterInn()   { pushLine("[A creaking inn room—thin walls, thinner excuses to stay.]",          { tags: ["#location"] }); }
  function doBloomstone() { pushLine("[A sapphire bloomstone glowed against my palm. I felt braver—worse—truer.]", { tags: ["#item", "#bloomstone:sapphire"] }); }
  function doRisky()      { pushLine("[We moved like thieves in the alley—quiet, breath shared, pulse too loud.]", { tags: ["#risky"] }); }
  function doMorning()    { pushLine("[morning passes…]", { tags: ["#time"] }); }

  /* ===========================
     Witnessed / desires
     =========================== */
  function doWitness(who, p) {
    if (!hasDiary) return;
    // use current stage; allow an override path per button
    logWitnessed(diary, who, { path: p || path, stage });
    setRev(v => v + 1);
  }

  function logCurrentDesire() {
    if (!hasDiary) return;
    const line =
      selectDesireLine(diary, path, stage, targetId) ||
      // last-resort: try any
      selectDesireLine(diary, "any", stage, targetId) ||
      null;

    appendDiaryEntry(diary, {
      text: line || `[dev] no desire line for this stage/path`,
      path,
      stage,
      tags: ["#desire"]
    });
    setRev(v => v + 1);
  }

  /* ===========================
     Dev helpers
     =========================== */
  function seedTest() {
    pushLine("[test] dev seeded entry", { tags: ["#dev"] });
  }
  function clearEntries() {
    if (!hasDiary) return;
    diary.entries = [];
    setRev(v => v + 1);
  }

  /* ===========================
     Render
     =========================== */

  const timeline = hasDiary ? (Array.isArray(diary.entries) ? diary.entries.slice() : []) : [];

  return h("div", null, [
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h(Title, null, "Diary · Pair"),
      h(Nav, null),
      h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap; margin-top:8px" }, [
        h(Badge, null, `Actor: ${characterId}`),
        h(Badge, null, `Target: ${targetId}`),

        // Path chooser
        h("div", { class: "kv", style: "gap:6px; margin-left:12px" }, [
          h("span", { class: "small" }, "Path:"),
          h(Button, { ghost: path !== "love", onClick: () => updatePath("love") }, "Love"),
          h(Button, { ghost: path !== "corruption", onClick: () => updatePath("corruption") }, "Corruption"),
          h(Button, { ghost: path !== "hybrid", onClick: () => updatePath("hybrid") }, "Hybrid")
        ]),

        // Stage control
        h("div", { class: "kv", style: "gap:6px; margin-left:12px" }, [
          h("span", { class: "small" }, `Stage: ${stage}`),
          h(Button, { ghost: true, onClick: () => updateStage(Math.max(0, stage - 1)) }, "Stage −"),
          h(Button, { onClick: () => updateStage(stage + 1) }, "Stage +")
        ])
      ])
    ])),

    // Story beats
    h(Section, { title: "Story beats:" }, [
      h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
        h(Button, { onClick: seedTest }, "Seed Test Entry"),
        h(Button, { ghost: true, onClick: clearEntries }, "Clear Entries"),
        h(Button, { onClick: doMeet }, "Meet"),
        h(Button, { onClick: doFirstKiss }, "First Kiss"),
        h(Button, { onClick: doEnterTent }, "Enter Tent"),
        h(Button, { onClick: doEnterInn }, "Enter Inn"),
        h(Button, { onClick: doBloomstone }, "Use Bloomstone (Sapphire)")
      ]),
      h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap; margin-top:10px" }, [
        h(Button, { onClick: doRisky }, "Risky · Alley Stealth"),
        h(Button, { onClick: doMorning }, "Time · Morning Tick")
      ])
    ]),

    // Witnessed block
    h(Section, { title: "Caught by (writes to timeline):" }, [
      h("div", { class: "grid" }, (witnesses.length ? witnesses : ["tifa", "renna", "yuffie"]).map((who) =>
        h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap; margin-bottom:6px" }, [
          h(Tag, null, who),
          h(Button, { onClick: () => doWitness(who, "love") }, "Love"),
          h(Button, { onClick: () => doWitness(who, "corruption") }, "Corruption"),
          h(Button, { onClick: () => doWitness(who, "hybrid") }, "Hybrid"),
        ])
      ))
    ]),

    // Desires quick log
    h(Section, { title: "Log current Desire line" }, [
      h("div", { class: "kv", style: "gap:8px; flex-wrap:wrap" }, [
        h(Button, { onClick: logCurrentDesire }, "Log current Desire line")
      ])
    ]),

    // Timeline
    h(Section, { title: "Timeline" }, [
      !hasDiary
        ? h("div", { class: "small" }, "No diary data loaded.")
        : (timeline.length
            ? h("div", null,
                timeline.map((e, i) =>
                  h("div", { class: "kv", style: "align-items:flex-start" }, [
                    h(Tag, null, `${e.path || "love"}/${e.stage ?? 0}`),
                    h("div", null, e.text || "")
                  ])
                )
              )
            : h("div", { class: "small" }, "— no entries yet —")
          )
    ])
  ]);
}
