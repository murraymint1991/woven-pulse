// js/systems/traits.js
import { fetchJson } from "../utils.js";

/**
 * loadAssignments(url) -> { ok, map } where map is { id -> { traits:[], sens:[] } }
 */
export async function loadAssignments(url){
  const r = await fetchJson(url);
  if (!r.ok) return { ok:false, map:{} };
  const map = (r.data && r.data.characters) ? r.data.characters : {};
  return { ok:true, map };
}
