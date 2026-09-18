import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEAK_RATE } from "../lib/speech";

test("spoken replies play faster than realtime", () => {
  assert.ok(SPEAK_RATE > 1);
  assert.ok(SPEAK_RATE <= 1.35);
});
