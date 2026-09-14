import { anthropicProvider } from "./anthropic";
import { huggingfaceProvider } from "./huggingface";

export type CompleteOptions = {
  model?: string;
  maxTokens?: number;
};

export interface ModelProvider {
  /** One-shot text completion. Keep prompts self-contained — no provider
   *  here is expected to hold conversation state between calls. */
  complete(prompt: string, options?: CompleteOptions): Promise<string>;
}

export type ProviderName = "anthropic" | "huggingface";

/**
 * Return a provider by name. Defaults to Anthropic. Call sites can
 * request a specific provider — e.g. memory.ts uses "anthropic" for
 * intent/recall and optionally "huggingface" for general-knowledge.
 */
export function getProvider(name?: ProviderName): ModelProvider {
  const selected =
    name ?? (process.env.MODEL_PROVIDER as ProviderName) ?? "anthropic";
  switch (selected) {
    case "huggingface":
      return huggingfaceProvider;
    case "anthropic":
    default:
      return anthropicProvider;
  }
}
