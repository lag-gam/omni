import { isVoiceBusy } from "./speech";

const LOCK = "omni-capture";

let held = false;
let release: (() => void) | null = null;

export function inFlight(): boolean {
  return held || isVoiceBusy();
}

export function beginFlight(): boolean {
  if (held || isVoiceBusy()) return false;
  held = true;
  if (typeof navigator !== "undefined" && navigator.locks) {
    void navigator.locks.request(LOCK, () => {
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
  }
  return true;
}

export function endFlight() {
  held = false;
  release?.();
  release = null;
}
