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

export type HudCard = {
  id: string;
  kind: "answer" | "note" | "tool";
  title: string;
  body: string;
};

export type ClarificationReason =
  | "missing_detail"
  | "no_results"
  | "ambiguous_results";

export type ClarificationResult = {
  type: "clarify";
  question: string;
  reason: ClarificationReason;
};

export type CaptureResult =
  | { type: "saved" }
  | {
      type: "answer";
      text: string;
      source: "memory" | "general";
      citations?: Citation[];
      cards?: HudCard[];
    }
  | ClarificationResult
  | { type: "filtered"; reason: string };

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "log"; text: string }
  | { type: "card"; card: HudCard }
  | { type: "token"; text: string }
  | { type: "done"; result: CaptureResult }
  | { type: "error"; text: string };
