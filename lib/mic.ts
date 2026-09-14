import { rms, resample, WAKE_FRAME, WAKE_SAMPLE_RATE } from "./pcm";

export type FrameHandler = (pcm: Float32Array) => void;

type MicTap = {
  sampleRate: number;
  subscribe: (fn: FrameHandler) => () => void;
};

const g = globalThis as typeof globalThis & { __omniMic?: Promise<MicTap> };

export async function getMicTap(): Promise<MicTap> {
  g.__omniMic ??= openMic();
  return g.__omniMic;
}

async function openMic(): Promise<MicTap> {
  const stream = await openInput();

  const ctx = new AudioContext({ sampleRate: WAKE_SAMPLE_RATE });
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);

  const keepAlive = window.setInterval(() => {
    if (ctx.state === "suspended") void ctx.resume();
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (ctx.state === "suspended") void ctx.resume();
  });

  const listeners = new Set<FrameHandler>();
  let leftover = new Float32Array(0);
  let lastRmsLog = 0;

  proc.onaudioprocess = (event) => {
    const input = resample(
      event.inputBuffer.getChannelData(0),
      ctx.sampleRate,
      WAKE_SAMPLE_RATE
    );
    const joined = new Float32Array(leftover.length + input.length);
    joined.set(leftover);
    joined.set(input, leftover.length);
    let offset = 0;
    while (offset + WAKE_FRAME <= joined.length) {
      const frame = new Float32Array(joined.subarray(offset, offset + WAKE_FRAME));
      const level = rms(frame);
      if (Date.now() - lastRmsLog > 2000) {
        lastRmsLog = Date.now();
        console.log("[omni] mic", ctx.sampleRate, "rms", level.toFixed(4));
      }
      for (const fn of listeners) fn(frame);
      offset += WAKE_FRAME;
    }
    leftover = joined.subarray(offset);
  };

  const track = stream.getAudioTracks()[0];
  console.log(
    "[omni] mic tap",
    track?.label ?? "unknown",
    ctx.sampleRate,
    "->",
    WAKE_SAMPLE_RATE,
    track?.getSettings()
  );
  void keepAlive;

  return {
    sampleRate: WAKE_SAMPLE_RATE,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

async function openInput(): Promise<MediaStream> {
  const first = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const deviceId = await preferredMicId();
  const current = first.getAudioTracks()[0]?.getSettings().deviceId;
  if (!deviceId || deviceId === current) return first;
  first.getTracks().forEach((track) => track.stop());
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

async function preferredMicId(): Promise<string | undefined> {
  const mics = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === "audioinput"
  );
  console.log("[omni] mics", mics.map((d) => d.label || "(unnamed)"));
  const hit =
    mics.find((d) => /macbook|built-in|internal microphone/i.test(d.label)) ??
    mics.find((d) => d.label && !/airpods|iphone/i.test(d.label));
  return hit?.deviceId;
}
