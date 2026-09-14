import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { db } from "./db";

const KEEP_TURNS = 8;
const SCRATCH_MAX = 12000;

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_session (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
`);

export type Turn = { role: "user" | "assistant"; content: string };

type StoredSession = {
  messages: Turn[];
  scratch?: string;
};

export function getConversation(): Turn[] {
  return loadSession().messages;
}

export function conversationMessages(): MessageParam[] {
  return loadSession()
    .messages.filter((t) => t.content.trim())
    .map((t) => ({ role: t.role, content: t.content }));
}

export function conversationScratch(): string {
  return loadSession().scratch?.trim() ?? "";
}

export function saveSession(messages: MessageParam[]) {
  writeSession(compactSession(messages));
}

export function remember(user: string, assistant: string) {
  const insert = db.prepare(
    "INSERT INTO conversation (role, content) VALUES (?, ?)"
  );
  const trim = db.prepare(
    `DELETE FROM conversation WHERE id NOT IN (
       SELECT id FROM conversation ORDER BY id DESC LIMIT ?
     )`
  );
  const tx = db.transaction(() => {
    insert.run("user", user.trim());
    insert.run("assistant", assistant.trim());
    trim.run(KEEP_TURNS * 2);
  });
  tx();
}

export function appendTurn(user: string, assistant: string) {
  remember(user, assistant);
  const stored = loadSession();
  stored.messages.push(
    { role: "user", content: user.trim() },
    { role: "assistant", content: assistant.trim() }
  );
  writeSession({
    messages: stored.messages.slice(-KEEP_TURNS),
    scratch: stored.scratch,
  });
}

export function clearConversation() {
  db.exec("DELETE FROM conversation");
  db.exec("DELETE FROM conversation_session");
}

function writeSession(stored: StoredSession) {
  db.prepare(
    `INSERT INTO conversation_session (id, json) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json`
  ).run(JSON.stringify(stored));
}

function loadSession(): StoredSession {
  const row = db
    .prepare("SELECT json FROM conversation_session WHERE id = 1")
    .get() as { json: string } | undefined;
  if (!row?.json) return { messages: [] };
  try {
    const parsed = JSON.parse(row.json) as unknown;
    const compact = normalizeStored(parsed);
    if (Array.isArray(parsed)) writeSession(compact);
    return compact;
  } catch {
    return { messages: [] };
  }
}

function normalizeStored(parsed: unknown): StoredSession {
  if (parsed && typeof parsed === "object" && "messages" in parsed) {
    const raw = parsed as StoredSession;
    const messages = (raw.messages ?? []).filter(
      (t): t is Turn =>
        !!t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string"
    );
    return {
      messages: messages.slice(-KEEP_TURNS),
      scratch:
        typeof raw.scratch === "string"
          ? raw.scratch.slice(0, SCRATCH_MAX)
          : undefined,
    };
  }
  if (Array.isArray(parsed)) {
    return compactSession(parsed as MessageParam[]);
  }
  return { messages: [] };
}

function compactSession(messages: MessageParam[]): StoredSession {
  const turns: Turn[] = [];
  let scratch = "";

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = textOf(message.content);
    const tools = toolResultsOf(message.content);
    if (tools) scratch = tools;
    if (text) turns.push({ role: message.role, content: text });
  }

  return {
    messages: turns.slice(-KEEP_TURNS),
    scratch: scratch.slice(0, SCRATCH_MAX) || undefined,
  };
}

function textOf(content: MessageParam["content"]): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        !!block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function toolResultsOf(content: MessageParam["content"]): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) continue;
    if (block.type !== "tool_result") continue;
    const raw = "content" in block ? block.content : "";
    if (typeof raw === "string") parts.push(raw);
    else if (Array.isArray(raw)) {
      for (const inner of raw) {
        if (
          inner &&
          typeof inner === "object" &&
          "text" in inner &&
          typeof inner.text === "string"
        ) {
          parts.push(inner.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}
