// src/lab.js — Headline Lab core + CLI.
//
// Codifies the workflow: learn the winning grammar from real outliers →
// generate candidates for a topic across FOUR prompt strategies (zero / few /
// multi / dynamic-few-shot) → score every candidate → report which wins.
// `runLab()` is the shared engine used by both the CLI and the web demo.

import { readFileSync } from "fs";
import { join } from "path";
import { decompose, patternProfile } from "./decompose.js";
import { scoreTitle } from "./score.js";
import { mostSimilar, embedMode } from "./embed.js";
import { llmEnabled, generateWithLLM } from "./llm.js";

const seeds = JSON.parse(readFileSync(join(import.meta.dir, "../seeds/rod-squad-outliers.json"), "utf-8"));
export const SEED_TITLES = seeds.headlines.map((h) => h.title);
export const SEEDS_META = seeds;

const N = 5;
const GRAMMAR =
  "Favor: a specific dollar AMOUNT, an AUDIENCE (e.g. for EVERYONE / Startups), a SPEED (in X minutes/hours), URGENCY, and a clear CTA. Keep it ~35-65 characters.";

// Keyless fallback: assemble titles from the slot grammar of an example pool.
function templateGenerate(pool, topic, amount, n) {
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
  // Don't tack on an AUDIENCE the topic already implies (avoids "...Small Business Small Business").
  const aud = (i) => (/\b(everyone|business|startup|veteran|felon|student)\b/i.test(topic) ? "" : ` ${pick("AUDIENCE", i)}`);
  const A = amount ? () => amount : (i) => pick("AMOUNT", i);
  const templates = [
    (i) => `${pick("URGENCY", i)} ${A(i)} ${core}${aud(i)} ${pick("SPEED", i)}!`,
    (i) => `${A(i)} ${core}${aud(i)} ${pick("SPEED", i)}! ${pick("CTA", i)}`,
    (i) => `NEW ${pick("AUTHORITY", i)} ${A(i)} ${core}! ${pick("CTA", i)}`,
    (i) => `${A(i)} ${core}${aud(i)}! ${pick("PROOF", i)}`,
    (i) => `${pick("AUTHORITY", i)} ${A(i)} ${core} ${pick("SPEED", i)}! ${pick("CTA", i)}`,
  ];
  return templates.slice(0, n).map((f, i) => f(i).replace(/\s+/g, " ").trim());
}

async function buildStrategies(topic) {
  const dyn = (await mostSimilar(topic, SEED_TITLES, 4)).map((r) => r.text);
  return [
    { name: "zero-shot", examples: [], note: "no examples — grammar rules only" },
    { name: "few-shot", examples: SEED_TITLES.slice(0, 3), note: "3 fixed examples" },
    { name: "multi-shot", examples: SEED_TITLES, note: `${SEED_TITLES.length} examples` },
    { name: "dynamic-few-shot", examples: dyn, note: "examples retrieved by semantic similarity to the topic" },
  ];
}

// Shared engine → structured result (no printing). Used by CLI + web.
export async function runLab(topic, { amount = null, n = N } = {}) {
  const profile = patternProfile(seeds.headlines);
  const strat = await buildStrategies(topic); // loads the embedding model
  const rows = [];
  for (const s of strat) {
    let titles = null;
    if (llmEnabled()) {
      titles = await generateWithLLM({ topic: amount ? `${topic} (${amount})` : topic, exampleTitles: s.examples, grammarNote: GRAMMAR, n });
    }
    if (!titles || !titles.length) titles = templateGenerate(s.examples.length ? s.examples : SEED_TITLES, topic, amount, n);
    const scored = titles.map(scoreTitle).sort((a, b) => b.score - a.score);
    const avg = scored.reduce((x, r) => x + r.score, 0) / scored.length;
    rows.push({ strategy: s.name, note: s.note, examples: s.examples, avg: Math.round(avg), best: scored[0], all: scored });
  }
  rows.sort((a, b) => b.avg - a.avg);
  return {
    topic, amount,
    generator: llmEnabled() ? `Anthropic (${process.env.HEADLINE_MODEL || "claude-opus-4-8"})` : "template (on-device)",
    retrievalMode: embedMode(),
    profile, rows, winner: rows[0],
  };
}

// ---- CLI ----
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const topic = argv.find((a) => !a.startsWith("--")) || "new SBA small-business grant";
  const i = argv.indexOf("--amount");
  const amount = i >= 0 ? argv[i + 1] : null;
  const r = await runLab(topic, { amount });

  console.log(`\n╔═ Headline Lab ═ topic: "${r.topic}"${amount ? ` · amount: ${amount}` : ""}`);
  console.log(`║  generator: ${r.generator}  ·  retrieval: ${r.retrievalMode}\n`);
  console.log(`Learned grammar from ${r.profile.count} real outliers — top elements: ` +
    Object.entries(r.profile.elementRate).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, v]) => `${t} ${(v * 100).toFixed(0)}%`).join(", "));
  console.log(`Most common skeleton: ${r.profile.topSkeletons[0]?.[0]}\n`);
  console.log("STRATEGY BAKE-OFF  (CTR-proxy, higher = more clickable)\n");
  console.log("strategy           avg   best   best title");
  console.log("─────────────────  ───   ────   ──────────");
  for (const row of r.rows)
    console.log(`${row.strategy.padEnd(17)}  ${String(row.avg).padStart(3)}   ${String(row.best.score).padStart(3)}    ${row.best.title}`);
  console.log(`\n🏆 ${r.winner.strategy} (avg ${r.winner.avg}) — ${r.winner.note}`);
  console.log(`   "${r.winner.best.title}"  [${r.winner.best.score}/100 · ${r.winner.best.elements.join(", ")}]\n`);
}
