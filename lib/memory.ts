import type { HudCard, StreamEvent } from "./types";
import { db } from "./db";
import {
  appendTurn,
  conversationMessages,
  remember,
} from "./conversation";
import { filterInput } from "./filter";
import { classifyIntent } from "./intent";
import { embed, embedAndStore, topMatches } from "./embeddings";
import { runAgentStream } from "./mcp/agent";
import { warmMcp } from "./mcp/pool";
import { warmN8n } from "./n8n";

export async function* handleCaptureStream(
  text: string,
  traceId = "capture"
): AsyncGenerator<StreamEvent> {
  const tag = `capture ${traceId}`;
  const check = filterInput(text);
  if (!check.pass) {
    console.log(`[omni] ${tag} filtered ${check.reason}`);
    yield { type: "done", result: { type: "filtered", reason: check.reason } };
    return;
  }

  yield { type: "status", text: "Thinking…" };
  console.log(`[omni] ${tag} classifying`);
  yield { type: "log", text: `${tag} classifying` };
  void warmMcp();
  void warmN8n();
  const history = conversationMessages();
  const intent = await classifyIntent(text, history.length > 0);
  console.log(`[omni] ${tag} intent ${intent}`);
  yield { type: "log", text: `${tag} intent ${intent}` };

  if (intent === "DISCARD") {
    yield {
      type: "done",
      result: { type: "filtered", reason: "Nothing to save." },
    };
    return;
  }

  if (intent === "SAVE") {
    console.log(`[omni] ${tag} saving`);
    yield { type: "log", text: `${tag} saving` };
    const trimmed = text.trim();
    const info = db
      .prepare("INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))")
      .run(trimmed);
    await embedAndStore(Number(info.lastInsertRowid), trimmed);
    appendTurn(trimmed, "Saved.");
    console.log(`[omni] ${tag} saved`);
    yield { type: "done", result: { type: "saved" } };
    return;
  }

  const found: HudCard[] = [];
  for await (const event of runAgentStream(text, history, traceId)) {
    if (event.type === "card") found.push(event.card);
    if (event.type === "done" && event.result.type === "answer") {
      remember(text, event.result.text);
      const cards = await relatedCards(text, event.result.text, [
        ...found,
        ...(event.result.cards ?? []),
      ]);
      yield { ...event, result: { ...event.result, cards } };
      continue;
    }
    yield event;
  }
}

async function relatedCards(
  question: string,
  answer: string,
  existing: HudCard[] = []
): Promise<HudCard[]> {
  const vec = await embed(`${question} ${answer}`);
  const hits = topMatches(vec, 6).filter((h) => h.score >= 0.22);
  const notes: HudCard[] = hits.map((h) => ({
    id: `note-${h.id}`,
    kind: "note",
    title: "Note",
    body: h.content,
  }));
  const seen = new Set(existing.map((c) => c.body));
  const extra = notes.filter((c) => !seen.has(c.body));
  return [
    { id: "answer", kind: "answer", title: "Jarvis", body: answer },
    ...existing.filter((c) => c.kind !== "answer"),
    ...extra,
  ];
}
