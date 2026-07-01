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

// Corpora the lab can learn from: your channel, the cross-channel niche, or both.
const CORPORA = { ai: "ai-vlog-crosschannel.json", mine: "rod-squad-outliers.json", niche: "niche-grants-crosschannel.json" };
export const CORPUS_KEYS = [...Object.keys(CORPORA), "both"];
const readSeeds = (file) => JSON.parse(readFileSync(join(import.meta.dir, "../seeds/", file), "utf-8"));

export function loadCorpus(key = "mine") {
  if (key === "both") {
    const a = readSeeds(CORPORA.mine), b = readSeeds(CORPORA.niche);
    return { label: "my channel + niche", headlines: [...a.headlines, ...b.headlines] };
  }
  const s = readSeeds(CORPORA[key] || CORPORA.mine);
  return { label: s.channelTitle || key, headlines: s.headlines };
}

const _mine = readSeeds(CORPORA.mine);
export const SEED_TITLES = _mine.headlines.map((h) => h.title);
export const SEEDS_META = _mine;

const N = 5;
const GRAMMAR =
  "Favor: a specific dollar AMOUNT, an AUDIENCE (e.g. for EVERYONE / Startups), a SPEED (in X minutes/hours), URGENCY, and a clear CTA. Keep it ~35-65 characters.";

// Keyless fallback: assemble titles from the slot grammar of an example pool.
// `style` picks the template family: "ai" (entity/shock/free) or "grant" ($/audience/speed).
function templateGenerate(pool, topic, amount, n, style = "grant") {
  const types = ["AMOUNT", "AUDIENCE", "SPEED", "CTA", "URGENCY", "PROOF", "AUTHORITY", "ENTITY", "SHOCK", "FREE", "HOWTO"];
  const slots = Object.fromEntries(types.map((t) => [t, []]));
  for (const t of pool) for (const c of decompose(t).components) if (slots[c.type]) slots[c.type].push(c.span);
  const def = {
    AMOUNT: ["$25,000", "$10,000", "$150,000"], AUDIENCE: ["for EVERYONE", "for Startups"],
    SPEED: ["in 10 Minutes", "in 2 Hours"], CTA: ["Do THIS to Qualify!", "How to Apply!"],
    URGENCY: ["HURRY!", "Deadline in Days!"], PROOF: ["NO CAP! PROOF!"], AUTHORITY: ["SBA"],
    ENTITY: ["GPT-4", "Gemini", "Claude"], SHOCK: ["SHOCKED", "STUNS", "INSANE"], FREE: ["FREE", "UNLIMITED"], HOWTO: ["Here's How"],
  };
  const uniq = (k) => { const a = [...new Set(slots[k])]; return a.length ? a : (def[k] || [""]); };
  const pick = (k, i) => uniq(k)[i % uniq(k).length];
  const core = topic.replace(/\b\w/g, (m) => m.toUpperCase());
  // pick an entity from the pool that the topic doesn't already mention
  const ent = (i) => { const e = uniq("ENTITY").filter((x) => !new RegExp(x.replace(/[-.]/g, "\\$&"), "i").test(topic)); return (e.length ? e : uniq("ENTITY"))[i % (e.length || 1)]; };

  if (style === "ai") {
    const templates = [
      (i) => `${core} — You Won't Believe This`,
      (i) => `${core}: Here's How`,
      (i) => `New ${core} Just SHOCKED Everyone (Better Than ${ent(i)})`,
      (i) => `${core} — FREE & Unlimited`,
      (i) => `Why ${core} Changes Everything`,
    ];
    return templates.slice(0, n).map((f, i) => f(i).replace(/\s+/g, " ").trim());
  }

  // grant style
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

async function buildStrategies(topic, titles) {
  const dyn = (await mostSimilar(topic, titles, 4)).map((r) => r.text);
  return [
    { name: "zero-shot", examples: [], note: "no examples — grammar rules only" },
    { name: "few-shot", examples: titles.slice(0, 3), note: "3 fixed examples" },
    { name: "multi-shot", examples: titles, note: `${titles.length} examples` },
    { name: "dynamic-few-shot", examples: dyn, note: "examples retrieved by semantic similarity to the topic" },
  ];
}

// Shared engine → structured result (no printing). Used by CLI + web.
// `corpus` = "mine" | "niche" | "both" — which outliers to learn the grammar from.
export async function runLab(topic, { amount = null, n = N, corpus = "mine" } = {}) {
  const c = loadCorpus(corpus);
  const titles = c.headlines.map((h) => h.title);
  const profile = patternProfile(c.headlines);
  const strat = await buildStrategies(topic, titles); // loads the embedding model
  const rows = [];
  for (const s of strat) {
    let genTitles = null;
    if (llmEnabled()) {
      genTitles = await generateWithLLM({ topic: amount ? `${topic} (${amount})` : topic, exampleTitles: s.examples, grammarNote: GRAMMAR, n });
    }
    const style = corpus === "ai" ? "ai" : "grant";
    if (!genTitles || !genTitles.length) genTitles = templateGenerate(s.examples.length ? s.examples : titles, topic, amount, n, style);
    const scored = genTitles.map(scoreTitle).sort((a, b) => b.score - a.score);
    const avg = scored.reduce((x, r) => x + r.score, 0) / scored.length;
    rows.push({ strategy: s.name, note: s.note, examples: s.examples, avg: Math.round(avg), best: scored[0], all: scored });
  }
  rows.sort((a, b) => b.avg - a.avg);
  return {
    topic, amount, corpus, corpusLabel: c.label, corpusCount: c.headlines.length,
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
  const ci = argv.indexOf("--corpus");
  const corpus = ci >= 0 ? argv[ci + 1] : "mine";
  const r = await runLab(topic, { amount, corpus });

  console.log(`\n╔═ Headline Lab ═ topic: "${r.topic}"${amount ? ` · amount: ${amount}` : ""}`);
  console.log(`║  corpus: ${r.corpusLabel} (${r.corpusCount})  ·  generator: ${r.generator}  ·  retrieval: ${r.retrievalMode}\n`);
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
