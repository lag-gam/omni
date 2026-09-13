// Phase 5: classify raw input as SAVE or QUESTION with a single model call
// (see lib/providers/ for which model). This is deliberately binary — the
// memory-vs-general-knowledge split for a QUESTION happens downstream in
// lib/memory.ts, not here. Bias toward SAVE on ambiguous input: a
// QUESTION that gets a wrong or empty answer is more annoying than a
// stray line saved that didn't need to be. See docs/ARCHITECTURE.md for
// the reasoning and a note on the main failure mode (statements phrased
// like questions, e.g. "gotta remember to call the dentist tomorrow").
//
// import type { Intent } from "./types";
// import { getProvider } from "./providers";
// export async function classifyIntent(text: string): Promise<Intent> { ... }

export {};
