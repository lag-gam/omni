import assert from "node:assert/strict";
import { test } from "node:test";
import { rms } from "../lib/pcm";
import { commandAfterWake, takeCommand, wokeJarvis } from "../lib/wake";
import { WAKE_THRESHOLD } from "../lib/wake-model";
import { createNodeWake } from "./node-wake";

test("takeCommand strips jarvis and keeps the request", () => {
  const out = takeCommand("jarvis what is on my calendar", false);
  assert.equal(out.woke, true);
  assert.equal(out.command, "what is on my calendar");
  const hey = takeCommand("hey jarvis check mail", false);
  assert.equal(hey.command, "check mail");
});

test("takeCommand arms when the wake word is alone", () => {
  const woke = takeCommand("Jarvis", false);
  assert.equal(woke.woke, true);
  assert.equal(woke.armed, true);
  const next = takeCommand("email mom", true, woke.armedUntil);
  assert.equal(next.command, "email mom");
});

test("commandAfterWake drops a bare jarvis", () => {
  assert.equal(commandAfterWake("Jarvis"), undefined);
  assert.equal(commandAfterWake("hey jarvis"), undefined);
  assert.equal(commandAfterWake("jarvis jarvis"), undefined);
  assert.equal(commandAfterWake("jarvis email mom"), "email mom");
  assert.equal(commandAfterWake("what's on my calendar"), "what's on my calendar");
  assert.equal(wokeJarvis("hey Jarvis, check my email"), true);
  assert.equal(wokeJarvis("check my email"), false);
  assert.equal(
    commandAfterWake(". Did I order from Overtime Creations the other day? J-"),
    "Did I order from Overtime Creations the other day?"
  );
});

test("silence stays under the wake threshold", async () => {
  const model = await createNodeWake();
  const quiet = new Float32Array(16000 * 2);
  const score = await model.scoreStream(quiet);
  assert.ok(score < WAKE_THRESHOLD, `silence scored ${score}`);
});

test("loud noise is not hey jarvis", async () => {
  const model = await createNodeWake();
  const noise = new Float32Array(16000 * 2);
  for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.3;
  const score = await model.scoreStream(noise);
  assert.ok(rms(noise) > 0.05);
  assert.ok(score < WAKE_THRESHOLD, `noise scored ${score}`);
});
