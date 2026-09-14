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

type WakeState = {
  handlers: ListenHandlers | null;
  hooked: boolean;
  held: boolean;
  recording: boolean;
  lastWake: number;
};

const g = globalThis as typeof globalThis & { __omniWake?: WakeState };
const state: WakeState = (g.__omniWake ??= {
  handlers: null,
  hooked: false,
  held: false,
  recording: false,
  lastWake: 0,
});

export function holdListen(on: boolean) {
  state.held = on;
}

export function startWakeListener(next: ListenHandlers): () => void {
  state.handlers = next;
  if (!state.hooked) {
    state.hooked = true;
    onSpeaking((on) => {
      holdListen(on);
    });
    void startLocalWake();
  }
  return () => {};
}

function busy() {
  return (
    state.held ||
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
  if (state.recording || state.held) return;
  state.recording = true;
  state.handlers?.onWake();
  const scribe = createScribeSession({
    onPartial: (text) => {
      const command = commandAfterWake(text) ?? text;
      if (command) state.handlers?.onPartial?.(command);
    },
  });
  try {
    const pcm = await collectUtterance({
      waitMs: WAIT_FOR_SPEECH_MS,
      onSpeech: () => scribe.connect(),
      onFrame: (frame) => scribe.send(frame),
    });
    if (!pcm) {
      scribe.close();
      hangUp("listen timed out");
      return;
    }
    state.handlers?.onStatus?.("Transcribing…");
    console.log("[omni] transcribe start");
    const live = await scribe.finish();
    const spoken = (live || (await whisper(pcm))).trim();
    console.log("[omni] transcribe", spoken || "(empty)", live ? "scribe" : "whisper");
    const command = commandAfterWake(spoken);
    if (!command) {
      hangUp("listen empty");
      return;
    }
    console.log("[omni] heard", command);
    state.handlers?.onCommand(command);
    scribe.close();
  } catch (err) {
    console.warn("[omni] listen:", err instanceof Error ? err.message : err);
    state.handlers?.onStatus?.("Mic didn't work. Type instead.");
  } finally {
    state.recording = false;
    model.reset();
    state.lastWake = Date.now();
  }
}

function hangUp(reason: string) {
  console.log("[omni]", reason, "— say jarvis");
  state.handlers?.onStatus?.("Say Jarvis again.");
  state.handlers?.onIdle?.();
}

async function whisper(pcm: Float32Array): Promise<string> {
  const res = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: pcmToWav(pcm),
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
  idle?: boolean;
  onSpeech?: () => void;
  onFrame?: (frame: Float32Array) => void;
}): Promise<Float32Array | null> {
  const tap = await getMicTap();
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
    const finish = (pcm: Float32Array | null) => {
      if (done) return;
      done = true;
      unsub();
      resolve(pcm);
    };
    const unsub = tap.subscribe((frame) => {
      if (done) return;
      if (state.held || isSpeaking() || (opts?.idle && state.recording)) {
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
  });
}
