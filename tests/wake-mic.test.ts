import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { rms, WAKE_SAMPLE_RATE } from "../lib/pcm";
import { WAKE_THRESHOLD } from "../lib/wake-model";
import { createNodeWake } from "./node-wake";

const SECONDS = 6;

test("live mic: say Hey Jarvis", async (t) => {
  if (process.env.OMNI_LIVE_MIC !== "1") {
    t.skip("Run with OMNI_LIVE_MIC=1 so this can use your real microphone");
    return;
  }

  const device = await pickAudioDevice();
  console.log(`\nUsing mic: ${device.label}`);
  console.log(`Say "Hey Jarvis" clearly now — recording ${SECONDS}s\n`);

  const pcm = await recordMic(device.index, SECONDS);
  const level = rms(pcm);
  console.log(`mic rms=${level.toFixed(4)} samples=${pcm.length}`);
  assert.ok(
    level > 0.005,
    `Mic was basically silent (rms=${level.toFixed(4)}). Check input device "${device.label}".`
  );

  const model = await createNodeWake();
  const score = await model.scoreStream(pcm);
  console.log(`wake score=${score.toFixed(3)} threshold=${WAKE_THRESHOLD}`);
  assert.ok(
    score >= WAKE_THRESHOLD,
    `Did not hear Hey Jarvis (score ${score.toFixed(3)}). Say the phrase during the recording.`
  );
});

type Device = { index: number; label: string };

async function pickAudioDevice(): Promise<Device> {
  const forced = process.env.OMNI_MIC_DEVICE;
  const devices = await listAudioDevices();
  if (forced) {
    const index = Number(forced);
    const hit = devices.find((d) => d.index === index);
    return hit ?? { index, label: `device ${index}` };
  }
  const preferred =
    devices.find((d) => /macbook|built-in|internal/i.test(d.label)) ??
    devices.find((d) => !/airpods|iphone/i.test(d.label)) ??
    devices[0];
  if (!preferred) throw new Error("No AVFoundation audio devices found");
  return preferred;
}

function listAudioDevices(): Promise<Device[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    proc.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    proc.on("close", () => {
      const devices: Device[] = [];
      let audio = false;
      for (const line of err.split("\n")) {
        if (/AVFoundation audio devices/i.test(line)) {
          audio = true;
          continue;
        }
        if (/AVFoundation video devices/i.test(line)) {
          audio = false;
          continue;
        }
        const match = audio ? line.match(/\[(\d+)\]\s+(.+)$/) : null;
        if (match) devices.push({ index: Number(match[1]), label: match[2].trim() });
      }
      resolve(devices);
    });
    proc.on("error", reject);
  });
}

function recordMic(index: number, seconds: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        `:${index}`,
        "-t",
        String(seconds),
        "-ac",
        "1",
        "-ar",
        String(WAKE_SAMPLE_RATE),
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (chunk) => chunks.push(chunk as Buffer));
    proc.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exited ${code}`));
        return;
      }
      const raw = Buffer.concat(chunks);
      const pcm = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
      resolve(new Float32Array(pcm));
    });
    proc.on("error", reject);
  });
}
