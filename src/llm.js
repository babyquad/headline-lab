// src/llm.js — optional Anthropic-powered headline generation (the "advanced"
// mode). Keyless? The lab falls back to template assembly so it still runs.
// This is where the prompt STRATEGY actually bites: the only thing that changes
// between strategies is which examples we put in front of the model.
import Anthropic from "@anthropic-ai/sdk";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.HEADLINE_MODEL || "claude-opus-4-8";
const client = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;
export const llmEnabled = () => !!client;

export async function generateWithLLM({ topic, exampleTitles = [], grammarNote = "", n = 5 }) {
  if (!client) return null;
  const examples = exampleTitles.length
    ? `Here are real high-performing titles from this channel — model their structure and voice:\n${exampleTitles.map((t) => `- ${t}`).join("\n")}\n\n`
    : "";
  const sys =
    "You are a YouTube title strategist for a channel about grants, free money, and small-business funding " +
    "(audience: U.S. entrepreneurs and everyday people seeking money). Write punchy, specific, high-CTR titles " +
    "in the channel's voice. Output ONLY a JSON array of title strings — no prose, no numbering.";
  const user = `${examples}Write ${n} title options for a video about: ${topic}\n${grammarNote}`;
  const msg = await client.messages.create({ model: MODEL, max_tokens: 700, system: sys, messages: [{ role: "user", content: user }] });
  const text = (msg.content.find((b) => b.type === "text") || {}).text || "";
  try {
    return JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)).filter((x) => typeof x === "string").slice(0, n);
  } catch {
    return text.split("\n").map((s) => s.replace(/^[-\d.\s"]+/, "").replace(/"$/, "").trim()).filter(Boolean).slice(0, n);
  }
}
