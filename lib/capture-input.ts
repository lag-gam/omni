import { filterInput } from "./filter";

export type CaptureInputDecision =
  | { type: "cancel" }
  | { type: "resume" }
  | { type: "proceed" }
  | { type: "filtered"; reason: string };

export function decideCaptureInput(
  text: string,
  hasPendingClarification: boolean
): CaptureInputDecision {
  if (hasPendingClarification) {
    return isClarificationCancel(text)
      ? { type: "cancel" }
      : { type: "resume" };
  }

  const check = filterInput(text);
  return check.pass
    ? { type: "proceed" }
    : { type: "filtered", reason: check.reason };
}

export function isClarificationCancel(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:please )?(?:cancel(?: that)?|never ?mind|nvm)(?: please)?$/.test(
    normalized
  );
}
