import type { PendingClarification } from "../conversation";
import type { ClarificationReason } from "../types";

export const FOLLOW_UP_TOOL_NAME = "omni_ask_follow_up";
export const MAX_CLARIFICATION_ATTEMPTS = 3;
export const FOLLOW_UP_QUESTION_MAX_LENGTH = 200;
export const FOLLOW_UP_DETAIL_MAX_LENGTH = 120;

const CLARIFICATION_REASONS = new Set<ClarificationReason>([
  "missing_detail",
  "no_results",
  "ambiguous_results",
]);

export type FollowUpInput = {
  question: string;
  missingDetail: string;
  reason: ClarificationReason;
};

type ToolCall = {
  name: string;
  input: unknown;
};

export function parseStandaloneFollowUpCall(
  calls: readonly ToolCall[]
): FollowUpInput | null {
  if (calls.length !== 1 || calls[0]?.name !== FOLLOW_UP_TOOL_NAME) {
    return null;
  }
  return parseFollowUpInput(calls[0].input);
}

export function parseFollowUpInput(input: unknown): FollowUpInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.question !== "string" ||
    typeof raw.missing_detail !== "string" ||
    typeof raw.reason !== "string" ||
    !CLARIFICATION_REASONS.has(raw.reason as ClarificationReason)
  ) {
    return null;
  }

  const missingDetail = raw.missing_detail.replace(/\s+/g, " ").trim();
  const question = normalizeFollowUpQuestion(raw.question);
  if (
    !question ||
    !missingDetail ||
    question.length > FOLLOW_UP_QUESTION_MAX_LENGTH ||
    missingDetail.length > FOLLOW_UP_DETAIL_MAX_LENGTH
  ) {
    return null;
  }

  const generic = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:(?:can|could|would|will) you )?(?:please )?(?:clarify|provide (?:more )?(?:detail|details|information)|give me (?:more )?(?:detail|details|information))$/.test(
      generic
    )
  ) {
    return null;
  }

  return {
    question,
    missingDetail,
    reason: raw.reason as ClarificationReason,
  };
}

function normalizeFollowUpQuestion(raw: string): string | null {
  let question = raw.replace(/\s+/g, " ").trim();
  if (!question) return null;

  const sentences = question
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 1) {
    const lastQuestion = [...sentences]
      .reverse()
      .find((part) => part.endsWith("?"));
    if (!lastQuestion) return null;
    question = lastQuestion;
  }

  const questionMarks = question.match(/\?/g)?.length ?? 0;
  if (
    questionMarks > 1 ||
    (questionMarks === 1 && !question.endsWith("?"))
  ) {
    return null;
  }
  if (questionMarks === 0) {
    question = question.replace(/[.!]+$/, "").trim();
    if (!question) return null;
    question = `${question}?`;
  }
  return question;
}

export function nextClarificationAttempt(
  previousAttempts: number
): number | null {
  if (
    !Number.isInteger(previousAttempts) ||
    previousAttempts < 0 ||
    previousAttempts >= MAX_CLARIFICATION_ATTEMPTS
  ) {
    return null;
  }
  return previousAttempts + 1;
}

export function clarificationResumeBlock(
  pending: PendingClarification,
  reply: string
): string {
  return `Active clarification:
- Resume the original request; do not treat the newest message as a standalone request.
- Original request: ${JSON.stringify(pending.originalRequest)}
- Your latest question: ${JSON.stringify(pending.latestQuestion)}
- Detail needed: ${JSON.stringify(pending.missingDetail)}
- User's reply: ${JSON.stringify(reply.trim())}
- This reply may be a name, date, "yes", or "no". Apply it to the original request, use the earlier findings, and continue the task.
- If one genuinely required detail is still missing, you may call omni_ask_follow_up again for that detail only. Do not repeat a question the user already answered.`;
}

export function clarificationLimitAnswer(
  reason: ClarificationReason
): string {
  if (reason === "no_results") {
    return "I still couldn’t find a matching result with those details.";
  }
  if (reason === "ambiguous_results") {
    return "I couldn’t narrow those results to a reliable match.";
  }
  return "I still don’t have enough detail to complete that reliably.";
}
