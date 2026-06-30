// src/lab.js — Headline Lab: the strategy bake-off.
//
// Codifies Neal's workflow end-to-end:
//   1. Learn the winning grammar from real outlier headlines (decompose + profile)
//   2. Generate candidates for a new topic across FOUR prompt strategies
//        zero-shot · few-shot · multi-shot · dynamic-few-shot
//   3. Score every candidate with the CTR-proxy and report WHICH STRATEGY WINS
//
// This is prompt engineering + eval in one runnable artifact, grounded in real
// data. Uses Anthropic when ANTHROPIC_API_KEY is set (real generation); otherwise
// falls back to template assembly so the pipeline still runs and is testable.
//
//   bun run lab "new SBA grant for veterans"
//   bun run lab "remote jobs no experience" --amount "$3,200 a week"

import { readFileSync } from "fs";
import { join } from "path";
import { decompose, patternProfile } from "./decompose.js";
import { scoreTitle } from "./score.js";
import { mostSimilar, embedMode } from "./embed.js";
import { llmEnabled, generateWithLLM } from "./llm.js";

const seeds = JSON.parse(readFileSync(join(import.meta.dir, "../seeds/rod-squad-outliers.json"), "utf-8"));
const SEED_TITLES = seeds.headlines.map((h) => h.title);

const argv = process.argv.slice(2);
const topic = argv.find((a) => !a.startsWith("--")) || "new SBA small-business grant";
const amountFlag = (() => { const i = argv.indexOf("--amount"); return i >= 0 ? argv[i + 1] : null; })();

const N = 5;
const GRAMMAR = "Favor: a specific dollar AMOUNT, an AUDIENCE (e.g. for EVERYONE / Startups), a SPEED (in X minutes/hours), URGENCY, and a clear CTA. Keep it ~35-65 characters.";

// ---- keyless fallback: assemble titles from the slot grammar of an example pool ----
function templateGenerate(pool, n) {
  const slots = { AMOUNT: [], AUDIENCE: [], SPEED: [], CTA: [], URGENCY: [], PROOF: [], AUTHORITY: [] };
  for (const t of pool) for (const c of decompose(t).components) if (slots[c.type]) slots[c.type].push(c.span);
  const def = {
    AMOUNT: ["$25,000", "$10,000", "$150,000"], AUDIENCE: ["for EVERYONE", "for Startups"],
    SPEED: ["in 10 Minutes", "in 2 Hours"], CTA: ["Do THIS to Qualify!", "How to Apply!"],
    URGENCY: ["HURRY!", "Deadline in Days!"], PROOF: ["NO CAP! PROOF!"], AUTHORITY: ["SBA"],
  };
  const uniq = (k) => { const a = [...new Set(slots[k])]; return a.length ? a : def[k]; };
  const pick = (k, i) => { const a = uniq(k); return a[i % a.length]; };
  const core = topic.replace(/\b\w/g, (m) => m.toUpperCase());
  const A = amountFlag ? () => amountFlag : (i) => pick("AMOUNT", i);
  const templates = [
    (i) => `${pick("URGENCY", i)} ${A(i)} ${core} ${pick("AUDIENCE", i)} ${pick("SPEED", i)}!`,
    (i) => `${A(i)} ${core} ${pick("AUDIENCE", i)} ${pick("SPEED", i)}! ${pick("CTA", i)}`,
    (i) => `NEW ${pick("AUTHORITY", i)} ${A(i)} ${core}! ${pick("CTA", i)}`,
    (i) => `${A(i)} ${core} ${pick("AUDIENCE", i)}! ${pick("PROOF", i)}`,
    (i) => `${pick("AUTHORITY", i)} ${A(i)} ${core} ${pick("SPEED", i)}! ${pick("CTA", i)}`,
  ];
  return templates.slice(0, n).map((f, i) => f(i).replace(/\s+/g, " ").trim());
}

async function strategies() {
  const dyn = (await mostSimilar(topic, SEED_TITLES, 4)).map((r) => r.text);
  return [
    { name: "zero-shot", examples: [], note: "no examples — relies on the grammar rules only" },
    { name: "few-shot", examples: SEED_TITLES.slice(0, 3), note: "3 fixed examples" },
    { name: "multi-shot", examples: SEED_TITLES, note: `${SEED_TITLES.length} examples` },
    { name: "dynamic-few-shot", examples: dyn, note: "4 examples retrieved by semantic similarity to the topic" },
  ];
}

async function run() {
  const strat = await strategies(); // loads the embedding model (dynamic-few-shot retrieval)
  console.log(`\n╔═ Headline Lab ═ topic: "${topic}"${amountFlag ? ` · amount: ${amountFlag}` : ""}`);
  console.log(`║  generator: ${llmEnabled() ? "Anthropic (" + (process.env.HEADLINE_MODEL || "claude-opus-4-8") + ")" : "template fallback (set ANTHROPIC_API_KEY for real generation)"}  ·  retrieval: ${embedMode()}\n`);

  const prof = patternProfile(seeds.headlines);
  console.log(`Learned grammar from ${prof.count} real outliers — top elements: ` +
    Object.entries(prof.elementRate).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, r]) => `${t} ${(r * 100).toFixed(0)}%`).join(", "));
  console.log(`Most common skeleton: ${prof.topSkeletons[0]?.[0]}\n`);

  const rows = [];
  for (const s of strat) {
    let titles = null;
    if (llmEnabled()) {
      titles = await generateWithLLM({ topic: amountFlag ? `${topic} (${amountFlag})` : topic, exampleTitles: s.examples, grammarNote: GRAMMAR, n: N });
    }
    if (!titles || !titles.length) titles = templateGenerate(s.examples.length ? s.examples : SEED_TITLES, N);
    const scored = titles.map(scoreTitle).sort((a, b) => b.score - a.score);
    const avg = scored.reduce((x, r) => x + r.score, 0) / scored.length;
    rows.push({ strategy: s.name, note: s.note, avg, best: scored[0], all: scored });
  }

  rows.sort((a, b) => b.avg - a.avg);
  console.log("STRATEGY BAKE-OFF  (CTR-proxy, higher = more clickable)\n");
  console.log("strategy           avg   best score   best title");
  console.log("─────────────────  ───   ──────────   ──────────");
  for (const r of rows)
    console.log(`${r.strategy.padEnd(17)}  ${r.avg.toFixed(0).padStart(3)}   ${String(r.best.score).padStart(3)}          ${r.best.title}`);

  const win = rows[0];
  console.log(`\n🏆 winning strategy: ${win.strategy} (avg ${win.avg.toFixed(0)}) — ${win.note}`);
  console.log(`   top title: "${win.best.title}"  [${win.best.score}/100 · ${win.best.elements.join(", ")}]\n`);

  console.log("All candidates from the winner:");
  for (const r of win.all) console.log(`  ${String(r.score).padStart(3)}  ${r.title}`);
  console.log();
}

run();
