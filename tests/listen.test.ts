import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canStartSpeechCapture,
  captureReply,
  holdListen,
  normalizeReplyTranscript,
  REPLY_SPEECH_START_MS,
  type SpeechCaptureGate,
} from "../lib/listen";

const ready: SpeechCaptureGate = {
  recording: false,
  held: false,
  speechHeld: false,
  speaking: false,
  voiceBusy: false,
};

test("wake-free replies normalize whitespace without stripping Jarvis", () => {
  assert.equal(
    normalizeReplyTranscript("  Jarvis,   yes, use Alex.  "),
    "Jarvis, yes, use Alex."
  );
  assert.equal(normalizeReplyTranscript(" \n\t "), undefined);
  assert.equal(REPLY_SPEECH_START_MS, 8000);
});

test("reply capture starts only when every voice gate is clear", () => {
  assert.equal(canStartSpeechCapture(ready), true);

  for (const key of Object.keys(ready) as Array<keyof SpeechCaptureGate>) {
    assert.equal(
      canStartSpeechCapture({ ...ready, [key]: true }),
      false,
      `${key} should block reply capture`
    );
  }
});

test("held and pre-cancelled reply seams avoid opening the microphone", async () => {
  holdListen(true);
  try {
    assert.equal(await captureReply(), null);
  } finally {
    holdListen(false);
  }

  const controller = new AbortController();
  controller.abort();
  assert.equal(await captureReply({ signal: controller.signal }), null);
});
