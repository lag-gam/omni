export type Note = {
  id: number;
  content: string;
  embedding: number[] | null;
  createdAt: string;
  tags: string[];
};

// The classifier only ever picks between these two — see lib/intent.ts.
// Whether a QUESTION gets answered from memory or general knowledge is
// decided downstream, in lib/memory.ts, not by the classifier.
export type Intent = "SAVE" | "QUESTION";

export type CaptureResult =
  | { type: "saved" }
  | { type: "answer"; text: string; source: "memory" | "general" };
