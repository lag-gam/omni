export type Note = {
  id: number;
  content: string;
  embedding: number[] | null;
  createdAt: string;
  tags: string[];
};

export type Intent = "SAVE" | "RECALL" | "CHAT";

export type CaptureResult =
  | { type: "saved" }
  | { type: "answer"; text: string };
