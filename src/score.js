// src/score.js — a transparent CTR-proxy scorer (0-100), keyless + deterministic.
//
// It rewards the persuasion elements Neal's OWN outliers share (learned grammar),
// plus title-length and specificity heuristics. It is a *proxy*, not ground truth
// — the lab validates it against vidIQ's real title scores (see README). Having a
// cheap, inspectable scorer is the point: it's the eval signal the strategy
// comparison ranks on, and it runs with no API key.

import { decompose } from "./decompose.js";

// Weights — tuned to what high-breakout Rod Squad titles share.
const WEIGHTS = {
  AMOUNT: 26,     // the core promise; almost every outlier has one
  AUDIENCE: 14,   // "for EVERYONE / FELONS / Startups"
  SPEED: 14,      // "in X minutes/hours"
  CTA: 12,        // "Do THIS to Qualify"
  URGENCY: 12,    // "HURRY / Deadline"
  PROOF: 9,       // "NO CAP / PROOF / GUARANTEED"
  AUTHORITY: 8,   // "SBA / IRS / EIDL"
  NOVELTY: 5,     // "NEW / 2025"
};

export function scoreTitle(title) {
  const d = decompose(title);
  const present = new Set(d.elements);
  let raw = 0;
  const hits = [];
  for (const [t, w] of Object.entries(WEIGHTS)) {
    if (present.has(t)) { raw += w; hits.push(t); }
  }
  // Length sweet spot: ~35-65 chars reads fully on mobile + desktop.
  const L = title.length;
  const lengthBonus = L >= 35 && L <= 65 ? 8 : L < 35 ? 4 : L <= 80 ? 2 : -4;
  // Specificity: an exact dollar figure beats a vague one.
  const exactAmount = /\$\d[\d,]*(\.\d+)?/.test(title) ? 4 : 0;
  // Caps energy (one all-caps power word), but penalize shouting the whole title.
  const capsWords = (title.match(/\b[A-Z]{3,}\b/g) || []).length;
  const capsScore = capsWords >= 1 && capsWords <= 3 ? 3 : capsWords > 5 ? -3 : 0;

  const score = Math.max(0, Math.min(100, raw + lengthBonus + exactAmount + capsScore));
  return {
    title,
    score,
    elements: hits,
    length: L,
    notes: [
      `elements: ${hits.join(", ") || "none"}`,
      `length ${L} (${lengthBonus >= 0 ? "+" : ""}${lengthBonus})`,
      exactAmount ? "exact $ (+4)" : "no exact $",
      `caps ${capsWords} (${capsScore >= 0 ? "+" : ""}${capsScore})`,
    ],
  };
}

if (import.meta.main) {
  const t = process.argv[2] || "$25,000 Grants for EVERYONE in 5 Minutes! Do THIS to Qualify!";
  const r = scoreTitle(t);
  console.log(`\n"${r.title}"\n  score ${r.score}/100\n  ${r.notes.join(" · ")}\n`);
}
