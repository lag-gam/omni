import Anthropic from "@anthropic-ai/sdk";
import type { CompleteOptions, ModelProvider } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Default answer/classify model. Haiku is ~3–5× faster than Sonnet for
 *  these short calls; override with ANTHROPIC_MODEL if you want Sonnet. */
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

export const anthropicProvider: ModelProvider = {
  async complete(prompt: string, options?: CompleteOptions) {
    const msg = await client.messages.create({
      model: options?.model ?? ANTHROPIC_MODEL,
      max_tokens: options?.maxTokens ?? 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block?.type === "text" ? block.text : "";
  },
};
