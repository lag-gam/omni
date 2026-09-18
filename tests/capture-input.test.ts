import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideCaptureInput,
  isClarificationCancel,
} from "../lib/capture-input";

test("pending clarification keeps one-word replies", () => {
  for (const reply of ["Alex", "Tuesday", "yes", "no"]) {
    assert.deepEqual(decideCaptureInput(reply, true), { type: "resume" });
  }

  assert.notDeepEqual(decideCaptureInput("yes", false), { type: "proceed" });
  assert.notDeepEqual(decideCaptureInput("Alex", false), { type: "proceed" });
});

test("explicit cancellation replies tolerate transcript punctuation", () => {
  for (const reply of [
    "cancel",
    "Cancel that.",
    "cancel, please",
    "Never mind.",
    "Never mind, please.",
    "nevermind",
    "NVM!",
    "Please cancel that.",
  ]) {
    assert.equal(isClarificationCancel(reply), true, reply);
    assert.deepEqual(decideCaptureInput(reply, true), { type: "cancel" });
  }
});

test("only standalone cancellation phrases cancel a pending request", () => {
  for (const reply of [
    "don't cancel that email",
    "never mind the date, use Tuesday",
    "Alex said cancel",
  ]) {
    assert.equal(isClarificationCancel(reply), false, reply);
    assert.deepEqual(decideCaptureInput(reply, true), { type: "resume" });
  }
});
