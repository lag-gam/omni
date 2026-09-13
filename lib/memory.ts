// Orchestrates the whole loop described in docs/ARCHITECTURE.md.
//
// Phase 3: handleCapture just inserts the raw text and returns {type: "saved"}.
// Phase 5: route through classifyIntent first.
// Phase 6: on RECALL, run embeddings.topMatches and synthesize an answer,
//          saying plainly when nothing relevant is stored.
//
// import type { CaptureResult } from "./types";
// export async function handleCapture(text: string): Promise<CaptureResult> { ... }

export {};
