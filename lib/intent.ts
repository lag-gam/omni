import type { Intent } from "./types";
import { getProvider } from "./providers/types";

const CLASSIFY_PROMPT = `You are an intent classifier for a personal memory assistant. Given the user's input, respond with exactly one word: SAVE, QUESTION, or DISCARD.

Rules:
- SAVE: the user is telling you something to remember — a fact, decision, note, reminder, idea, list, observation.
- QUESTION: the user is asking something and expects an answer — could be about their own notes or general knowledge.
- DISCARD: the input is meaningless noise, a greeting with no substance, or gibberish that should not be saved or answered.

When ambiguous, prefer SAVE over QUESTION. A stray saved note is less annoying than a bad answer.

Examples:
"Meeting with Priya moved to Thursday 3 PM" → SAVE
"The half-life of caffeine is about 5 hours" → SAVE
"Gotta remember to call the dentist tomorrow" → SAVE
"Go with 6061 aluminum, not acrylic" → SAVE
"Idea: CLI that auto-tags files using embeddings" → SAVE
"What's the melting point of gallium?" → QUESTION
"When is my dentist appointment?" → QUESTION
"What did I decide about the enclosure material?" → QUESTION
"What's the chemical formula for water?" → QUESTION
"How do window functions work in SQL?" → QUESTION
"I mean yeah" → DISCARD
"lmaooo ok" → DISCARD
"hm yeah whatever" → DISCARD
"just checking" → DISCARD
"aaaa test test" → DISCARD

Input: "{INPUT}"

Respond with one word:`;

export async function classifyIntent(text: string): Promise<Intent> {
  const provider = getProvider("anthropic");
  const prompt = CLASSIFY_PROMPT.replace("{INPUT}", text.replace(/"/g, '\\"'));
  const raw = await provider.complete(prompt);
  const token = raw.trim().toUpperCase();

  if (token === "QUESTION") return "QUESTION";
  if (token === "DISCARD") return "DISCARD";
  return "SAVE";
}
