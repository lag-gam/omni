import { WAKE_FRAME } from "./pcm";

export type OrtTensor = { data: Float32Array | number[] };

export type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  inputMetadata?: Record<string, { dimensions?: number[] }>;
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

export type OrtApi = {
  env?: { wasm?: { wasmPaths?: string; numThreads?: number } };
  InferenceSession: { create: (path: string) => Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

export type WakePaths = {
  mel: string;
  embed: string;
  wake: string;
};

const MEL_CONTEXT = 480;
const MEL_BINS = 32;
const MEL_FRAMES = 8;
const MEL_WINDOW = 76;
const EMBED_DIM = 96;
const THRESHOLD = 0.5;

export const WAKE_THRESHOLD = THRESHOLD;

async function loadBrowserOrt(): Promise<OrtApi> {
  const base = `${window.location.origin}/wake/`;
  const href = `${base}ort.wasm.min.mjs`;
  const load = new Function("u", "return import(u)") as (
    u: string
  ) => Promise<Record<string, unknown>>;
  const mod = await load(href);
  const ort = (mod.default ?? mod) as OrtApi;
  if (ort.env?.wasm) {
    ort.env.wasm.wasmPaths = base;
    ort.env.wasm.numThreads = 1;
  }
  return ort;
}

export class LocalWake {
  private mel!: OrtSession;
  private embed!: OrtSession;
  private wake!: OrtSession;
  private windowSize = 16;
  private melCtx = new Float32Array(MEL_CONTEXT);
  private mels: Float32Array[] = Array.from({ length: MEL_WINDOW }, () =>
    new Float32Array(MEL_BINS).fill(1)
  );
  private embeds: Float32Array[] = [];
  private leftover = new Float32Array(0);

  constructor(
    private ort: OrtApi,
    private paths: WakePaths
  ) {}

  async init() {
    const [mel, embed, wake] = await Promise.all([
      this.ort.InferenceSession.create(this.paths.mel),
      this.ort.InferenceSession.create(this.paths.embed),
      this.ort.InferenceSession.create(this.paths.wake),
    ]);
    this.mel = mel;
    this.embed = embed;
    this.wake = wake;
    this.windowSize = detectWindow(wake);
  }

  reset() {
    this.melCtx.fill(0);
    this.leftover = new Float32Array(0);
    this.mels = Array.from({ length: MEL_WINDOW }, () =>
      new Float32Array(MEL_BINS).fill(1)
    );
    this.embeds = [];
  }

  async score(frame: Float32Array): Promise<number> {
    const pcm = toIntScale(frame);
    const joined = new Float32Array(this.leftover.length + pcm.length);
    joined.set(this.leftover);
    joined.set(pcm, this.leftover.length);

    let best = 0;
    let offset = 0;
    while (offset + WAKE_FRAME <= joined.length) {
      const chunk = joined.subarray(offset, offset + WAKE_FRAME);
      offset += WAKE_FRAME;
      const next = await this.step(chunk);
      if (next > best) best = next;
    }
    this.leftover = joined.subarray(offset);
    return best;
  }

  async scoreStream(pcm: Float32Array): Promise<number> {
    let best = 0;
    for (let i = 0; i + WAKE_FRAME <= pcm.length; i += WAKE_FRAME) {
      const next = await this.score(pcm.subarray(i, i + WAKE_FRAME));
      if (next > best) best = next;
    }
    return best;
  }

  private async step(chunk: Float32Array): Promise<number> {
    const input = new Float32Array(WAKE_FRAME + MEL_CONTEXT);
    input.set(this.melCtx);
    input.set(chunk, MEL_CONTEXT);
    this.melCtx.set(chunk.subarray(WAKE_FRAME - MEL_CONTEXT));

    const melOut = await run(this.ort, this.mel, input, [1, input.length]);
    for (let f = 0; f < MEL_FRAMES; f++) {
      const row = new Float32Array(MEL_BINS);
      for (let b = 0; b < MEL_BINS; b++) {
        row[b] = (melOut[f * MEL_BINS + b] ?? 0) / 10 + 2;
      }
      this.mels.push(row);
    }
    if (this.mels.length > 200) this.mels.splice(0, this.mels.length - 200);

    const embedding = await this.runEmbed();
    this.embeds.push(embedding);
    if (this.embeds.length > 40) this.embeds.shift();
    if (this.embeds.length < this.windowSize) return 0;
    return this.runWake();
  }

  private async runEmbed(): Promise<Float32Array> {
    const data = new Float32Array(MEL_WINDOW * MEL_BINS);
    const start = this.mels.length - MEL_WINDOW;
    for (let t = 0; t < MEL_WINDOW; t++) {
      data.set(this.mels[start + t]!, t * MEL_BINS);
    }
    const out = await run(this.ort, this.embed, data, [1, MEL_WINDOW, MEL_BINS, 1]);
    const embedding = new Float32Array(EMBED_DIM);
    for (let i = 0; i < EMBED_DIM; i++) {
      const v = out[i] ?? 0;
      embedding[i] = Number.isFinite(v) ? v : 0;
    }
    return embedding;
  }

  private async runWake(): Promise<number> {
    const data = new Float32Array(this.windowSize * EMBED_DIM);
    const start = this.embeds.length - this.windowSize;
    for (let t = 0; t < this.windowSize; t++) {
      data.set(this.embeds[start + t]!, t * EMBED_DIM);
    }
    const out = await run(this.ort, this.wake, data, [1, this.windowSize, EMBED_DIM]);
    return out[0] ?? 0;
  }
}

export async function createBrowserWake(): Promise<LocalWake> {
  const ort = await loadBrowserOrt();
  const model = new LocalWake(ort, {
    mel: "/wake/melspectrogram.onnx",
    embed: "/wake/embedding_model.onnx",
    wake: "/wake/hey_jarvis_v0.1.onnx",
  });
  await model.init();
  return model;
}

async function run(
  ort: OrtApi,
  session: OrtSession,
  data: Float32Array,
  dims: number[]
): Promise<Float32Array> {
  const tensor = new ort.Tensor("float32", data, dims);
  const result = await session.run({ [session.inputNames[0]!]: tensor });
  const raw = result[session.outputNames[0]!]?.data;
  return raw instanceof Float32Array ? raw : Float32Array.from(raw ?? []);
}

function detectWindow(session: OrtSession): number {
  const name = session.inputNames[0];
  const dims = name ? session.inputMetadata?.[name]?.dimensions : undefined;
  if (dims && typeof dims[1] === "number" && dims[1] > 0) return dims[1];
  return 16;
}

function toIntScale(frame: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < frame.length; i++) {
    const a = Math.abs(frame[i]!);
    if (a > max) max = a;
  }
  if (max > 1) return frame;
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = frame[i]! * 32768;
  return out;
}
