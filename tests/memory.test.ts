import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { CaptureStreamDependencies } from "../lib/memory";
import type { StreamEvent } from "../lib/types";

test("capture stream resumes short replies and clears explicit cancellation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "omni-memory-"));
  const dbPath = path.join(dir, "test.db");
  writeFileSync(dbPath, "");
  const previousDbPath = process.env.OMNI_DB_PATH;
  process.env.OMNI_DB_PATH = dbPath;

  const conversation = await import("../lib/conversation");
  const { handleCaptureStream } = await import("../lib/memory");
  const { db } = await import("../lib/db");

  try {
    conversation.clearConversation();
    const pending = conversation.setPendingClarification({
      originalRequest: "Find the message from Alex",
      latestQuestion: "Which Alex?",
      missingDetail: "exact contact",
      attemptCount: 1,
    });

    let resumed:
      | {
          question: string;
          pending: typeof pending | undefined;
        }
      | undefined;
    const fakeAgent = async function* (
      question: string,
      _history: unknown,
      _traceId: string,
      activePending?: typeof pending
    ): AsyncGenerator<StreamEvent> {
      resumed = { question, pending: activePending };
      yield {
        type: "done",
        result: {
          type: "clarify",
          question: "Personal or work account?",
          reason: "ambiguous_results",
        },
      };
    };

    const resumedEvents: StreamEvent[] = [];
    for await (const event of handleCaptureStream("yes", "test-resume", {
      runAgentStream: fakeAgent as CaptureStreamDependencies["runAgentStream"],
      warmMcp: async () => [],
      warmN8n: async () => [],
    })) {
      resumedEvents.push(event);
    }

    assert.equal(resumed?.question, "yes");
    assert.deepEqual(resumed?.pending, pending);
    assert.equal(resumedEvents[0]?.type, "status");
    const lastResumedEvent = resumedEvents.at(-1);
    assert.equal(
      lastResumedEvent?.type === "done"
        ? lastResumedEvent.result.type
        : undefined,
      "clarify"
    );

    const cancelledEvents: StreamEvent[] = [];
    for await (const event of handleCaptureStream(
      "Never mind, please.",
      "test-cancel"
    )) {
      cancelledEvents.push(event);
    }

    assert.equal(conversation.getPendingClarification(), null);
    const done = cancelledEvents.find((event) => event.type === "done");
    assert.deepEqual(done, {
      type: "done",
      result: {
        type: "answer",
        text: "Cancelled.",
        source: "general",
      },
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    if (previousDbPath === undefined) delete process.env.OMNI_DB_PATH;
    else process.env.OMNI_DB_PATH = previousDbPath;
  }
});
