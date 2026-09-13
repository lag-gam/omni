import { anthropicProvider } from "./anthropic";

export interface ModelProvider {
  /** One-shot text completion. Keep prompts self-contained — no provider
   *  here is expected to hold conversation state between calls. */
  complete(prompt: string): Promise<string>;
}

export type ProviderName = "anthropic" | "huggingface";

/**
 * Return a provider by name. Defaults to Anthropic. HuggingFace provider
 * is wired in Phase 7 — until then, everything uses Anthropic.
 */
export function getProvider(name?: ProviderName): ModelProvider {
  const selected =
    name ?? (process.env.MODEL_PROVIDER as ProviderName) ?? "anthropic";
  switch (selected) {
    case "huggingface":
      throw new Error("HuggingFace provider not yet wired — coming in Phase 7");
    case "anthropic":
    default:
      return anthropicProvider;
  }
}
