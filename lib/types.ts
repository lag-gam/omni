export type Note = {
  id: number;
  content: string;
  embedding: number[] | null;
  createdAt: string;
  tags: string[];
};

export type Intent = "SAVE" | "QUESTION" | "DISCARD";

export type Citation = {
  kind: "note" | "tool";
  title: string;
  display: string;
};

export type CaptureResult =
  | { type: "saved" }
  | { type: "answer"; text: string; source: "memory" | "general"; citations?: Citation[] }
  | { type: "filtered"; reason: string };

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "done"; result: CaptureResult }
  | { type: "error"; text: string };
