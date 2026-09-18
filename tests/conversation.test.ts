import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const tempDir = mkdtempSync(path.join(tmpdir(), "omni-conversation-test-"));
process.env.OMNI_DB_PATH = path.join(tempDir, "omni.db");
writeFileSync(process.env.OMNI_DB_PATH, "");

let conversation: typeof import("../lib/conversation");
let database: typeof import("../lib/db");

before(async () => {
  conversation = await import("../lib/conversation");
  database = await import("../lib/db");
});

beforeEach(() => {
  conversation.clearConversation();
});

after(() => {
  database.db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function sessionWithScratch(): MessageParam[] {
  return [
    { role: "user", content: "Find the project update" },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "notion_search",
          input: { query: "project update" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "Two matching projects: Atlas and Beacon",
        },
      ],
    },
  ];
}

test("pending clarification persists with history and MCP scratch", () => {
  const now = Date.now();
  conversation.saveSession(sessionWithScratch());
  const pending = conversation.setPendingClarification(
    {
      originalRequest: "  Find the project update ",
      latestQuestion: " Which project? ",
      missingDetail: " project name ",
      attemptCount: 1,
    },
    now
  );

  assert.deepEqual(pending, {
    originalRequest: "Find the project update",
    latestQuestion: "Which project?",
    missingDetail: "project name",
    attemptCount: 1,
    expiresAt: now + conversation.PENDING_CLARIFICATION_TTL_MS,
  });
  assert.deepEqual(conversation.getPendingClarification(now), pending);
  assert.equal(
    conversation.conversationScratch(),
    "Two matching projects: Atlas and Beacon"
  );
  assert.deepEqual(conversation.getConversation(), [
    { role: "user", content: "Find the project update" },
  ]);

  conversation.appendTurn("Beacon", "Which date?");
  assert.deepEqual(conversation.getPendingClarification(now), pending);
  assert.equal(
    conversation.conversationScratch(),
    "Two matching projects: Atlas and Beacon"
  );

  conversation.clearPendingClarification();
  assert.equal(conversation.getPendingClarification(now), null);
  assert.equal(
    conversation.conversationScratch(),
    "Two matching projects: Atlas and Beacon"
  );
  assert.deepEqual(conversation.getConversation().slice(-2), [
    { role: "user", content: "Beacon" },
    { role: "assistant", content: "Which date?" },
  ]);
});

test("expired pending clarification is durably removed without data loss", () => {
  const now = Date.now();
  conversation.saveSession(sessionWithScratch());
  conversation.setPendingClarification(
    {
      originalRequest: "Find the project update",
      latestQuestion: "Which project?",
      missingDetail: "project name",
      attemptCount: 2,
      expiresAt: now + 25,
    },
    now
  );

  assert.ok(conversation.getPendingClarification(now + 24));
  assert.equal(conversation.getPendingClarification(now + 25), null);
  assert.equal(
    conversation.conversationScratch(),
    "Two matching projects: Atlas and Beacon"
  );
  assert.deepEqual(conversation.getConversation(), [
    { role: "user", content: "Find the project update" },
  ]);

  const row = database.db
    .prepare("SELECT json FROM conversation_session WHERE id = 1")
    .get() as { json: string };
  assert.equal(
    Object.hasOwn(JSON.parse(row.json) as object, "pendingClarification"),
    false
  );
});

test("conversation reset clears pending clarification and history", () => {
  const now = Date.now();
  conversation.appendTurn("Find an email", "Which sender?");
  conversation.setPendingClarification(
    {
      originalRequest: "Find an email",
      latestQuestion: "Which sender?",
      missingDetail: "sender",
      attemptCount: 1,
    },
    now
  );

  conversation.clearConversation();
  assert.equal(conversation.getPendingClarification(now), null);
  assert.deepEqual(conversation.getConversation(), []);
  assert.equal(conversation.conversationScratch(), "");
});
