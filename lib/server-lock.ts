type Gate = { busy: boolean; since: number };

const STALE_MS = 20_000;

function gate(key: "__omniCaptureBusy" | "__omniSpeakBusy"): Gate {
  const g = globalThis as typeof globalThis & Record<string, Gate | undefined>;
  return (g[key] ??= { busy: false, since: 0 });
}

export function tryBegin(key: "__omniCaptureBusy" | "__omniSpeakBusy"): boolean {
  const slot = gate(key);
  if (slot.busy && Date.now() - slot.since < STALE_MS) return false;
  slot.busy = true;
  slot.since = Date.now();
  return true;
}

export function end(key: "__omniCaptureBusy" | "__omniSpeakBusy") {
  const slot = gate(key);
  slot.busy = false;
  slot.since = 0;
}
