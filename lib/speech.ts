type SpeakListener = (speaking: boolean) => void;
type UtteranceListener = (text: string) => void;

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let output: GainNode | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let generation = 0;
let playing = false;
let queued = 0;
const listeners = new Set<SpeakListener>();
const utteranceListeners = new Set<UtteranceListener>();

function notify(speaking: boolean) {
  for (const fn of listeners) fn(speaking);
}

function notifyUtterance(text: string) {
  for (const fn of utteranceListeners) fn(text);
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

export function onUtterance(fn: UtteranceListener): () => void {
  utteranceListeners.add(fn);
  return () => utteranceListeners.delete(fn);
}

export function isSpeaking(): boolean {
  return playing;
}

export function isVoiceBusy(): boolean {
  return playing || queued > 0;
}

export function stopSpeaking() {
  generation += 1;
  queued = 0;
  playing = false;
  try {
    currentSource?.stop();
  } catch {
    // already stopped
  }
  currentSource = null;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  notify(false);
}

async function playMp3(data: ArrayBuffer, token: number) {
  const graph = ensureGraph();
  if (graph.ctx.state === "suspended") await graph.ctx.resume();
  if (token !== generation) return;

  const buffer = await graph.ctx.decodeAudioData(data.slice(0));
  if (token !== generation) return;

  try {
    currentSource?.stop();
  } catch {
    // nothing playing
  }

  await new Promise<void>((resolve) => {
    const src = graph.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(graph.output);
    currentSource = src;
    playing = true;
    notify(true);
    src.onended = () => {
      if (currentSource === src) currentSource = null;
      playing = false;
      if (token === generation && queued === 0) notify(false);
      resolve();
    };
    src.start();
  });
}

let elevenLabsUp = true;

async function fetchSpeech(text: string, token: number): Promise<ArrayBuffer | null> {
  if (!elevenLabsUp || token !== generation) return null;
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (token !== generation) return null;
  if (res.status === 204 || res.status === 429) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    const raw = typeof body.error === "string" ? body.error : "";
    if (
      res.status === 402 ||
      body.code === "quota_exceeded" ||
      /quota_exceeded|credits remaining|out of credits/i.test(raw)
    ) {
      elevenLabsUp = false;
      console.warn("[omni] ElevenLabs out of credits; using Mac voice");
      return null;
    }
    throw new Error(raw || "Voice request failed");
  }
  return res.arrayBuffer();
}

function britishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const score = (voice: SpeechSynthesisVoice) => {
    const key = `${voice.name} ${voice.lang}`.toLowerCase();
    if (key.includes("daniel") && /en-gb|en_gb/.test(key)) return 0;
    if (key.includes("arthur")) return 1;
    if (key.includes("daniel")) return 2;
    if (voice.lang.toLowerCase().startsWith("en-gb")) return 3;
    if (/serena|jamie|martha|kate/.test(key)) return 4;
    return 99;
  };
  return voices
    .filter((voice) => score(voice) < 99)
    .sort((a, b) => score(a) - score(b))[0];
}

function waitForVoices(): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    window.setTimeout(done, 400);
  });
}

async function speakLocal(text: string, token: number): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  await waitForVoices();
  if (token !== generation) return;
  const voice = britishVoice();
  await new Promise<void>((resolve) => {
    if (token !== generation) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-GB";
    utter.rate = 0.98;
    utter.pitch = 0.95;
    if (voice) utter.voice = voice;
    utter.onend = () => {
      playing = false;
      if (token === generation && queued === 0) notify(false);
      resolve();
    };
    utter.onerror = () => {
      playing = false;
      resolve();
    };
    playing = true;
    notify(true);
    console.log("[omni] mac voice", voice?.name ?? "en-GB");
    window.speechSynthesis.speak(utter);
  });
}

type Job = { token: number; text: string };

let sharedSpeaker: ReturnType<typeof createSpeaker> | null = null;

export function getSpeaker() {
  if (!sharedSpeaker) sharedSpeaker = createSpeaker();
  return sharedSpeaker;
}

export function createSpeaker() {
  let buffer = "";
  const jobs: Job[] = [];
  let pumping = false;

  function enqueue(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    queued += 1;
    jobs.push({ token: generation, text: clean });
    notify(true);
    void pump();
  }

  async function runQueue() {
    let nextBuf: ArrayBuffer | null = null;
    while (jobs.length) {
      const job = jobs.shift();
      if (!job || job.token !== generation) {
        queued = Math.max(0, queued - 1);
        nextBuf = null;
        continue;
      }
      try {
        const data = nextBuf ?? (await fetchSpeech(job.text, job.token));
        nextBuf = null;
        const peek = jobs[0];
        const prefetch =
          elevenLabsUp && peek && peek.token === generation
            ? fetchSpeech(peek.text, peek.token)
            : null;
        if (job.token !== generation) {
          if (prefetch) nextBuf = await prefetch;
          continue;
        }
        notifyUtterance(job.text);
        if (!data) {
          await speakLocal(job.text, job.token);
          if (prefetch) nextBuf = await prefetch;
          continue;
        }
        if (prefetch) {
          const [, buf] = await Promise.all([
            playMp3(data, job.token),
            prefetch,
          ]);
          nextBuf = buf;
        } else {
          await playMp3(data, job.token);
        }
      } catch (err) {
        nextBuf = null;
        if (job.token === generation) {
          notifyUtterance(job.text);
          await speakLocal(job.text, job.token);
        }
        console.warn("[omni] voice:", err instanceof Error ? err.message : err);
      } finally {
        queued = Math.max(0, queued - 1);
      }
    }
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      if (typeof navigator !== "undefined" && navigator.locks) {
        await navigator.locks.request("omni-speak", runQueue);
      } else {
        await runQueue();
      }
    } finally {
      pumping = false;
      if (!playing && queued === 0) notify(false);
    }
  }

  function drain(force: boolean) {
    const parts = buffer
      .split(/(?<=[.!?])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      if (force) buffer = "";
      return;
    }

    const last = parts[parts.length - 1] ?? "";
    const lastDone = /[.!?]$/.test(last);
    const ready = force || lastDone ? parts : parts.slice(0, -1);
    buffer = force || lastDone ? "" : last;
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
      jobs.length = 0;
      stopSpeaking();
    },
  };
}
