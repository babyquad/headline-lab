# Headline Lab

Codifies a YouTube-title workflow into a runnable, testable artifact: **learn the winning grammar from real outlier titles → generate candidates across prompt strategies → score which strategy wins.** Built to demonstrate advanced prompt engineering + LLM evaluation on **real channel data** (not toy examples).

**▶ Live demo: https://headlines.ragflo.com** — decompose & score any headline, or run the strategy bake-off in the browser.

**Corpora (switchable):** the lab learns the winning grammar from real outliers pulled via vidIQ — choose **~20 AI-vlog channels** (Matt Wolfe, Wes Roth, TheAIGRID, David Ondrej, AI Search…), a single channel, or a niche (grants). It even adapts the component grammar per niche — grant titles decompose into `AMOUNT / AUDIENCE / SPEED`, AI titles into `ENTITY / SHOCK / HOWTO / FREE`.

> Origin: my manual process — pull a channel's outlier videos (the "1of10" move), feed the winning headlines to an LLM, have it **classify each component of the title by type**, then generate new titles my audience would click. This repo turns that into code.

## The pipeline

```
real outliers ──► 1. DECOMPOSE      classify each component by type
(seeds/)           (AMOUNT, AUDIENCE, SPEED, URGENCY, CTA, AUTHORITY, NOVELTY, PROOF)
                   │
                   ▼
                2. PROFILE          data-driven grammar across the corpus
                   │                (element frequency + most common skeletons)
                   ▼
                3. GENERATE         four prompt strategies, same topic:
                   │                  zero-shot · few-shot · multi-shot · dynamic-few-shot
                   ▼
                4. SCORE + RANK     CTR-proxy scores every candidate →
                                    reports WHICH STRATEGY WINS
```

## What it proves (the prompt-engineering rows)

- **Decomposition / structured reasoning** — `decompose.js` breaks a title into typed components (the "classify each word" step), then `patternProfile` aggregates the winning grammar across the corpus.
- **Few-shot vs. zero-shot vs. multi-shot** — `lab.js` runs all four side by side and ranks them on a measurable score. The only thing that changes between strategies is **which examples go in front of the model** — the textbook definition.
- **Dynamic few-shot = RAG-for-examples** — the `dynamic-few-shot` strategy *embeds the topic and retrieves the most semantically similar real titles* to use as examples (`embed.js`, local/on-device). This is the "retrieve the most relevant examples per query" technique, made concrete and free.
- **Evaluation tooling** — `score.js` is a transparent, inspectable CTR-proxy; the bake-off is an eval harness for prompt strategies.

## Real-data validation (vidIQ's actual CTR model)

The proxy scorer was cross-checked against **vidIQ's real title-CTR model**, scored on the live channel (Rod Squad, 85.2K):

| Title | vidIQ score |
|---|---|
| **Lab-generated** — "SBA $3 Million Small Business Grant For Veterans in 2 Hours! Do THIS to Qualify" | **94** |
| vidIQ's own AI suggestions (for the $25K video) | 79–86 |
| Real channel outlier — "$45,000, $1,200 Grants for EVERYONE in 12 Minutes!" | 75 |
| Bland control — "My thoughts on small business grants and funding options" | 78 |

**Finding:** the lab's grammar-driven candidate scored **94 — above the channel's real outlier and above vidIQ's own generator.** The proxy and vidIQ agree the grammar-rich candidate is strongest, but **diverge on the bland control** (vidIQ 78, proxy low) — because the proxy is tuned to *this channel's* money/urgency grammar. That gap is the honest takeaway: a cheap on-device proxy is great for fast ranking; a production system should use a real CTR model as the eval signal of record.

## Run it

```bash
bun install
bun run decompose                       # pattern profile across the real outliers
bun run decompose "your headline here"  # classify one title's components
bun run lab "small business grant for veterans"
bun run lab "remote jobs no experience" --amount "$3,200 a week"
```

- **Free / on-device by default** — embeddings (dynamic-few-shot retrieval) run locally via transformers.js; generation falls back to template assembly. No API key required.
- **Optional real generation** — set `ANTHROPIC_API_KEY` and the four strategies generate with Claude, so their quality genuinely diverges (the strategy bake-off becomes a real prompt-technique experiment).

## Files

| File | Role |
|---|---|
| `seeds/rod-squad-outliers.json` | real outlier headlines (ground truth) |
| `src/decompose.js` | typed-component decomposition + corpus pattern profile |
| `src/embed.js` | local keyless embeddings → semantic retrieval for dynamic few-shot |
| `src/score.js` | transparent CTR-proxy scorer (eval signal) |
| `src/llm.js` | optional Anthropic generation (strategy-aware) |
| `src/lab.js` | the strategy bake-off: generate → score → rank → winner |
