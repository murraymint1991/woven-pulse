// js/views/diary.js
import { h } from "https://esm.sh/preact@10.22.0";
import { selectDesireEntries, selectReflectionEntries, getPairState, setPairState } from "../systems/diary.js";
import { Button, Badge } from "../ui.js";

/** Minimal read-only view with tiny dev controls for path & stage. */
export default function DiaryView({ diary, characterId = "aerith", targetId = "vagrant", witnesses = ["tifa","renna","yuffie"], Nav }) {
  if (!diary) return h("div", { class:"card" }, "No diary data loaded.");

  const pair = getPairState(characterId, targetId); // { path, stage }
  const setPath = (p) => { setPairState(characterId, targetId, { path: p }); rerender(); };
  const setStage = (delta) => {
    const n = Math.max(0, Math.min(5, Number(pair.stage || 0) + delta));
    setPairState(characterId, targetId, { stage: n }); rerender();
  };

  const desire = selectDesireEntries(diary, targetId, pair.path, pair.stage);

  return h("div", null, [
    h("div", { class:"hero" }, h("div", { class:"hero-inner" }, [
      h("div", { class:"stage-title" }, "Diary — Aerith"),
      h(Nav, null)
    ])),
    h("div", { class:"card" }, [
      h("h3", null, `Desires · target: ${targetId}`),
      h("div", { class:"kv" }, [
        h(Badge, null, `Path: ${pair.path}`),
        h(Badge, null, `Stage: ${pair.stage}`)
      ]),
      h("div", { class:"kv" }, [
        h(Button, { onClick: ()=>setPath("love"), ghost: pair.path!=="love" }, "Love"),
        h(Button, { onClick: ()=>setPath("corruption"), ghost: pair.path!=="corruption" }, "Corruption"),
        h(Button, { onClick: ()=>setPath("hybrid"), ghost: pair.path!=="hybrid" }, "Hybrid"),
        h(Button, { onClick: ()=>setStage(-1), ghost:true }, "Stage −"),
        h(Button, { onClick: ()=>setStage(+1), ghost:true }, "Stage +")
      ]),
      h("ul", null, desire.map((t,i)=> h("li", { key:i }, t)))
    ]),
    h("div", { class:"card" }, [
      h("h3", null, "Reflections (witnessed)"),
      ...witnesses.map(w => {
        const lines = selectReflectionEntries(diary, targetId, w, pair.stage);
        return h("div", { class:"subcard", style:"margin-top:8px" }, [
          h("h4", null, `With ${w}`),
          lines.length ? h("ul", null, lines.map((t,i)=> h("li", { key:w+i }, t))) : h("div", { class:"small" }, "— no entries yet —")
        ]);
      })
    ])
  ]);
}

/* crude rerender helper: forces a sync refresh by toggling hash */
function rerender(){
  const h = location.hash;
  location.hash = "#_"; // temp
  setTimeout(()=>{ location.hash = h; }, 0);
}
