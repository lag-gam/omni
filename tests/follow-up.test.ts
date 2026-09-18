import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clarificationLimitAnswer,
  clarificationResumeBlock,
  FOLLOW_UP_TOOL_NAME,
  MAX_CLARIFICATION_ATTEMPTS,
  nextClarificationAttempt,
  parseFollowUpInput,
  parseStandaloneFollowUpCall,
} from "../lib/mcp/follow-up";

const validInput = {
  question: "  Which   Alex do you mean  ",
  missing_detail: "  the exact contact  ",
  reason: "ambiguous_results",
} as const;

test("follow-up input is normalized and must be a standalone tool call", () => {
  assert.deepEqual(parseFollowUpInput(validInput), {
    question: "Which Alex do you mean?",
    missingDetail: "the exact contact",
    reason: "ambiguous_results",
  });
  assert.deepEqual(
    parseStandaloneFollowUpCall([
      { name: FOLLOW_UP_TOOL_NAME, input: validInput },
    ]),
    parseFollowUpInput(validInput)
  );
  assert.deepEqual(
    parseFollowUpInput({
      ...validInput,
      question: "I need a name. Which Alex do you mean?",
    }),
    parseFollowUpInput(validInput)
  );
  assert.equal(
    parseStandaloneFollowUpCall([
      { name: FOLLOW_UP_TOOL_NAME, input: validInput },
      { name: "search_messages", input: {} },
    ]),
    null
  );
});

test("follow-up validation rejects malformed or generic questions", () => {
  const invalid: unknown[] = [
    null,
    {},
    { ...validInput, reason: "tool_failure" },
    { ...validInput, question: "Could you clarify?" },
    { ...validInput, missing_detail: " " },
  ];

  for (const input of invalid) {
    assert.equal(parseFollowUpInput(input), null);
  }
});

test("clarification attempts stop after three questions", () => {
  assert.equal(MAX_CLARIFICATION_ATTEMPTS, 3);
  assert.equal(nextClarificationAttempt(0), 1);
  assert.equal(nextClarificationAttempt(1), 2);
  assert.equal(nextClarificationAttempt(2), 3);
  assert.equal(nextClarificationAttempt(3), null);
  assert.equal(nextClarificationAttempt(99), null);
  assert.equal(nextClarificationAttempt(-1), null);
});

test("attempt-limit answers remain reason-specific", () => {
  assert.match(clarificationLimitAnswer("missing_detail"), /enough detail/i);
  assert.match(clarificationLimitAnswer("no_results"), /matching result/i);
  assert.match(clarificationLimitAnswer("ambiguous_results"), /narrow/i);
});

test("resume block keeps the original request and latest reply", () => {
  const block = clarificationResumeBlock(
    {
      originalRequest: "Find the message from Alex",
      latestQuestion: "Which Alex?",
      missingDetail: "exact contact",
      attemptCount: 1,
      expiresAt: Date.now() + 60_000,
    },
    "  work Alex  "
  );
  assert.match(block, /Original request: "Find the message from Alex"/);
  assert.match(block, /User's reply: "work Alex"/);
  assert.match(block, /omni_ask_follow_up/);
});
