// js/ui.js — tiny presentational helpers (DOM-producing)

import { h } from "https://esm.sh/preact@10.22.0";

export function Button(props){
  const { ghost, ...rest } = props || {};
  return h("button",{ class: "btn " + (ghost ? "ghost" : ""), ...rest }, props.children);
}
export function Badge(props){
  return h("span",{ class: "badge", ...props }, props.children);
}
export function Dot({ ok }){
  return h("span",{ class: "data-dot " + (ok===true ? "ok" : ok===false ? "err" : "") });
}
