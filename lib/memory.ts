// Orchestrates the whole loop described in docs/ARCHITECTURE.md.
//
// Phase 3: handleCapture just inserts the raw text and returns {type: "saved"}.
// Phase 5: route through classifyIntent first (SAVE vs QUESTION).
// Phase 6: on QUESTION —
//   1. embed the query, run embeddings.topMatches against stored notes
//   2. if the best match clears SIMILARITY_THRESHOLD, synthesize an answer
//      grounded only in the retrieved notes -> {source: "memory"}
//   3. otherwise, fall through to a general-knowledge completion via
//      lib/providers -> {source: "general"}
// This is what makes Omni feel like Jarvis instead of two separate tools:
// the person never says "search my notes" vs "look this up" — one
// question, answered from whichever source actually has the answer.
//
// const SIMILARITY_THRESHOLD = 0.75; // tune once Phase 4/6 have real data
//
// import type { CaptureResult } from "./types";
// export async function handleCapture(text: string): Promise<CaptureResult> { ... }

export {};
