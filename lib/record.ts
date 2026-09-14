const SAMPLE_RATE = 16000;

export async function recordCommand(opts?: {
  maxMs?: number;
  silenceMs?: number;
  onLevel?: (rms: number) => void;
}): Promise<ArrayBuffer> {
  const maxMs = opts?.maxMs ?? 7000;
  const silenceMs = opts?.silenceMs ?? 1100;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
    },
  });

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  if (ctx.state === "suspended") await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let peaked = false;
  let silentFor = 0;
  let last = ctx.currentTime;

  proc.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i]! * input[i]!;
    const rms = Math.sqrt(sum / input.length);
    opts?.onLevel?.(rms);
    const now = ctx.currentTime;
    const dt = (now - last) * 1000;
    last = now;
    if (rms > 0.02) {
      peaked = true;
      silentFor = 0;
    } else if (peaked) {
      silentFor += dt;
    }
  };

  source.connect(proc);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  proc.connect(mute);
  mute.connect(ctx.destination);

  const started = Date.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (Date.now() - started >= maxMs) {
        resolve();
        return;
      }
      if (peaked && silentFor >= silenceMs) {
        resolve();
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });

  proc.disconnect();
  source.disconnect();
  for (const track of stream.getTracks()) track.stop();
  await ctx.close();

  return encodeWav(merge(chunks), SAMPLE_RATE);
}

export function pcmToWav(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  return encodeWav(samples, sampleRate);
}

function merge(chunks: Float32Array[]): Float32Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeStr(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
