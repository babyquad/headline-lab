// web/views.js — server-rendered HTML for the Headline Lab demo (self-contained,
// inline CSS + htmx; no build step). Two interactive tools:
//   1. Decompose & score any headline (instant, on-device, free)
//   2. Strategy bake-off for a topic (zero / few / multi / dynamic-few-shot)

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TYPE_COLOR = {
  AMOUNT: "#22c55e", AUDIENCE: "#38bdf8", SPEED: "#f59e0b", URGENCY: "#ef4444",
  CTA: "#a78bfa", AUTHORITY: "#e879f9", NOVELTY: "#2dd4bf", PROOF: "#fb7185", NUMBER: "#94a3b8", PLAIN: "#3f3f46",
};

export function page({ title, body }) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Headline Lab — decompose viral YouTube titles into typed components, generate across prompt strategies, and score which wins. Built on real channel data.">
<script src="https://unpkg.com/htmx.org@1.9.12" defer></script>
<style>
  :root{--bg:#0a0a0f;--card:#15151f;--line:#26263a;--ink:#e8e8f0;--dim:#9a9ab0;--grad:linear-gradient(90deg,#a855f7,#ec4899,#f59e0b)}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  a{color:#c4b5fd} .wrap{max-width:820px;margin:0 auto;padding:22px 18px 60px}
  header h1{font-size:26px;margin:0 0 4px;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
  header p{color:var(--dim);margin:0 0 18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
  .card h2{font-size:15px;margin:0 0 10px;letter-spacing:.3px}
  input[type=text]{width:100%;background:#0f0f18;border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:10px 12px;font-size:15px}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  button{background:linear-gradient(90deg,#7c3aed,#db2777);color:#fff;border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;font-size:14px}
  button:hover{filter:brightness(1.1)} .muted{color:var(--dim);font-size:13px}
  .chip{display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;margin:2px 3px 2px 0;color:#0a0a0f}
  .comp{display:inline-block;padding:3px 7px;border-radius:6px;margin:2px;font-size:13px;font-weight:600;color:#0a0a0f}
  table{width:100%;border-collapse:collapse;font-size:14px} th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
  th{color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
  .win{background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.4);border-radius:10px;padding:12px;margin-top:6px}
  .score{font-weight:800} .bar{height:6px;border-radius:4px;background:var(--grad)}
  .htmx-indicator{opacity:0;transition:opacity .2s} .htmx-request .htmx-indicator{opacity:1}
  .ex{cursor:pointer;text-decoration:underline;color:var(--dim);font-size:13px}
  footer{color:var(--dim);font-size:12.5px;margin-top:26px;border-top:1px solid var(--line);padding-top:14px}
  code{background:#0f0f18;padding:1px 5px;border-radius:5px;font-size:13px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

export function legend() {
  return Object.entries(TYPE_COLOR).filter(([t]) => t !== "PLAIN").map(([t, c]) =>
    `<span class="chip" style="background:${c}">${t}</span>`).join("");
}

export function decomposeResult(d, scored) {
  const comps = d.components.map((c) =>
    `<span class="comp" style="background:${TYPE_COLOR[c.type] || "#3f3f46"};${c.type === "PLAIN" ? "color:#cfcfe0" : ""}">${esc(c.span)}</span>`
  ).join(" ");
  return `<div class="win">
    <div style="margin-bottom:8px">${comps}</div>
    <div class="row" style="justify-content:space-between">
      <span class="muted">elements: ${d.elements.join(", ") || "none"} · ${d.length} chars</span>
      <span class="score" style="font-size:20px">${scored.score}<span class="muted" style="font-weight:400">/100 CTR-proxy</span></span>
    </div>
    <div class="bar" style="width:${scored.score}%;margin-top:6px"></div>
  </div>`;
}

export function bakeoffResult(res) {
  const prof = res.profile;
  const topEl = Object.entries(prof.elementRate).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([t, v]) => `${t} ${(v * 100).toFixed(0)}%`).join(" · ");
  const rows = res.rows.map((r, i) =>
    `<tr${i === 0 ? ' style="background:rgba(168,85,247,.10)"' : ""}>
      <td>${i === 0 ? "🏆 " : ""}${r.strategy}</td>
      <td class="score">${r.avg}</td>
      <td class="score">${r.best.score}</td>
      <td>${esc(r.best.title)}</td>
    </tr>`).join("");
  const winnerAll = res.winner.all.map((c) =>
    `<tr><td class="score" style="width:44px">${c.score}</td><td>${esc(c.title)}</td></tr>`).join("");
  return `<div>
    <p class="muted">Learned from ${prof.count} real outliers — top elements: <b>${topEl}</b>. Most common skeleton: <code>${esc(prof.topSkeletons[0]?.[0] || "")}</code></p>
    <table><thead><tr><th>strategy</th><th>avg</th><th>best</th><th>best title</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="win"><b>Winner: ${res.winner.strategy}</b> <span class="muted">— ${esc(res.winner.note)}</span>
      <table style="margin-top:8px"><tbody>${winnerAll}</tbody></table></div>
    <p class="muted" style="margin-top:8px">generator: ${esc(res.generator)} · retrieval: ${res.retrievalMode} · CTR-proxy score (higher = more clickable)</p>
  </div>`;
}
