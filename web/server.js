// web/server.js — Headline Lab web demo (Bun + Hono + htmx).
// Two live tools over the same engine the CLI uses: decompose-&-score any
// headline, and the strategy bake-off for a topic. Free/on-device by default.
import { Hono } from "hono";
import { decompose } from "../src/decompose.js";
import { scoreTitle } from "../src/score.js";
import { runLab, SEED_TITLES, SEEDS_META } from "../src/lab.js";
import { llmEnabled } from "../src/llm.js";
import { page, legend, decomposeResult, bakeoffResult } from "./views.js";

const app = new Hono();
const PORT = Number(process.env.HL_PORT || 3009);

const SAMPLE = "Hurry! $25,000 Grants for EVERYONE - 20 Minutes - Guaranteed Money FAST!";

function home() {
  const examples = SEED_TITLES.slice(0, 4)
    .map((t) => `<div class="ex" hx-get="/decompose?title=${encodeURIComponent(t)}" hx-target="#dresult">${t}</div>`)
    .join("");
  const body = `
  <header>
    <h1>Headline Lab</h1>
    <p>Decompose a viral title into its persuasion grammar, then generate new ones across prompt strategies — scored to see which wins. Trained on real <b>${SEEDS_META.channelTitle}</b> outliers (${SEEDS_META.subscribers.toLocaleString()} subs).</p>
  </header>

  <div class="card">
    <h2>1 · Decompose &amp; score any headline</h2>
    <form hx-get="/decompose" hx-target="#dresult" hx-indicator="#di" class="row">
      <input type="text" name="title" value="${SAMPLE.replace(/"/g, "&quot;")}" placeholder="Paste a YouTube title…">
      <button>Decompose</button><span id="di" class="htmx-indicator muted">…</span>
    </form>
    <p class="muted" style="margin:8px 0 4px">${legend()}</p>
    <p class="muted">try: ${examples}</p>
    <div id="dresult" style="margin-top:6px"></div>
  </div>

  <div class="card">
    <h2>2 · Strategy bake-off — generate for a topic</h2>
    <form hx-get="/bakeoff" hx-target="#bresult" hx-indicator="#bi" class="row">
      <input type="text" name="topic" value="small business grant for veterans" placeholder="Video topic…">
      <button>Run bake-off</button><span id="bi" class="htmx-indicator muted">running…</span>
    </form>
    <p class="muted" style="margin-top:8px">Generates candidates via <b>zero-shot · few-shot · multi-shot · dynamic-few-shot</b> (retrieval), scores each, ranks the winner.</p>
    <div id="bresult" style="margin-top:6px"></div>
  </div>

  <footer>
    Free &amp; on-device by default (local embeddings for dynamic-few-shot retrieval; template generation).
    ${llmEnabled() ? "Live LLM generation is ON." : "Set an LLM key for live generation — the strategies then genuinely diverge."}
    · Source: <a href="https://github.com/babyquad/headline-lab" target="_blank" rel="noopener">github.com/babyquad/headline-lab</a>
  </footer>`;
  return page({ title: "Headline Lab — decompose, generate, score YouTube titles", body });
}

app.get("/healthz", (c) => c.text("ok"));
app.get("/", (c) => c.html(home()));

app.get("/decompose", (c) => {
  const title = (c.req.query("title") || "").trim();
  if (!title) return c.html(`<p class="muted">Enter a headline above.</p>`);
  return c.html(decomposeResult(decompose(title), scoreTitle(title)));
});

app.get("/bakeoff", async (c) => {
  const topic = (c.req.query("topic") || "").trim() || "new SBA small-business grant";
  const amount = c.req.query("amount") || null;
  const res = await runLab(topic, { amount });
  return c.html(bakeoffResult(res));
});

// JSON API (same engine).
app.get("/api/decompose", (c) => {
  const title = (c.req.query("title") || "").trim();
  if (!title) return c.json({ error: "missing title" }, 400);
  return c.json({ ...decompose(title), score: scoreTitle(title).score });
});
app.get("/api/bakeoff", async (c) => {
  const topic = (c.req.query("topic") || "").trim();
  if (!topic) return c.json({ error: "missing topic" }, 400);
  return c.json(await runLab(topic, { amount: c.req.query("amount") || null }));
});

console.log(`[headline-lab] listening on :${PORT}`);
export default { port: PORT, fetch: app.fetch };
