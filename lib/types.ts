export type Note = {
  id: number;
  content: string;
  embedding: number[] | null;
  createdAt: string;
  tags: string[];
};

// DISCARD is resolved locally by lib/filter.ts (fast, no API call) and
// later also by the intent classifier (Phase 5) for borderline cases.
// Whether a QUESTION gets answered from memory or general knowledge is
// decided downstream in lib/memory.ts, not by the classifier.
export type Intent = "SAVE" | "QUESTION" | "DISCARD";

export type CaptureResult =
  | { type: "saved" }
  | { type: "answer"; text: string; source: "memory" | "general" }
  | { type: "filtered"; reason: string };
