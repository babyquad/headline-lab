// src/decompose.js — break a headline into TYPED components.
//
// This codifies Neal's manual step: "have the LLM classify each word of the
// headline — what type of word is used in each part." We do it deterministically
// (keyless, testable) with a grammar tuned to high-CTR YouTube titles; an LLM
// pass is optional for fuzzier copy (src/llm.js).
//
// Component types (the persuasion grammar):
//   AMOUNT     — dollar figures ($25,000, $3 Million) — the core promise
//   AUDIENCE   — who it's for (EVERYONE, FELONS, Startups, Small Business)
//   SPEED      — time-to-payoff (in 12 Minutes, in 2 Hours)
//   URGENCY    — act-now pressure (HURRY, Deadline, NOW, FAST, Closes)
//   CTA        — the ask (Do THIS to Qualify, How to Apply, CALL to Apply)
//   AUTHORITY  — credible source (SBA, IRS, EIDL, Government)
//   NOVELTY    — freshness (NEW, 2025, Update)
//   PROOF      — credibility spike (NO CAP, PROOF, Guaranteed, LEAKED, BREAKING)
//   NUMBER     — non-dollar quantity (20 Companies, 21 Days)
//   PLAIN      — everything else

export const TYPES = ["AMOUNT","AUDIENCE","SPEED","URGENCY","CTA","AUTHORITY","NOVELTY","PROOF","NUMBER","PLAIN"];

// Ordered patterns — first match wins per span. More specific before general.
const RULES = [
  ["AMOUNT",    /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|million|billion|grand)?\b/gi],
  ["SPEED",     /\bin\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b|\b\d+\s*(?:minutes?|hours?|days?)\b(?=\s*[-–—!])/gi],
  ["URGENCY",   /\b(?:hurry|now|today|tomorrow|deadline|closes?|expir\w+|last chance|don'?t wait|fast|asap|ends?)\b/gi],
  ["CTA",       /\b(?:do this to qualify|how to apply|apply now|call to apply|do this to|to qualify|get (?:your|the) money|claim (?:your|yours))\b/gi],
  ["AUTHORITY", /\b(?:SBA|IRS|EIDL|PPP|government|federal|senate|congress|treasury)\b/gi],
  ["PROOF",     /\b(?:no cap|proof|guaranteed|leaked?|reveals?|secret|exclusive|breaking|confirmed)\b/gi],
  ["AUDIENCE",  /\bfor (?:everyone|felons|startups?|small business(?:es)?|entrepreneurs?|veterans?|students?)\b|\b(?:everyone|startups?|small business(?:es)?|felons)\b/gi],
  ["NOVELTY",   /\b(?:new|update|20\d{2})\b/gi],
  ["NUMBER",    /\b\d[\d,]*\b/g],
];

// Return ordered, non-overlapping typed spans covering the title.
export function decompose(title) {
  const marks = new Array(title.length).fill(null);
  for (const [type, re] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(title)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (m[0].length === 0) { re.lastIndex++; continue; }
      let free = true;
      for (let i = s; i < e; i++) if (marks[i]) { free = false; break; }
      if (free) for (let i = s; i < e; i++) marks[i] = type;
    }
  }
  // Walk the string, emitting contiguous runs of the same type (PLAIN for gaps).
  const components = [];
  let i = 0;
  while (i < title.length) {
    const t = marks[i] || "PLAIN";
    let j = i;
    while (j < title.length && (marks[j] || "PLAIN") === t) j++;
    const span = title.slice(i, j).trim();
    if (span) components.push({ span, type: t });
    i = j;
  }
  const elements = [...new Set(components.map((c) => c.type).filter((t) => t !== "PLAIN"))];
  return { title, components, elements, length: title.length };
}

// Aggregate a set of headlines into a data-driven pattern profile.
export function patternProfile(headlines) {
  const freq = Object.fromEntries(TYPES.map((t) => [t, 0]));
  let totalLen = 0;
  const skeletons = {};
  for (const h of headlines) {
    const d = decompose(h.title ?? h);
    for (const t of d.elements) freq[t]++;
    totalLen += d.length;
    const skel = d.components.map((c) => c.type).filter((t) => t !== "PLAIN").join(" + ");
    skeletons[skel] = (skeletons[skel] || 0) + 1;
  }
  const n = headlines.length || 1;
  const elementRate = Object.fromEntries(
    TYPES.map((t) => [t, Number((freq[t] / n).toFixed(2))]).filter(([, v]) => v > 0)
  );
  const topSkeletons = Object.entries(skeletons).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { count: n, avgLength: Math.round(totalLen / n), elementRate, topSkeletons };
}

// ---- CLI: `bun run decompose "headline"`  (no arg → decompose the seed set) ----
if (import.meta.main) {
  const arg = process.argv[2];
  if (arg) {
    const d = decompose(arg);
    console.log(`\n"${d.title}"\n`);
    for (const c of d.components) console.log(`  ${c.type.padEnd(10)} ${c.span}`);
    console.log(`\n  elements: ${d.elements.join(", ")}  ·  ${d.length} chars\n`);
  } else {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const seeds = JSON.parse(readFileSync(join(import.meta.dir, "../seeds/rod-squad-outliers.json"), "utf-8"));
    const prof = patternProfile(seeds.headlines);
    console.log(`\nPattern profile — ${seeds.channelTitle} (${seeds.headlines.length} outliers)\n`);
    console.log("element frequency (share of headlines using it):");
    for (const [t, r] of Object.entries(prof.elementRate).sort((a, b) => b[1] - a[1]))
      console.log(`  ${t.padEnd(10)} ${"█".repeat(Math.round(r * 20))} ${(r * 100).toFixed(0)}%`);
    console.log(`\n  avg length: ${prof.avgLength} chars`);
    console.log("\n  top skeletons:");
    for (const [s, c] of prof.topSkeletons) console.log(`    ${c}×  ${s}`);
    console.log();
  }
}
