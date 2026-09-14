import { WAKE_SAMPLE_RATE } from "./pcm";

export type ScribeHandlers = {
  onPartial?: (text: string) => void;
};

type ScribeSession = {
  connect: () => void;
  send: (frame: Float32Array) => void;
  finish: () => Promise<string>;
  close: () => void;
};

let scribeUp = true;

export function createScribeSession(handlers: ScribeHandlers = {}): ScribeSession {
  let socket: WebSocket | null = null;
  let opened = false;
  let closed = false;
  let pending: Float32Array[] = [];
  let partial = "";
  let committed = "";
  let waiters: Array<(text: string) => void> = [];
  let connecting: Promise<void> | null = null;

  function fail() {
    scribeUp = false;
    settle("");
    close();
  }

  function settle(text: string) {
    const next = waiters;
    waiters = [];
    for (const fn of next) fn(text);
  }

  function transcript() {
    return mergeTranscript(committed, partial);
  }

  function flush(commit: boolean) {
    if (!opened || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (pending.length === 0 && !commit) return;
    let total = 0;
    for (const frame of pending) total += frame.length;
    const joined = new Float32Array(Math.max(total, commit && total === 0 ? 320 : 0));
    let offset = 0;
    for (const frame of pending) {
      joined.set(frame, offset);
      offset += frame.length;
    }
    pending = [];
    socket.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: int16Base64(joined.length ? joined : new Float32Array(320)),
        commit,
        sample_rate: WAKE_SAMPLE_RATE,
      })
    );
  }

  async function open() {
    if (!scribeUp || closed || socket || connecting) return;
    connecting = connect();
    await connecting;
  }

  async function connect() {
    if (!scribeUp || closed) return;
    try {
      const res = await fetch("/api/scribe/token", { method: "POST" });
      if (res.status === 402 || res.status === 429) {
        fail();
        return;
      }
      if (!res.ok) {
        scribeUp = res.status !== 503;
        close();
        return;
      }
      const data = (await res.json()) as { token?: string };
      if (!data.token || closed) return;
      const params = new URLSearchParams({
        model_id: "scribe_v2_realtime",
        token: data.token,
        audio_format: "pcm_16000",
        language_code: "en",
        commit_strategy: "manual",
        filter_background_audio: "true",
      });
      params.append("keyterms", "Jarvis");
      params.append("keyterms", "Omni");
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`
      );
      socket = ws;
      ws.onmessage = (event) => {
        const msg = parseMessage(event.data);
        if (!msg) return;
        if (msg.message_type === "partial_transcript") {
          partial = msg.text ?? "";
          if (partial) handlers.onPartial?.(transcript());
        } else if (msg.message_type === "committed_transcript") {
          committed = mergeTranscript(committed, msg.text ?? "");
          partial = "";
          if (committed) handlers.onPartial?.(committed);
        } else if (
          /quota|auth|error/i.test(msg.message_type) ||
          msg.error
        ) {
          console.warn("[omni] scribe", msg.message_type, msg.error ?? "");
          if (/quota/i.test(msg.message_type)) fail();
        }
      };
      ws.onerror = () => {
        console.warn("[omni] scribe socket error");
      };
      ws.onclose = () => {
        opened = false;
        settle(transcript());
      };
      await onceOpen(ws);
      if (closed || socket !== ws) {
        ws.close();
        return;
      }
      opened = true;
      console.log("[omni] scribe live");
      flush(false);
    } catch (err) {
      console.warn("[omni] scribe", err instanceof Error ? err.message : err);
      close();
    }
  }

  return {
    connect() {
      if (!scribeUp || closed) return;
      void open();
    },
    send(frame) {
      if (!scribeUp || closed) return;
      pending.push(new Float32Array(frame));
      if (pending.length >= 2) flush(false);
    },
    async finish() {
      if (closed) return "";
      if (connecting) await connecting;
      if (closed || !opened || !socket) {
        close();
        return "";
      }
      flush(true);
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          const text = transcript();
          close();
          resolve(text);
        }, 1200);
        waiters.push((text) => {
          window.clearTimeout(timer);
          resolve(text);
        });
      });
    },
    close() {
      closed = true;
      pending = [];
      opened = false;
      try {
        socket?.close();
      } catch {
        // already closed
      }
      socket = null;
      settle(transcript());
    },
  };
}

function mergeTranscript(baseRaw: string, nextRaw: string): string {
  const base = cleanTranscript(baseRaw);
  const next = cleanTranscript(nextRaw);
  if (!base) return next;
  if (!next) return base;

  const baseKey = transcriptKey(base);
  const nextKey = transcriptKey(next);
  if (baseKey === nextKey || baseKey.startsWith(`${nextKey} `)) return base;
  if (nextKey.startsWith(`${baseKey} `)) return next;
  return `${base} ${next}`.replace(/\s+/g, " ").trim();
}

function cleanTranscript(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?-]+/, "")
    .trim();
}

function transcriptKey(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function onceOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErr);
      resolve();
    };
    const onOpen = () => done();
    const onErr = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErr);
      reject(new Error("scribe websocket failed"));
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onErr);
  });
}

function parseMessage(raw: unknown): {
  message_type: string;
  text?: string;
  error?: string;
} | null {
  try {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer);
    return JSON.parse(text) as { message_type: string; text?: string; error?: string };
  } catch {
    return null;
  }
}

function int16Base64(frame: Float32Array): string {
  const bytes = new Uint8Array(frame.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < frame.length; i++) {
    const sample = Math.max(-1, Math.min(1, frame[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
