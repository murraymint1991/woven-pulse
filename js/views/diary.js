// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import { useState } from "https://esm.sh/preact@10.22.0/hooks";
import {
  selectDesireEntries,
  selectReflectionEntries,
  getPairState,
  setPairStateWithAutoNote
} from "../systems/diary.js";
import { Button, Badge } from "../ui.js";

// Group entries by YYYY-MM-DD
function groupByDay(entries){
  const out = {};
  (entries || []).forEach(e => {
    const day = e.date?.slice(0,10) || "unknown";
    (out[day] ||= []).push(e);
  });
  return out;
}

export default function DiaryView({
  diary,
  characterId = "aerith",
  targetId = "vagrant",
  witnesses = ["tifa","renna","yuffie"],
  Nav
}) {
  if (!diary) return h("div", { class:"card" }, "No diary data loaded.");

  // lane + stage state for this pair
  const pair = getPairState(characterId, targetId);

  const setPath  = (p) => { setPairStateWithAutoNote(diary, characterId, targetId, { path:p }); rerender(); };
  const setStage = (delta) => {
    const n = Math.max(0, Math.min(5, Number(pair.stage||0) + delta));
    setPairStateWithAutoNote(diary, characterId, targetId, { stage:n }); rerender();
  };

  // static route text
  const desire = selectDesireEntries(diary, targetId, pair.path, pair.stage);

  // timeline filter
  const [flt, setFlt] = useState("all"); // "all" | "love" | "corruption" | "hybrid"
  const filtered = (diary.entries || []).filter(e => flt==="all" ? true : e.path === flt);
  const grouped  = groupByDay(filtered);

  return h("div", null, [
    // Header
    h("div", { class:"hero" }, h("div",{class:"hero-inner"},[
      h("div",{class:"stage-title"},"Diary — Aerith"),
      h(Nav,null)
    ])),

    // Desires
    h("div", { class:"card diary-card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class:"kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      h("div", { class:"kv" }, [
        h(Button, { onClick: ()=>setPath("love"),       ghost: pair.path!=="love" },       "Love"),
        h(Button, { onClick: ()=>setPath("corruption"), ghost: pair.path!=="corruption" }, "Corruption"),
        h(Button, { onClick: ()=>setPath("hybrid"),     ghost: pair.path!=="hybrid" },     "Hybrid"),
        h(Button, { onClick: ()=>setStage(-1), ghost:true }, "Stage −"),
        h(Button, { onClick: ()=>setStage(+1), ghost:true }, "Stage +")
      ]),
      desire.length
        ? h("div", { class:"diary-hand" }, desire.map((t,i)=> h("p",{key:i}, t)))
        : h("div", { class:"small" }, "— no entries yet —")
    ]),

    // Reflections
    h("div", { class:"card diary-card" }, [
      h("h3", null, "Reflections (witnessed)"),
      ...witnesses.map(w => {
        const lines = selectReflectionEntries(diary, targetId, w, pair.stage);
        return h("div", { class:"subcard", style:"margin-top:8px" }, [
          h("h4", null, `With ${w}`),
          lines.length
            ? h("div", { class:"diary-hand" }, lines.map((t,i)=> h("p",{key:w+i}, t)))
            : h("div", { class:"small" }, "— no entries yet —")
        ]);
      })
    ]),

    // Timeline (filter + grouped entries)
    h("div", { class:"card diary-card" }, [
      h("h3", null, "Timeline"),
      h("div", { class:"kv" }, [
        h(Button, { ghost: flt!=="all",        onClick: ()=>setFlt("all") },        "All"),
        h(Button, { ghost: flt!=="love",       onClick: ()=>setFlt("love") },       "Love"),
        h(Button, { ghost: flt!=="corruption", onClick: ()=>setFlt("corruption") }, "Corruption"),
        h(Button, { ghost: flt!=="hybrid",     onClick: ()=>setFlt("hybrid") },     "Hybrid")
      ]),
      ...Object.entries(grouped).map(([day, entries]) =>
        h("div", { class:"diary-day" }, [
          h("div", { class:"diary-meta" }, [
            h(Badge, null, day),
            ...((entries[0].mood || []).map(m => h(Badge, { ghost:true }, m)))
          ]),
          ...entries.map((e,i) =>
            h("div", { class:"diary-hand", key: day+i, "data-path": e.path || "" }, [
              h("p", null, e.text),
              ...((e.asides || []).map((a,j)=> h("p", { class:"diary-thought", key:j }, a)))
            ])
          )
        ])
      )
    ])
  ]);
}

/* crude rerender helper: forces a sync refresh by toggling hash */
function rerender(){
  const h0 = location.hash;
  location.hash = "#_";
  setTimeout(()=>{ location.hash = h0; }, 0);
}
