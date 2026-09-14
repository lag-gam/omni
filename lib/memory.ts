import type { StreamEvent } from "./types";
import { db } from "./db";
import { filterInput } from "./filter";
import { classifyIntent } from "./intent";
import { embedAndStore } from "./embeddings";
import { runAgentStream } from "./mcp/agent";

export async function* handleCaptureStream(
  text: string
): AsyncGenerator<StreamEvent> {
  const check = filterInput(text);
  if (!check.pass) {
    yield { type: "done", result: { type: "filtered", reason: check.reason } };
    return;
  }

  yield { type: "status", text: "Thinking…" };
  const intent = await classifyIntent(text);

  if (intent === "DISCARD") {
    yield {
      type: "done",
      result: { type: "filtered", reason: "Nothing to save." },
    };
    return;
  }

  if (intent === "SAVE") {
    const trimmed = text.trim();
    const info = db
      .prepare("INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))")
      .run(trimmed);
    await embedAndStore(Number(info.lastInsertRowid), trimmed);
    yield { type: "done", result: { type: "saved" } };
    return;
  }

  yield* runAgentStream(text);
}
