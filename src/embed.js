// src/embed.js — local, keyless embeddings (same approach as RepoRadar).
// Used for DYNAMIC few-shot: embed the topic, retrieve the most semantically
// similar seed headlines to use as examples. This is "dynamic few-shot = RAG
// for examples" made concrete — free, on-device, no API key.

const MODEL = process.env.EMBED_MODEL || "Xenova/all-MiniLM-L6-v2";
let _extractor = null, _mode = null, _loading = null;

async function load() {
  if (_extractor || _mode === "hash") return;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowRemoteModels = true;
      _extractor = await pipeline("feature-extraction", MODEL);
      _mode = "model";
    } catch { _mode = "hash"; }
  })();
  return _loading;
}
export const embedMode = () => _mode || "uninitialized";

function hashEmbed(text, dim = 384) {
  const v = new Float32Array(dim);
  for (const t of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[Math.abs(h) % dim] += h & 1 ? 1 : -1;
  }
  return norm(v);
}
function norm(v) { let s = 0; for (const x of v) s += x * x; const n = Math.sqrt(s) || 1; return v.map((x) => x / n); }
export function dot(a, b) { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }

export async function embed(text) {
  await load();
  if (_mode === "model") {
    const out = await _extractor(String(text).slice(0, 1000), { pooling: "mean", normalize: true });
    return Float32Array.from(out.data);
  }
  return hashEmbed(text);
}

// Return the `k` items most similar to `query` from `items` ({title}|string).
export async function mostSimilar(query, items, k = 4) {
  const qv = await embed(query);
  const scored = [];
  for (const it of items) {
    const text = it.title ?? it;
    scored.push({ item: it, text, score: dot(qv, await embed(text)) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

if (import.meta.main) {
  const a = await embed("small business grant for veterans");
  const b = await embed("$25,000 Grants for EVERYONE in 5 Minutes!");
  const c = await embed("how to bake sourdough bread");
  console.log("mode:", embedMode());
  console.log("grant~grant:", dot(a, b).toFixed(3), " grant~bread:", dot(a, c).toFixed(3));
}
