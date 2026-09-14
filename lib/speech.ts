type SpeakListener = (speaking: boolean) => void;

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let output: GainNode | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let generation = 0;
let active = 0;
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<SpeakListener>();

function notify(speaking: boolean) {
  for (const fn of listeners) fn(speaking);
}

function ensureGraph() {
  if (ctx && analyser && output) return { ctx, analyser, output };
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  output = ctx.createGain();
  output.gain.value = 1;
  output.connect(analyser);
  analyser.connect(ctx.destination);
  return { ctx, analyser, output };
}

export function getAnalyser(): AnalyserNode | null {
  if (typeof window === "undefined") return null;
  return ensureGraph().analyser;
}

export function onSpeaking(fn: SpeakListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function stopSpeaking() {
  generation += 1;
  active = 0;
  try {
    currentSource?.stop();
  } catch {
    // already stopped
  }
  currentSource = null;
  notify(false);
}

async function playMp3(data: ArrayBuffer, token: number) {
  const graph = ensureGraph();
  if (graph.ctx.state === "suspended") await graph.ctx.resume();
  if (token !== generation) return;

  const buffer = await graph.ctx.decodeAudioData(data.slice(0));
  if (token !== generation) return;

  await new Promise<void>((resolve) => {
    const src = graph.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(graph.output);
    currentSource = src;
    active += 1;
    notify(true);
    src.onended = () => {
      if (currentSource === src) currentSource = null;
      active = Math.max(0, active - 1);
      if (token === generation && active === 0) notify(false);
      resolve();
    };
    src.start();
  });
}

async function fetchSpeech(text: string): Promise<ArrayBuffer | null> {
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string" ? body.error : "Voice request failed"
    );
  }
  return res.arrayBuffer();
}

export function createSpeaker() {
  let buffer = "";

  function enqueue(text: string) {
    const token = generation;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    queue = queue.then(async () => {
      if (token !== generation) return;
      try {
        const data = await fetchSpeech(clean);
        if (!data || token !== generation) return;
        await playMp3(data, token);
      } catch (err) {
        console.warn("[omni] voice:", err instanceof Error ? err.message : err);
      }
    });
  }

  function drain(force: boolean) {
    const parts = buffer.split(/(?<=[.!?])\s+/);
    if (!force && parts.length < 2) return;
    const ready = force ? parts : parts.slice(0, -1);
    buffer = force ? "" : (parts[parts.length - 1] ?? "");
    for (const sentence of ready) enqueue(sentence);
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      drain(false);
    },
    flush() {
      drain(true);
    },
    stop() {
      buffer = "";
      queue = Promise.resolve();
      stopSpeaking();
    },
  };
}
