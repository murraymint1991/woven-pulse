// js/views/diary.js
// Diary view — timeline-first. Supports "Caught" buttons via witnessed_flat.

import { h } from "https://esm.sh/preact@10.22.0";
import {
  selectDesireEntries,
  selectWitnessedLine,
  appendDiaryEntry,
  logWitnessed,
  getPairState,
  setPairState
} from "../systems/diary.js";
import { fmtClock, getClock, advanceMinutes, advanceHours, advanceDays } from "../systems/clock.js";
import { Button, Badge } from "../ui.js";

const MAX_STAGE = 10;
const WITNESSES = ["tifa", "renna", "yuffie"];
const PATHS = ["love", "corruption", "hybrid"];

function groupByDay(entries) {
  const out = {};
  (entries || []).forEach(e => {
    const d = (e.date || "").slice(0, 10) || "unknown";
    (out[d] ||= []).push(e);
  });
  return out;
}

export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = WITNESSES,
  Nav
}) {
  if (!diary) return h("div", { class: "card" }, "No diary data loaded.");

  const pair = getPairState(characterId, targetId);
  const setPath = (p) => { setPairState(characterId, targetId, { path: p }); rerender(); };
  const setStage = (delta) => {
    const n = Math.max(0, Math.min(MAX_STAGE, Number(pair.stage || 0) + delta));
    setPairState(characterId, targetId, { stage: n }); rerender();
  };

  const desireLane = selectDesireEntries(diary, targetId, pair.path, pair.stage);
  const grouped = groupByDay(diary.entries);
  const clockNow = getClock();

  const DEV = new URLSearchParams(location.search).get("dev") !== "0";

  const appendFree = (text, extra = {}) => {
    appendDiaryEntry(diary, {
      text,
      path: extra.path ?? pair.path,
      stage: extra.stage ?? pair.stage,
      mood: extra.mood || [],
      tags: extra.tags || []
    });
    rerender();
  };

  const fireEvent = (type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.emitGameEvent === "function") {
      window.emitGameEvent(type, payload);
      rerender();
    }
  };

  // Caught buttons
  const logCaught = (who, path) => {
    const line = selectWitnessedLine(diary, targetId, who, path, pair.stage);
    if (!line) {
      console.warn("[caught] no lane/line for", { who, path, stage: pair.stage });
      // minimal UX nudge so we know why nothing appeared
      appendFree(`[dev] no witnessed line for ${who}/${path} at stage ${pair.stage}`, { tags:["#dev","#witnessed:none"] });
      return;
    }
    logWitnessed(diary, who, { text: line, path, stage: pair.stage });
    rerender();
  };

  return h("div", null, [
    // Header
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, `Diary — ${characterId.charAt(0).toUpperCase() + characterId.slice(1)}`),
      h(Nav, null),
      h("div", { class: "kv small" }, [
        h(Badge, null, fmtClock(clockNow)),
        h(Button, { ghost: true, onClick: () => { advanceMinutes(15); location.reload(); } }, "+15m"),
        h(Button, { ghost: true, onClick: () => { advanceHours(1);  location.reload(); } }, "+1h"),
        h(Button, { ghost: true, onClick: () => { advanceDays(1);   location.reload(); } }, "+1d")
      ])
    ])),

    // DEV PANEL
    DEV ? h("div", { class: "card", style: "border:dashed 1px #647; background:#0d0f15" }, [
      h("h3", null, "DEV · Diary (timeline only)"),
      h("div", { class: "kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      // Path/Stage controls
      h("div", { class: "kv", style: "flex-wrap:wrap; gap:6px" }, [
        ...PATHS.map(p => h(Button, { onClick: () => setPath(p), ghost: pair.path !== p }, p[0].toUpperCase()+p.slice(1))),
        h(Button, { ghost: true, onClick: () => setStage(-1) }, "Stage −"),
        h(Button, { ghost: true, onClick: () => setStage(+1) }, "Stage +")
      ]),
      // Story beats (forward events to main's switch)
      h("div", { class: "kv small", style: "margin-top:8px" }, "Story beats:"),
      h("div", { class: "kv", style: "flex-wrap:wrap; gap:6px" }, [
        h(Button, { ghost:true, onClick: () => fireEvent("interaction.meet") }, "Meet"),
        h(Button, { ghost:true, onClick: () => fireEvent("interaction.firstKiss") }, "First Kiss"),
        h(Button, { ghost:true, onClick: () => fireEvent("location.enter", { place: "Tent" }) }, "Enter Tent"),
        h(Button, { ghost:true, onClick: () => fireEvent("location.enter", { place: "Inn" }) }, "Enter Inn"),
        h(Button, { ghost:true, onClick: () => fireEvent("item.bloomstone.sapphire") }, "Use Bloomstone (Sapphire)"),
        h(Button, { ghost:true, onClick: () => fireEvent("risky.alleyStealth") }, "Risky · Alley Stealth"),
        h(Button, { ghost:true, onClick: () => fireEvent("time.morningTick") }, "Time · Morning Tick")
      ]),
      // Caught buttons
      h("div", { class: "kv small", style: "margin-top:8px" }, "Caught by (writes to timeline):"),
      ...witnesses.map(w =>
        h("div", { class: "kv", style: "flex-wrap:wrap; gap:6px" }, [
          h(Badge, null, w),
          ...PATHS.map(p => h(Button, { ghost:true, onClick: () => logCaught(w, p) }, `${p[0].toUpperCase()+p.slice(1)}`))
        ])
      ),
      // Desire helper
      h("div", { class: "kv", style: "margin-top:8px" }, [
        h(Button, {
          ghost: true,
          onClick: () => {
            if (!desireLane.length) return;
            appendDiaryEntry(diary, {
              text: `[desire:${pair.path} s${pair.stage}] ${desireLane[desireLane.length - 1]}`,
              path: pair.path,
              stage: pair.stage,
              tags: ["#desire", `#with:${targetId}`],
              mood: ["pensive"]
            });
            rerender();
          }
        }, "Log current Desire line")
      ]),
      // Freeform
      h("div", { class: "kv", style:"align-items:flex-start; gap:8px" }, [
        h("textarea", { id:"freeLine", placeholder: "Freeform line…", style: "min-height:60px; width:100%;" }),
        h(Button, {
          ghost: true,
          onClick: () => {
            const el = document.getElementById("freeLine");
            const txt = (el?.value || "").trim();
            if (!txt) return;
            appendFree(txt, { tags:["#free"] });
            if (el) el.value = "";
          }
        }, "Add")
      ])
    ]) : null,

    // Desires
    h("div", { class: "card diary-card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class: "kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      (desireLane && desireLane.length)
        ? h("div", { class: "diary-hand" }, desireLane.map((t, i) => h("p", { key: i }, t)))
        : h("div", { class: "small" }, "— no entries yet —")
    ]),

    // Timeline
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Timeline"),
      (Object.keys(grouped).length === 0)
        ? h("div", { class: "small" }, "— no timeline entries yet —")
        : null,
      ...Object.entries(grouped).map(([day, entries]) =>
        h("div", { class: "diary-day" }, [
          h("div", { class: "diary-meta" }, [
            h(Badge, null, day),
            ...((entries[0].mood || []).map((m, i) => h(Badge, { ghost: true, key: `m${i}` }, m))),
            ...((entries[0].tags || []).map((t, i) => h(Badge, { ghost: true, key: `t${i}` }, t)))
          ]),
          ...entries.map((e, i) =>
            h("div", { class: "diary-hand", key: day + i }, [
              h("p", null, e.text),
              ...((e.asides || []).map((a, j) => h("p", { class: "diary-thought", key: j }, a)))
            ])
          )
        ])
      )
    ])
  ]);
}

function rerender() {
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(() => { location.hash = h0; }, 0);
}
