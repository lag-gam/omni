import type { ModelProvider } from "./types";

const HF_MODEL =
  process.env.HF_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct";

export const huggingfaceProvider: ModelProvider = {
  async complete(prompt: string) {
    const res = await fetch(
      `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: HF_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 512,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`HuggingFace API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  },
};
