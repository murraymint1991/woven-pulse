// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import {
  selectDesireEntries,
  selectWitnessedLine,
  appendDiaryEntry,
  logWitnessed,
  getPairState, setPairState
} from "../systems/diary.js";
import { fmtClock, getClock, advanceMinutes, advanceHours, advanceDays } from "../systems/clock.js";
import { Button, Badge } from "../ui.js";

// group entries by YYYY-MM-DD
function groupByDay(entries) {
  const out = {};
  (entries || []).forEach(e => {
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
  Nav
}) {
  if (!diary) return h("div", { class: "card" }, "No diary data loaded.");

  // current pair state (lane + stage)
  const pair = getPairState(characterId, targetId); // { path, stage }
  const setPath = (p) => { setPairState(characterId, targetId, { path: p }); rerender(); };
  const setStage = (delta) => {
    const n = Math.max(0, Math.min(5, Number(pair.stage || 0) + delta));
    setPairState(characterId, targetId, { stage: n }); rerender();
  };

  // panels
  const desire  = selectDesireEntries(diary, targetId, pair.path, pair.stage);
  const grouped = groupByDay(diary.entries);

  // in-game clock
  const c = getClock();

  return h("div", null, [
    // Header + clock controls
    h("div", { class: "hero" }, h("div", { class: "hero-inner" }, [
      h("div", { class: "stage-title" }, `Diary — ${characterId.charAt(0).toUpperCase()+characterId.slice(1)}`),
      h(Nav, null),
      h("div", { class: "kv small" }, [
        h(Badge, null, fmtClock(c)),
        h(Button, { ghost: true, onClick: () => { advanceMinutes(15); location.reload(); } }, "+15m"),
        h(Button, { ghost: true, onClick: () => { advanceHours(1);  location.reload(); } }, "+1h"),
        h(Button, { ghost: true, onClick: () => { advanceDays(1);   location.reload(); } }, "+1d")
      ])
    ])),

    // Desires
    h("div", { class: "card diary-card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class: "kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      h("div", { class: "kv" }, [
        h(Button, { onClick: () => setPath("love"),       ghost: pair.path !== "love" }, "Love"),
        h(Button, { onClick: () => setPath("corruption"), ghost: pair.path !== "corruption" }, "Corruption"),
        h(Button, { onClick: () => setPath("hybrid"),     ghost: pair.path !== "hybrid" }, "Hybrid"),
        h(Button, { onClick: () => setStage(-1), ghost: true }, "Stage −"),
        h(Button, { onClick: () => setStage(+1), ghost: true }, "Stage +")
      ]),
      desire.length
        ? h("div", { class: "diary-hand" }, [
            ...desire.map((t, i) => h("p", { key: i }, t)),
            h("div", { class: "kv" }, [
              h(Button, {
                ghost: true,
                onClick: () => {
                  // log a summary desire line for current lane+stage
                  appendDiaryEntry(diary, {
                    text: `[desire:${pair.path} s${pair.stage}] ${desire[desire.length - 1]}`,
                    path: pair.path,
                    stage: pair.stage,
                    tags: ["#desire", `#with:${targetId}`],
                    mood: ["pensive"]
                  });
                  rerender();
                }
              }, "Log desire to timeline")
            ])
          ])
        : h("div", { class: "small" }, "— no entries yet —")
    ]),

    // Witnessed (path-aware, loggable)
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Witnessed"),
      ...witnesses.map(w => {
        const line = selectWitnessedLine(diary, targetId, w, pair.path, pair.stage);
        return h("div", { class: "subcard", style: "margin-top:8px" }, [
          h("h4", null, `With ${w}`),
          line
            ? h("div", { class: "diary-hand" }, [
                h("p", null, line),
                h("div", { class: "kv" }, [
                  h(Button, {
                    ghost: true,
                    onClick: () => {
                      logWitnessed(diary, w, { text: line, path: pair.path, stage: pair.stage });
                      rerender();
                    }
                  }, "Log to timeline")
                ])
              ])
            : h("div", { class: "small" }, "— no entry for this path/stage —")
        ]);
      })
    ]),

    // Timeline (dynamic entries)
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Timeline"),
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

/* crude rerender helper: forces a sync refresh by toggling hash */
function rerender() {
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(() => { location.hash = h0; }, 0);
}
