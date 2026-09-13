import type { CaptureResult } from "./types";
import { db } from "./db";
import { filterInput } from "./filter";
import { classifyIntent } from "./intent";
import { embed, topMatches, embedAndStore } from "./embeddings";
import { getProvider } from "./providers/types";

const SIMILARITY_THRESHOLD = 0.3;

const RECALL_PROMPT = `You are a personal memory assistant. The user asked a question and relevant notes from their personal memory were found. Answer the question using ONLY the information in the notes below. Be concise and direct. If the notes don't contain enough information to fully answer, say what you can and note what's missing.

Notes:
{NOTES}

Question: "{QUESTION}"

Answer:`;

/**
 * The single entry point for all omni-bar input. Runs the full pipeline:
 * pre-filter → intent classification → save or answer.
 */
export async function handleCapture(text: string): Promise<CaptureResult> {
  const check = filterInput(text);
  if (!check.pass) {
    return { type: "filtered", reason: check.reason };
  }

  const intent = await classifyIntent(text);

  if (intent === "DISCARD") {
    return { type: "filtered", reason: "Nothing to save." };
  }

  if (intent === "SAVE") {
    const trimmed = text.trim();
    const info = db
      .prepare("INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))")
      .run(trimmed);
    const noteId = Number(info.lastInsertRowid);
    await embedAndStore(noteId, trimmed);
    return { type: "saved" };
  }

  // QUESTION — search memory, synthesize an answer if relevant notes exist
  const queryVec = await embed(text);
  const matches = topMatches(queryVec, 5);
  const relevant = matches.filter((m) => m.score >= SIMILARITY_THRESHOLD);

  if (relevant.length > 0) {
    const notesBlock = relevant
      .map((n, i) => `${i + 1}. ${n.content}`)
      .join("\n");
    const prompt = RECALL_PROMPT
      .replace("{NOTES}", notesBlock)
      .replace("{QUESTION}", text.replace(/"/g, '\\"'));

    const provider = getProvider("anthropic");
    const answer = await provider.complete(prompt);
    return { type: "answer", text: answer.trim(), source: "memory" };
  }

  // No relevant notes — fall through to general knowledge
  const gkProvider = getProvider(
    process.env.GK_PROVIDER as "anthropic" | "huggingface" | undefined ??
      undefined
  );
  const gkAnswer = await gkProvider.complete(text);
  return { type: "answer", text: gkAnswer.trim(), source: "general" };
}
