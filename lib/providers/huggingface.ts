// Alternative provider — a good fit specifically for the general-knowledge
// fallback in lib/memory.ts (Phase 6b): plain factual Q&A ("what's the
// chemical formula for X") doesn't need a frontier model, and running it
// on an open model keeps that path cheap and swappable.
//
// Uses Hugging Face's hosted Inference API rather than downloading weights,
// so there's nothing to run locally. Any current open instruct model works
// (Llama, Mistral, Qwen, Gemma, etc.) — check https://huggingface.co/models
// for what's actually available on the Inference API when you build this,
// since hosted model availability shifts over time.
//
// import type { ModelProvider } from "./types";
//
// const HF_MODEL = process.env.HF_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct";
//
// export const huggingfaceProvider: ModelProvider = {
//   async complete(prompt: string) {
//     const res = await fetch(
//       `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/v1/chat/completions`,
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           model: HF_MODEL,
//           messages: [{ role: "user", content: prompt }],
//           max_tokens: 512,
//         }),
//       }
//     );
//     const data = await res.json();
//     return data.choices?.[0]?.message?.content ?? "";
//   },
// };

export {};
