import type { HudCard, StreamEvent } from "./types";
import { db } from "./db";
import { decideCaptureInput } from "./capture-input";
import {
  appendTurn,
  clearPendingClarification,
  conversationMessages,
  getPendingClarification,
  remember,
} from "./conversation";
import { classifyIntent } from "./intent";
import { embed, embedAndStore, topMatches } from "./embeddings";
import { runAgentStream } from "./mcp/agent";
import { warmMcp } from "./mcp/pool";
import { warmN8n } from "./n8n";

export type CaptureStreamDependencies = {
  runAgentStream: typeof runAgentStream;
  warmMcp: typeof warmMcp;
  warmN8n: typeof warmN8n;
};

export async function* handleCaptureStream(
  text: string,
  traceId = "capture",
  dependencies: Partial<CaptureStreamDependencies> = {},
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  if (signal?.aborted) return;
  const tag = `capture ${traceId}`;
  const pendingClarification = getPendingClarification();
  const inputDecision = decideCaptureInput(text, !!pendingClarification);

  if (inputDecision.type === "cancel") {
    if (signal?.aborted) return;
    const response = "Cancelled.";
    clearPendingClarification();
    appendTurn(text, response);
    console.log(`[omni] ${tag} clarification cancelled`);
    yield { type: "log", text: `${tag} clarification cancelled` };
    yield { type: "token", text: response };
    yield {
      type: "done",
      result: {
        type: "answer",
        text: response,
        source: "general",
      },
    };
    return;
  }

  if (inputDecision.type === "filtered") {
    console.log(`[omni] ${tag} filtered ${inputDecision.reason}`);
    yield {
      type: "done",
      result: { type: "filtered", reason: inputDecision.reason },
    };
    return;
  }

  yield { type: "status", text: "Thinking…" };
  void (dependencies.warmMcp ?? warmMcp)();
  void (dependencies.warmN8n ?? warmN8n)();
  const history = conversationMessages();

  if (pendingClarification) {
    console.log(
      `[omni] ${tag} resuming clarification attempt=${pendingClarification.attemptCount}`
    );
    yield {
      type: "log",
      text: `${tag} resuming clarification ${pendingClarification.attemptCount}`,
    };
  } else {
    console.log(`[omni] ${tag} classifying`);
    yield { type: "log", text: `${tag} classifying` };
    const intent = await classifyIntent(text, history.length > 0);
    if (signal?.aborted) return;
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
        .prepare(
          "INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))"
        )
        .run(trimmed);
      await embedAndStore(Number(info.lastInsertRowid), trimmed);
      if (signal?.aborted) return;
      appendTurn(trimmed, "Saved.");
      console.log(`[omni] ${tag} saved`);
      yield { type: "done", result: { type: "saved" } };
      return;
    }
  }

  const found: HudCard[] = [];
  for await (const event of (dependencies.runAgentStream ?? runAgentStream)(
    text,
    history,
    traceId,
    pendingClarification ?? undefined,
    signal
  )) {
    if (signal?.aborted) return;
    if (event.type === "card") found.push(event.card);
    if (event.type === "done" && event.result.type === "answer") {
      clearPendingClarification();
      remember(text, event.result.text);
      const cards = await relatedCards(text, event.result.text, [
        ...found,
        ...(event.result.cards ?? []),
      ]);
      if (signal?.aborted) return;
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
