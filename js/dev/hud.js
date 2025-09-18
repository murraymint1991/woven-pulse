// js/dev/hud.js

// Minimal, framework-free HUD. The game passes getters+actions in.
// API:
//   createDevHud({ getState, actions }) -> { update(), destroy() }
//
// getState() should return:
//   { hudVisible, pairTxt, day, lastEvent, tierName, score, mindCount, bodyCount, healthRunning }
//
// actions should include:
//   { toggle(), runHealthCheck(), copyHealthMarkdown(), addDay(), firstKiss(), handHold(), snideRemark() }

export function createDevHud({ getState, actions }) {
  let root = null;
  let keyHandler = null;

  function ensureRoot() {
    if (!root) {
      root = document.createElement("div");
      root.id = "dev-hud";
      root.style.cssText = [
        "position:fixed;top:12px;right:12px;z-index:9999",
        "min-width:240px;max-width:360px",
        "padding:10px;border-radius:10px",
        "background:rgba(17,24,39,0.92);color:#fff",
        "font:12px ui-monospace, SFMono-Regular, Menlo, monospace",
        "box-shadow:0 6px 20px rgba(0,0,0,.35)",
        "backdrop-filter:blur(4px)"
      ].join(";");
      document.body.appendChild(root);
    }
    return root;
  }

  function render() {
    const s = getState();
    const el = ensureRoot();

    // show/hide
    if (!s.hudVisible) { el.style.display = "none"; return; }
    el.style.display = "block";

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="font-weight:700;">DEV HUD</div>
        <div style="margin-left:auto;opacity:.75">F10 to toggle</div>
      </div>

      <div style="margin-top:8px;display:grid;gap:6px;">
        <div>Pair: <strong>${s.pairTxt}</strong></div>
        <div>Day: <strong>${s.day}</strong></div>
        <div>Tier: <strong>${s.tierName}</strong> · Score: <strong>${s.score}</strong>/100</div>
        <div>Last event: <strong>${s.lastEvent || "—"}</strong></div>
        <div>Aerith Mind keys: <strong>${s.mindCount}</strong> · Body keys: <strong>${s.bodyCount}</strong></div>
      </div>

      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button id="hud-run"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Run Health</button>
        <button id="hud-copy" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Copy Report</button>
        <button id="hud-day"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">+ Day</button>
        <button id="hud-kiss" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Test: First Kiss</button>
        <button id="hud-hold"  style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Hand Hold (+6)</button>
        <button id="hud-snipe" style="padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1f2937;color:#fff;cursor:pointer">Snide Remark (−6)</button>
      </div>
    `;

    // wire buttons
    const btnRun   = el.querySelector("#hud-run");
    const btnCopy  = el.querySelector("#hud-copy");
    const btnDay   = el.querySelector("#hud-day");
    const btnKiss  = el.querySelector("#hud-kiss");
    const btnHold  = el.querySelector("#hud-hold");
    const btnSnipe = el.querySelector("#hud-snipe");

    if (btnRun)  btnRun.onclick  = () => !s.healthRunning && actions.runHealthCheck();
    if (btnCopy) btnCopy.onclick = () => actions.copyHealthMarkdown();
    if (btnDay)  btnDay.onclick  = () => actions.addDay();
    if (btnKiss) btnKiss.onclick = () => actions.firstKiss();
    if (btnHold) btnHold.onclick = () => actions.handHold();
    if (btnSnipe) btnSnipe.onclick = () => actions.snideRemark();
  }

  // F10 toggle handler
  keyHandler = (e) => {
    if (e.key === "F10") {
      e.preventDefault();
      actions.toggle();
    }
  };
  window.addEventListener("keydown", keyHandler);

  return {
    update() { render(); },
    destroy() {
      window.removeEventListener("keydown", keyHandler);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
    }
  };
}
