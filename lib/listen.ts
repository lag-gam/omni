import { getMicTap } from "./mic";
import { rms } from "./pcm";
import { pcmToWav } from "./record";
import { createScribeSession } from "./scribe";
import { isSpeaking, isVoiceBusy, onSpeaking } from "./speech";
import { commandAfterWake } from "./wake";
import { createBrowserWake, WAKE_THRESHOLD } from "./wake-model";

export type ListenHandlers = {
  onWake: () => void;
  onCommand: (text: string) => void;
  onPartial?: (text: string) => void;
  onStatus?: (text: string) => void;
  onIdle?: () => void;
  shouldIgnore?: () => boolean;
};

export type ReplyCaptureHandlers = {
  signal?: AbortSignal;
  onPartial?: (text: string) => void;
  onStatus?: (text: string) => void;
};

export type SpeechCaptureGate = {
  recording: boolean;
  held: boolean;
  speechHeld: boolean;
  speaking: boolean;
  voiceBusy: boolean;
};

type WakeState = {
  handlers: ListenHandlers | null;
  hooked: boolean;
  held: boolean;
  speechHeld: boolean;
  recording: boolean;
  lastWake: number;
};

const g = globalThis as typeof globalThis & { __omniWake?: WakeState };
const state: WakeState = (g.__omniWake ??= {
  handlers: null,
  hooked: false,
  held: false,
  speechHeld: false,
  recording: false,
  lastWake: 0,
});
state.speechHeld ??= false;

export function holdListen(on: boolean) {
  state.held = on;
}

export function canStartSpeechCapture(gate: SpeechCaptureGate): boolean {
  return (
    !gate.recording &&
    !gate.held &&
    !gate.speechHeld &&
    !gate.speaking &&
    !gate.voiceBusy
  );
}

export function startWakeListener(next: ListenHandlers): () => void {
  state.handlers = next;
  if (!state.hooked) {
    state.hooked = true;
    onSpeaking((on) => {
      state.speechHeld = on;
    });
    void startLocalWake();
  }
  return () => {
    if (state.handlers === next) state.handlers = null;
  };
}

function busy() {
  return (
    !state.handlers ||
    state.held ||
    state.speechHeld ||
    state.recording ||
    isSpeaking() ||
    isVoiceBusy() ||
    Boolean(state.handlers?.shouldIgnore?.())
  );
}

async function startLocalWake() {
  try {
    const model = await createBrowserWake();
    const tap = await getMicTap();
    console.log("[omni] local wake on (jarvis)");

    const pending: Float32Array[] = [];
    let pumping = false;
    let peak = 0;
    let lastLog = 0;

    const pump = async () => {
      if (pumping) return;
      pumping = true;
      try {
        while (pending.length) {
          const frame = pending.shift()!;
          if (busy()) continue;
          const score = await model.score(frame);
          if (score > peak) peak = score;
          if (peak >= 0.4 && Date.now() - lastLog > 2500) {
            lastLog = Date.now();
            console.log("[omni] score", peak.toFixed(3));
            peak = 0;
          }
          if (score < WAKE_THRESHOLD) continue;
          if (Date.now() - state.lastWake < 2500) continue;
          state.lastWake = Date.now();
          console.log("[omni] wake", score.toFixed(2));
          pending.length = 0;
          model.reset();
          void captureFollowUp(model);
          break;
        }
      } catch (err) {
        console.warn("[omni] wake score:", err instanceof Error ? err.message : err);
      } finally {
        pumping = false;
        if (pending.length && !state.recording) void pump();
      }
    };

    tap.subscribe((frame) => {
      if (busy()) return;
      pending.push(frame);
      if (pending.length > 40) pending.splice(0, pending.length - 40);
      void pump();
    });
  } catch (err) {
    console.warn("[omni] local wake failed", err instanceof Error ? err.message : err);
    state.handlers?.onStatus?.("Wake word failed to load. Type instead.");
  }
}

async function captureFollowUp(model: { reset: () => void }) {
  try {
    const result = await captureSpeech({
      label: "wake",
      waitMs: WAIT_FOR_SPEECH_MS,
      normalize: commandAfterWake,
      onStart: () => state.handlers?.onWake(),
      onPartial: (text) => state.handlers?.onPartial?.(text),
      onTranscribing: () => state.handlers?.onStatus?.("Transcribing…"),
    });
    if (result.type === "empty") {
      hangUp("listen timed out");
      return;
    }
    if (result.type === "error") {
      console.warn(
        "[omni] listen:",
        result.error instanceof Error ? result.error.message : result.error
      );
      state.handlers?.onStatus?.("Mic didn't work. Type instead.");
      state.handlers?.onIdle?.();
      return;
    }
    if (result.type !== "heard") return;
    console.log("[omni] heard", result.text);
    state.handlers?.onCommand(result.text);
  } finally {
    model.reset();
    state.lastWake = Date.now();
  }
}

export const REPLY_SPEECH_START_MS = 8000;

/**
 * Capture one conversational reply without requiring or removing the wake word.
 * The caller should invoke this only after TTS has fully drained.
 */
export async function captureReply(
  handlers: ReplyCaptureHandlers = {}
): Promise<string | null> {
  const result = await captureSpeech({
    label: "reply",
    waitMs: REPLY_SPEECH_START_MS,
    signal: handlers.signal,
    normalize: normalizeReplyTranscript,
    onStart: () => handlers.onStatus?.("Listening…"),
    onPartial: handlers.onPartial,
    onTranscribing: () => handlers.onStatus?.("Transcribing reply…"),
  });

  if (result.type === "heard") {
    console.log("[omni] heard reply", result.text);
    return result.text;
  }
  if (result.type === "empty") {
    handlers.onStatus?.("Reply timed out. Say Jarvis to continue.");
    state.handlers?.onIdle?.();
  } else if (result.type === "error") {
    console.warn(
      "[omni] reply listen:",
      result.error instanceof Error ? result.error.message : result.error
    );
    handlers.onStatus?.("Reply mic didn't work. Say Jarvis or type instead.");
    state.handlers?.onIdle?.();
  }
  return null;
}

function hangUp(reason: string) {
  console.log("[omni]", reason, "— say jarvis");
  state.handlers?.onStatus?.("Say Jarvis again.");
  state.handlers?.onIdle?.();
}

type SpeechCaptureResult =
  | { type: "heard"; text: string }
  | { type: "empty" | "blocked" | "canceled" }
  | { type: "error"; error: unknown };

async function captureSpeech(opts: {
  label: "wake" | "reply";
  waitMs: number;
  normalize: (text: string) => string | undefined;
  signal?: AbortSignal;
  onStart?: () => void;
  onPartial?: (text: string) => void;
  onTranscribing?: () => void;
}): Promise<SpeechCaptureResult> {
  if (opts.signal?.aborted) return { type: "canceled" };
  if (
    !canStartSpeechCapture({
      recording: state.recording,
      held: state.held,
      speechHeld: state.speechHeld,
      speaking: isSpeaking(),
      voiceBusy: isVoiceBusy(),
    })
  ) {
    console.log(`[omni] ${opts.label} listen blocked`);
    return { type: "blocked" };
  }

  state.recording = true;
  opts.onStart?.();
  const scribe = createScribeSession({
    onPartial: (text) => {
      const normalized = opts.normalize(text);
      if (normalized) opts.onPartial?.(normalized);
    },
  });
  const cancelScribe = () => scribe.close();
  opts.signal?.addEventListener("abort", cancelScribe, { once: true });

  try {
    const pcm = await collectUtterance({
      waitMs: opts.waitMs,
      signal: opts.signal,
      onSpeech: () => scribe.connect(),
      onFrame: (frame) => scribe.send(frame),
    });
    if (opts.signal?.aborted) return { type: "canceled" };
    if (!pcm) return { type: "empty" };

    opts.onTranscribing?.();
    console.log(`[omni] ${opts.label} transcribe start`);
    const live = await withAbort(scribe.finish(), opts.signal);
    if (opts.signal?.aborted) return { type: "canceled" };
    const fallback = live ? "" : await whisper(pcm, opts.signal);
    if (opts.signal?.aborted) return { type: "canceled" };
    const raw = (live || fallback).trim();
    const text = opts.normalize(raw);
    console.log(
      `[omni] ${opts.label} transcribe`,
      text || "(empty)",
      live ? "scribe" : "whisper"
    );
    return text ? { type: "heard", text } : { type: "empty" };
  } catch (error) {
    if (opts.signal?.aborted || isAbortError(error)) {
      return { type: "canceled" };
    }
    return { type: "error", error };
  } finally {
    opts.signal?.removeEventListener("abort", cancelScribe);
    scribe.close();
    state.recording = false;
    if (opts.label === "wake") state.lastWake = Date.now();
  }
}

export function normalizeReplyTranscript(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function withAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function whisper(
  pcm: Float32Array,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: pcmToWav(pcm),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string };
  return (data.text ?? "").trim();
}

const WAIT_FOR_SPEECH_MS = 5000;
const END_SILENCE_MS = 900;
const MAX_SPEECH_MS = 6000;
const SPEECH_RMS = 0.0045;
const SPEECH_FRAMES = 2;
const MIN_SAMPLES = 3200;

async function collectUtterance(opts?: {
  waitMs?: number;
  signal?: AbortSignal;
  onSpeech?: () => void;
  onFrame?: (frame: Float32Array) => void;
}): Promise<Float32Array | null> {
  if (opts?.signal?.aborted) return null;
  const tap = await withAbort(getMicTap(), opts?.signal);
  if (opts?.signal?.aborted) return null;
  const chunks: Float32Array[] = [];
  let peaked = false;
  let hot = 0;
  let silent = 0;
  let speechAt = 0;
  let maxRms = 0;
  const waitMs = opts?.waitMs ?? WAIT_FOR_SPEECH_MS;
  const started = Date.now();

  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub = () => {};
    const onAbort = () => finish(null);
    const finish = (pcm: Float32Array | null) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      unsub();
      resolve(pcm);
    };
    unsub = tap.subscribe((frame) => {
      if (done) return;
      if (
        state.held ||
        state.speechHeld ||
        isSpeaking() ||
        isVoiceBusy()
      ) {
        finish(null);
        return;
      }
      const level = rms(frame);
      if (level > maxRms) maxRms = level;
      const now = Date.now();
      if (level > SPEECH_RMS) {
        hot += 1;
        silent = 0;
        if (!peaked && hot >= SPEECH_FRAMES) {
          peaked = true;
          speechAt = now;
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          opts?.onSpeech?.();
        }
        if (peaked) {
          chunks.push(new Float32Array(frame));
          opts?.onFrame?.(frame);
        }
      } else {
        hot = 0;
        if (peaked) {
          silent += 80;
          chunks.push(new Float32Array(frame));
          opts?.onFrame?.(frame);
        }
      }

      if (!peaked && waitMs > 0 && now - started >= waitMs) {
        console.log("[omni] listen idle", "peak rms", maxRms.toFixed(4));
        finish(null);
        return;
      }
      if (peaked && (silent >= END_SILENCE_MS || now - speechAt >= MAX_SPEECH_MS)) {
        let len = 0;
        for (const c of chunks) len += c.length;
        if (len < MIN_SAMPLES) {
          finish(null);
          return;
        }
        const out = new Float32Array(len);
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        finish(out);
      }
    });
    opts?.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts?.signal?.aborted) {
      finish(null);
      return;
    }
    if (waitMs > 0) {
      timer = setTimeout(() => {
        console.log("[omni] listen idle", "peak rms", maxRms.toFixed(4));
        finish(null);
      }, waitMs);
    }
  });
}
