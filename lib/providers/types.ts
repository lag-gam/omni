// A single interface so intent classification, memory-grounded recall, and
// general-knowledge answers can each run on whichever model makes sense —
// Claude by default, or an open model via Hugging Face — without the rest
// of the app knowing which one is behind it.
//
// Swap providers with an env var rather than a code change:
//   MODEL_PROVIDER=anthropic   (default — see ./anthropic.ts)
//   MODEL_PROVIDER=huggingface (see ./huggingface.ts)
//
// Why this matters for Omni specifically: the general-knowledge fallback
// (lib/memory.ts, Phase 6b) is the one path that isn't really "personal" —
// it's plain factual Q&A ("what's the chemical formula for X"), which is
// exactly the kind of thing a smaller open instruct model handles fine and
// cheaply, while intent classification and memory-grounded recall probably
// still want a stronger model. Nothing forces you to use the same provider
// for both — getProvider() can be called with different names per call site.

export interface ModelProvider {
  /** One-shot text completion. Keep prompts self-contained — no provider
   *  here is expected to hold conversation state between calls. */
  complete(prompt: string): Promise<string>;
}

export type ProviderName = "anthropic" | "huggingface";

// Phase 6b:
// import { anthropicProvider } from "./anthropic";
// import { huggingfaceProvider } from "./huggingface";
//
// export function getProvider(name?: ProviderName): ModelProvider {
//   const selected = name ?? (process.env.MODEL_PROVIDER as ProviderName) ?? "anthropic";
//   switch (selected) {
//     case "huggingface": return huggingfaceProvider;
//     case "anthropic":
//     default: return anthropicProvider;
//   }
// }
