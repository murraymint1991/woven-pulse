// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import {
  selectDesireEntries,
  selectReflectionEntries,
  getPairState,
  setPairState,
  appendDiaryEntry,           // ← new: log into Timeline on changes
} from "../systems/diary.js";
import {
  fmtClock,
  getClock,
  advanceMinutes,
  advanceHours,
  advanceDays,
} from "../systems/clock.js";
import { Button, Badge } from "../ui.js";

/* Helper: group entries by YYYY-MM-DD */
function groupByDay(entries) {
  const out = {};
  (entries || []).forEach((e) => {
    const day = e.date?.slice(0, 10) || "unknown";
    (out[day] ||= []).push(e);
  });
  return out;
}

export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = ["tifa", "renna", "yuffie"],
  Nav,
}) {
  if (!diary) return h("div", { class: "card" }, "No diary data loaded.");

  // current pair state (lane + stage)
  const pair = getPairState(characterId, targetId); // { path, stage }

  // --- handlers: also write an auto entry to the timeline ---
  const onSetPath = (p) => {
    if (p === pair.path) return;
    setPairState(characterId, targetId, { path: p });
    appendDiaryEntry(diary, {
      text: `I feel myself leaning toward ${p}.`,
      path: p,
      stage: pair.stage,
      tags: ["#path-change", `#${p}`],
      mood: ["conflicted"],
    });
    rerender();
  };
  const onSetStage = (delta) => {
    const n = Math.max(0, Math.min(5, Number(pair.stage || 0) + delta));
    if (n === pair.stage) return;
    setPairState(characterId, targetId, { stage: n });
    appendDiaryEntry(diary, {
      text: `Something shifted inside me. (stage → ${n})`,
      path: pair.path,
      stage: n,
      tags: ["#stage-change", `#${pair.path}`],
      mood: ["reflective"],
    });
    rerender();
  };

  // data for the panel sections
  const desire = selectDesireEntries(diary, targetId, pair.path, pair.stage);
  const grouped = groupByDay(diary.entries);

  // in-game clock (tiny dev strip)
  const c = getClock();

  return h("div", null, [
    // Header
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, "Diary — Aerith"),
      h(Nav, null),
      h("div", { class: "kv small" }, [
        h(Badge, null, fmtClock(c)),
        h(Button, { ghost: true, onClick: () => { advanceMinutes(15); location.reload(); } }, "+15m"),
        h(Button, { ghost: true, onClick: () => { advanceHours(1);  location.reload(); } }, "+1h"),
        h(Button, { ghost: true, onClick: () => { advanceDays(1);   location.reload(); } }, "+1d"),
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
        h(Button, { onClick: () => onSetPath("love"),       ghost: pair.path !== "love" }, "Love"),
        h(Button, { onClick: () => onSetPath("corruption"), ghost: pair.path !== "corruption" }, "Corruption"),
        h(Button, { onClick: () => onSetPath("hybrid"),     ghost: pair.path !== "hybrid" }, "Hybrid"),
        h(Button, { onClick: () => onSetStage(-1), ghost: true }, "Stage −"),
        h(Button, { onClick: () => onSetStage(+1), ghost: true }, "Stage +"),
      ]),
      desire.length
        ? h("div", { class: "diary-hand" }, desire.map((t, i) => h("p", { key: i }, t)))
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
            ? h("div", { class: "diary-hand" }, lines.map((t, i) => h("p", { key: w + i }, t)))
            : h("div", { class: "small" }, "— no entries yet —"),
        ]);
      }),
    ]),

    // Timeline
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Timeline"),
      ...Object.entries(grouped).map(([day, entries]) =>
        h("div", { class: "diary-day" }, [
          h("div", { class: "diary-meta" }, [
            h(Badge, null, day),
            ...((entries[0].mood || []).map((m) => h(Badge, { ghost: true }, m))),
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

/* crude rerender helper: forces a sync refresh by toggling hash */
function rerender() {
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(() => { location.hash = h0; }, 0);
}
