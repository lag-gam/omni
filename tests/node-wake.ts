import path from "node:path";
import { LocalWake, type OrtApi } from "../lib/wake-model";

export async function createNodeWake(): Promise<LocalWake> {
  const ort = (await import("onnxruntime-node")) as unknown as OrtApi;
  const dir = path.join(process.cwd(), "public/wake");
  const model = new LocalWake(ort, {
    mel: path.join(dir, "melspectrogram.onnx"),
    embed: path.join(dir, "embedding_model.onnx"),
    wake: path.join(dir, "hey_jarvis_v0.1.onnx"),
  });
  await model.init();
  return model;
}
