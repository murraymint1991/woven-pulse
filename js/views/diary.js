// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import {
  selectDesireEntries,
  selectReflectionEntries,
  getPairState,
  setPairState,
  appendDiaryEntry,
} from "../systems/diary.js";
import { getClock, advanceHours, advanceDays } from "../systems/clock.js";
import { Button, Badge } from "../ui.js";

/* Helpers */
function groupByDay(entries) {
  const out = {};
  (entries || []).forEach((e) => {
    const day = e.date?.slice(0, 10) || "unknown";
    (out[day] ||= []).push(e);
  });
  return out;
}
function moodForPath(path) {
  return path === "love" ? "hopeful" : path === "corruption" ? "tempted" : "conflicted";
}

/* crude rerender helper: forces a sync refresh by toggling hash */
function rerender() {
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(() => {
    location.hash = h0;
  }, 0);
}

export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = ["tifa", "renna", "yuffie"],
  Nav,
}) {
  if (!diary) return h("div", { class: "card" }, "No diary data loaded.");

  // --- current pair state (lane + stage)
  const pair = getPairState(characterId, targetId); // { path, stage }

  // when path/stage changes, snapshot the newest visible desire line into the timeline
  function snapshotDesire(target, path, stage, reasonTag) {
    const lines = selectDesireEntries(diary, target, path, stage);
    const text = lines[lines.length - 1] || "(no entry)";
    appendDiaryEntry(diary, {
      text,
      path,
      stage,
      mood: [moodForPath(path)],
      tags: ["auto", reasonTag],
    });
    rerender();
  }

  const setPath = (nextPath) => {
    const next = setPairState(characterId, targetId, { path: nextPath });
    snapshotDesire(targetId, next.path, next.stage, "path-change");
  };

  const setStage = (delta) => {
    const nextStage = Math.max(0, Math.min(5, Number(pair.stage || 0) + delta));
    const next = setPairState(characterId, targetId, { stage: nextStage });
    snapshotDesire(targetId, next.path, next.stage, "stage-change");
  };

  // data for the panel sections
  const desire = selectDesireEntries(diary, targetId, pair.path, pair.stage);

  // timeline: newest day first
  const grouped = Object.entries(groupByDay(diary.entries || [])).sort((a, b) =>
    a[0] < b[0] ? 1 : -1
  );

  // in-game clock (for the tiny dev strip)
  const c = getClock();

  // local ref for quick notes
  let noteEl = null;

  return h("div", null, [
    // Header
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Diary — Aerith"),
      h(Nav, null),
      // clock controls (dev) — no full reload
      h("div", { class: "kv small" }, [
        `Day ${c.day}, ${String(c.hour).padStart(2, "0")}:00`,
        h(
          Button,
          { ghost: true, onClick: () => { advanceHours(1); rerender(); } },
          "+1h"
        ),
        h(
          Button,
          { ghost: true, onClick: () => { advanceDays(1); rerender(); } },
          "+1d"
        ),
      ]),
    ])),

    // Desires
    h("div", { class: "card diary-card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class: "kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`),
      ]),
      h("div", { class: "kv" }, [
        h(Button, { onClick: () => setPath("love"), ghost: pair.path !== "love" }, "Love"),
        h(
          Button,
          { onClick: () => setPath("corruption"), ghost: pair.path !== "corruption" },
          "Corruption"
        ),
        h(Button, { onClick: () => setPath("hybrid"), ghost: pair.path !== "hybrid" }, "Hybrid"),
        h(Button, { onClick: () => setStage(-1), ghost: true }, "Stage −"),
        h(Button, { onClick: () => setStage(+1), ghost: true }, "Stage +"),
      ]),
      desire.length
        ? h(
            "div",
            { class: "diary-hand" },
            desire.map((t, i) => h("p", { key: i }, t))
          )
        : h("div", { class: "small" }, "— no entries yet —"),
    ]),

    // Reflections
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Reflections (witnessed)"),
      ...witnesses.map((w) => {
        const lines = selectReflectionEntries(diary, targetId, w, pair.stage);
        return h("div", { class: "subcard", style: "margin-top:8px" }, [
          h("h4", null, `With ${w}`),
          lines.length
            ? h(
                "div",
                { class: "diary-hand" },
                lines.map((t, i) => h("p", { key: w + i }, t))
              )
            : h("div", { class: "small" }, "— no entries yet —"),
        ]);
      }),
    ]),

    // Timeline
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Timeline"),
      // quick note
      h("div", { class: "kv small" }, [
        h("input", {
          type: "text",
          placeholder: "Add note…",
          style: "flex:1",
          ref: (el) => (noteEl = el),
        }),
        h(
          Button,
          {
            ghost: true,
            onClick: () => {
              const txt = (noteEl?.value || "").trim();
              if (!txt) return;
              appendDiaryEntry(diary, { text: txt, tags: ["note"] });
              noteEl.value = "";
              rerender();
            },
          },
          "Add"
        ),
      ]),
      ...grouped.map(([day, entries]) =>
        h("div", { class: "diary-day" }, [
          h("div", { class: "diary-meta" }, [
            h(Badge, null, day),
            ...(entries[0].mood || []).map((m) => h(Badge, { ghost: true }, m)),
            ...(entries[0].tags || []).map((t) => h(Badge, { ghost: true }, `#${t}`)),
          ]),
          ...entries.map((e, i) =>
            h("div", { class: "diary-hand", key: day + i }, [
              h("p", null, e.text),
              ...((e.asides || []).map((a, j) => h("p", { class: "diary-thought", key: j }, a))),
            ])
          ),
        ])
      ),
    ]),
  ]);
}
