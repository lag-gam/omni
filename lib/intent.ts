// Phase 5: classify raw input as SAVE / RECALL / CHAT with a single Claude
// call. Bias toward SAVE on ambiguous input — a false RECALL (answering
// nothing) is worse than a false SAVE (storing a stray line). See
// docs/ARCHITECTURE.md for the reasoning and a note on the main failure
// mode (statements phrased like questions).
//
// import type { Intent } from "./types";
// export async function classifyIntent(text: string): Promise<Intent> { ... }

export {};
