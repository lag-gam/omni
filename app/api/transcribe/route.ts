import { pipeline } from "@huggingface/transformers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Asr = {
  (audio: Float32Array, opts?: { sampling_rate?: number }): Promise<
    { text?: string } | { text?: string }[]
  >;
};

const g = globalThis as typeof globalThis & { __omniWhisper?: Promise<Asr> };

function getWhisper() {
  g.__omniWhisper ??= pipeline(
    "automatic-speech-recognition",
    "Xenova/whisper-tiny.en"
  ) as Promise<Asr>;
  return g.__omniWhisper;
}

export async function POST(req: Request) {
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 44) {
    return Response.json({ error: "Empty audio" }, { status: 400 });
  }

  const audio = wavPcm16ToFloat32(buf);
  if (audio.length < 1600) {
    return Response.json({ text: "" });
  }

  const asr = await getWhisper();
  const out = await asr(audio, { sampling_rate: 16000 });
  const row = Array.isArray(out) ? out[0] : out;
  const text = (row?.text ?? "").replace(/\s+/g, " ").trim();
  console.log("[omni] transcribe", text || "(empty)", `${audio.length} samples`);
  return Response.json({ text });
}

function wavPcm16ToFloat32(buf: Buffer): Float32Array {
  const dataSize = buf.readUInt32LE(40);
  const samples = Math.floor(dataSize / 2);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = buf.readInt16LE(44 + i * 2) / 32768;
  }
  return out;
}
