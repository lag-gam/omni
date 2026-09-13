import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const anthropicProvider: ModelProvider = {
  async complete(prompt: string) {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block?.type === "text" ? block.text : "";
  },
};
