// src/score.js — a transparent CTR-proxy scorer (0-100), keyless + deterministic.
//
// It rewards the persuasion elements a niche's outliers share (learned grammar),
// plus title-length and specificity heuristics. It is a *proxy*, not ground truth
// — the lab validates it against vidIQ's real title scores (see README). Having a
// cheap, inspectable scorer is the point: it's the eval signal the strategy
// comparison ranks on, and it runs with no API key.
//
// `style` picks the weight table: "grant" and "ai" share the original table;
// "faith" rewards what breakout Bible-story titles share and applies the title
// rules from Derral Eves's Channel Jumpstart System (short, plain, no colon/pipe).

import { decompose } from "./decompose.js";

// Weights — tuned to what high-breakout Rod Squad + AI-vlog titles share.
const SHARED = {
  // grant / money niche
  AMOUNT: 26,     // the core promise; almost every grant outlier has one
  AUDIENCE: 14,   // "for EVERYONE / FELONS / Startups"
  SPEED: 14,      // "in X minutes/hours"
  CTA: 12,        // "Do THIS to Qualify"
  URGENCY: 12,    // "HURRY / Deadline"
  PROOF: 9,       // "NO CAP / PROOF / GUARANTEED / LEAKED"
  AUTHORITY: 8,   // "SBA / IRS / EIDL"
  NOVELTY: 6,     // "NEW / 2025 / 2026"
  // AI-content niche
  ENTITY: 20,     // named model = the hook ("GPT-4", "Gemini", "Claude")
  SHOCK: 18,      // curiosity/hype ("SHOCKED", "STUNS", "you don't understand")
  HOWTO: 11,      // "Here's How / Tutorial / Install / Build Anything"
  FREE: 11,       // "FREE / UNLIMITED"
  NUMBER: 5,      // listicle count ("26 Use Cases", "900%")
};

// Faith / Bible-story niche — tuned to seeds/niche-faith-crosschannel.json.
const FAITH = {
  BIBLICAL: 24,   // a named figure, being, book or place is the hook
  MYSTERY: 20,    // "hidden / untold / forbidden / like you've never heard it"
  QUESTION: 16,   // the viewer wants the answer
  STAKES: 14,     // "for you / YOUR soul / will haunt you" (the 2.4M-view outlier's hook)
  SHOCK: 12,      // "you won't believe"
  SCALE: 10,      // "complete / entire / every / 2 hours of"
  HOWTO: 6,       // "explained"
  NUMBER: 5,      // "one-third of the angels / 7 archangels / 450 prophets"
  NOVELTY: 2,
};

export const STYLES = { grant: SHARED, ai: SHARED, faith: FAITH };
const sign = (n) => `${n >= 0 ? "+" : ""}${n}`;

export function scoreTitle(title, { style = "grant" } = {}) {
  const weights = STYLES[style] || SHARED;
  const d = decompose(title);
  const present = new Set(d.elements);
  let raw = 0;
  const hits = [];
  for (const [t, w] of Object.entries(weights)) {
    if (present.has(t)) { raw += w; hits.push(t); }
  }
  const L = title.length;
  const capsWords = (title.match(/\b[A-Z]{3,}\b/g) || []).length;
  const notes = [`elements: ${hits.join(", ") || "none"}`];
  let adj = 0;

  if (style === "faith") {
    // Eves: keep the title under ~55 characters so it reads in full on every surface.
    const lengthBonus = L <= 55 ? (L >= 28 ? 10 : 4) : L <= 65 ? 2 : L <= 80 ? -4 : -10;
    // Eves: the "Topic: Subtitle | Tag" construction reads as machine-written; plain phrasing wins.
    const punct = /[:|]/.test(title) ? -8 : 0;
    // One all-caps word adds emphasis; more than two reads as shouting.
    const capsScore = capsWords === 1 ? 2 : capsWords > 2 ? -4 : 0;
    adj = lengthBonus + punct + capsScore;
    notes.push(`length ${L} (${sign(lengthBonus)})`, punct ? "colon/pipe (-8)" : "no colon/pipe", `caps ${capsWords} (${sign(capsScore)})`);
  } else {
    // Length sweet spot: ~35-65 chars reads fully on mobile + desktop.
    const lengthBonus = L >= 35 && L <= 65 ? 8 : L < 35 ? 4 : L <= 80 ? 2 : -4;
    // Specificity: an exact dollar figure beats a vague one.
    const exactAmount = /\$\d[\d,]*(\.\d+)?/.test(title) ? 4 : 0;
    // Caps energy (one all-caps power word), but penalize shouting the whole title.
    const capsScore = capsWords >= 1 && capsWords <= 3 ? 3 : capsWords > 5 ? -3 : 0;
    adj = lengthBonus + exactAmount + capsScore;
    notes.push(`length ${L} (${sign(lengthBonus)})`, exactAmount ? "exact $ (+4)" : "no exact $", `caps ${capsWords} (${sign(capsScore)})`);
  }

  const score = Math.max(0, Math.min(100, raw + adj));
  return { title, score, elements: hits, length: L, style, notes };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--style");
  const style = si >= 0 ? argv[si + 1] : "grant";
  const t = argv.find((a) => !a.startsWith("--") && a !== style) || "$25,000 Grants for EVERYONE in 5 Minutes! Do THIS to Qualify!";
  const r = scoreTitle(t, { style });
  console.log(`\n"${r.title}"\n  score ${r.score}/100 (${r.style})\n  ${r.notes.join(" · ")}\n`);
}
