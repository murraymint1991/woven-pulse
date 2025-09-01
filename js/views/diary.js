// ============================================================================
// SECTION A — IMPORTS
// ============================================================================
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

// ============================================================================
// SECTION B — HELPERS (grouping + constants)
// ============================================================================
const MAX_STAGE = 10; // our diary uses 0..10 stages

// Group entries by YYYY-MM-DD (for timeline rendering)
function groupByDay(entries) {
  const out = {};
  (entries || []).forEach(e => {
    const day = e.date?.slice(0, 10) || "unknown";
    (out[day] ||= []).push(e);
  });
  return out;
}

// ============================================================================
// SECTION C — MAIN VIEW COMPONENT
// ============================================================================
export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = ["tifa", "renna", "yuffie"],
  Nav
}) {
  if (!diary) return h("div", { class: "card" }, "No diary data loaded.");

  // ---------- C1. Pair state (lane/path + stage) ----------
  const pair = getPairState(characterId, targetId); // { path, stage }
  const setPath = (p) => { setPairState(characterId, targetId, { path: p }); rerender(); };
  const setStage = (delta) => {
    const n = Math.max(0, Math.min(MAX_STAGE, Number(pair.stage || 0) + delta));
    setPairState(characterId, targetId, { stage: n }); rerender();
  };

  // ---------- C2. Panels ----------
  const desire  = selectDesireEntries(diary, targetId, pair.path, pair.stage);
  const grouped = groupByDay(diary.entries);

  // ---------- C3. Clock ----------
  const c = getClock();

  // ---------- C4. DEV mode (default ON unless ?dev=0) ----------
  const params = new URLSearchParams(location.search);
  const DEV = params.get("dev") !== "0";

  // ---------- C5. DEV exposure (handy console hooks) ----------
  if (DEV && typeof window !== "undefined") {
    window.__DIARY_CURRENT__ = diary;
    window.__PAIR_CURRENT__  = pair;
    window.__AppendDiaryEntry__ = (payload) => { appendDiaryEntry(diary, payload); rerender(); };
    window.__LogWitnessed__ = (w) => {
      const line = selectWitnessedLine(diary, targetId, w, pair.path, pair.stage);
      if (line) { logWitnessed(diary, w, { text: line, path: pair.path, stage: pair.stage }); rerender(); }
    };
    window.__SetPath__  = (p) => { setPairState(characterId, targetId, { path: p }); rerender(); };
    window.__SetStage__ = (s) => { setPairState(characterId, targetId, { stage: s }); rerender(); };
  }

  // ---------- C6. Local UI state ----------
  let freeText = ""; // tiny dev freeform entry text (local, not persisted)

  // ========================================================================
  // SECTION D — DEV EVENT EMITTERS
  // (These call window.emitGameEvent from main.js and force-refresh UI.)
  // ========================================================================
  const emitOnly = (type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.emitGameEvent === "function") {
      window.emitGameEvent(type, payload);
    }
  };
  const emitAndRefresh = (type, payload = {}) => { emitOnly(type, payload); rerender(); };

  // ========================================================================
  // SECTION E — RENDER
  // ========================================================================
  return h("div", null, [
    // E1. Header + clock controls
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

    // E2. DEV PANEL (now ON by default; hide with ?dev=0)
    DEV ? h("div", { class: "card", style: "border:dashed 1px #888; background:#0d0f15" }, [
      h("h3", null, "DEV · Diary"),
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

      // E2a. Trigger test buttons — emit AND refresh
      h("div", { class: "kv small" }, "Fire game events:"),
      h("div", { class: "kv", style: "flex-wrap:wrap; gap:6px" }, [
        // Map to main.js switch names:
        h(Button, { ghost:true, onClick: () => emitAndRefresh("interaction.meet") }, "Meet"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("interaction.firstKiss") }, "First Kiss"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("location.enter", { place: "Tent" }) }, "Enter Tent"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("location.enter", { place: "Inn" }) }, "Enter Inn"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("item.bloomstone.sapphire") }, "Use Bloomstone (Sapphire)"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("risky.alleyStealth") }, "Risky · Alley Stealth"),
        h(Button, { ghost:true, onClick: () => emitAndRefresh("time.morningTick") }, "Time · Morning Tick"),
        // Witnessed: log exact line into timeline based on path/stage
        ...witnesses.map(w => h(Button, {
          ghost:true,
          onClick: () => {
            const line = selectWitnessedLine(diary, targetId, w, pair.path, pair.stage);
            if (line) { logWitnessed(diary, w, { text: line, path: pair.path, stage: pair.stage }); rerender(); }
          }
        }, `Witness: ${w}`))
      ]),

      // E2b. Existing quick loggers
      h("div", { class: "kv", style:"margin-top:8px" }, [
        h(Button, {
          ghost: true,
          onClick: () => {
            if (desire.length) {
              appendDiaryEntry(diary, {
                text: `[desire:${pair.path} s${pair.stage}] ${desire[desire.length - 1]}`,
                path: pair.path,
                stage: pair.stage,
                tags: ["#desire", `#with:${targetId}`],
                mood: ["pensive"]
              });
              rerender();
            }
          }
        }, "Log current desire line")
      ]),
      h("div", { class: "kv small" }, "Log witnessed lines (again):"),
      h("div", { class: "kv", style: "flex-wrap:wrap; gap:6px" }, [
        ...witnesses.map(w => h(Button, {
          ghost: true,
          onClick: () => {
            const line = selectWitnessedLine(diary, targetId, w, pair.path, pair.stage);
            if (line) { logWitnessed(diary, w, { text: line, path: pair.path, stage: pair.stage }); rerender(); }
          }
        }, `With ${w}`))
      ]),
      h("div", { class: "kv", style: "align-items:flex-start; gap:8px" }, [
        h("textarea", {
          placeholder: "Freeform line…",
          style: "min-height:60px; width:100%;",
          onInput: (e) => { freeText = e.currentTarget.value; }
        }),
        h(Button, {
          ghost: true,
          onClick: () => {
            if (!freeText || !freeText.trim()) return;
            appendDiaryEntry(diary, {
              text: freeText.trim(),
              tags: ["#free"],
              mood: []
            });
            freeText = "";
            rerender();
          }
        }, "Add freeform entry")
      ])
    ]) : null,

    // E3. Desires (read-only)
    h("div", { class: "card diary-card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class: "kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      (desire && desire.length)
        ? h("div", { class: "diary-hand" }, desire.map((t, i) => h("p", { key: i }, t)))
        : h("div", { class: "small" }, "— no entries yet —")
    ]),

    // E4. Witnessed (read-only preview)
    h("div", { class: "card diary-card" }, [
      h("h3", null, "Witnessed"),
      ...witnesses.map(w => {
        const line = selectWitnessedLine(diary, targetId, w, pair.path, pair.stage);
        return h("div", { class: "subcard", style: "margin-top:8px" }, [
          h("h4", null, `With ${w}`),
          line
            ? h("div", { class: "diary-hand" }, [ h("p", null, line) ])
            : h("div", { class: "small" }, "— no entry for this path/stage —")
        ]);
      })
    ]),

    // E5. Timeline (dynamic, grouped by day)
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

// ============================================================================
// SECTION F — RERENDER HELPER (forces UI refresh by toggling hash)
// ============================================================================
function rerender() {
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(() => { location.hash = h0; }, 0);
                                     }
