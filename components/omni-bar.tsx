"use client";

import { useEffect, useRef, useState } from "react";
import { HudGraph } from "@/components/hud-graph";
import { Input } from "@/components/ui/input";
import { VoiceViz } from "@/components/voice-viz";
import { beginFlight, endFlight, inFlight } from "@/lib/flight";
import { captureReply, holdListen, startWakeListener } from "@/lib/listen";
import {
  getSpeaker,
  isSpeaking,
  isVoiceBusy,
  onSpeaking,
  onUtterance,
} from "@/lib/speech";
import type { HudCard, StreamEvent } from "@/lib/types";

type Response = {
  text: string;
  kind: "saved" | "answer" | "filtered" | "error" | "status";
};

const COMPACT = { w: 720, h: 560 };
const HUD = { w: 980, h: 720 };

type ArmedReply = {
  turn: number;
  question: string;
  controller: AbortController;
  started: boolean;
};

export function OmniBar() {
  const [value, setValue] = useState("");
  const [response, setResponse] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [cards, setCards] = useState<HudCard[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const speakerRef = useRef(getSpeaker());
  const heardRef = useRef("");
  const turnRef = useRef(0);
  const busyRef = useRef(false);
  const capturingRef = useRef(false);
  const captureControllerRef = useRef<AbortController | null>(null);
  const runCaptureRef = useRef<(text: string) => Promise<void>>(async () => {});
  const tryReplyRef = useRef<() => void>(() => {});
  const handleEscapeRef = useRef<() => void>(() => {});
  const replyRef = useRef<ArmedReply | null>(null);
  const interruptListenRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const idleRef = useRef(0);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return onUtterance((sentence) => {
      const reply = replyRef.current;
      if (reply) {
        setResponse({ text: reply.question, kind: "status" });
        return;
      }
      heardRef.current = `${heardRef.current} ${sentence}`.trim();
      setResponse({ text: heardRef.current, kind: "answer" });
    });
  }, []);

  useEffect(() => {
    return onSpeaking((on) => {
      setSpeaking(on);
      if (on) {
        holdListen(true);
        return;
      }
      if (capturingRef.current) return;
      if (replyRef.current) {
        window.setTimeout(() => tryReplyRef.current(), 0);
        return;
      }
      if (interruptListenRef.current) return;
      busyRef.current = false;
      endFlight();
      window.setTimeout(() => {
        if (!isVoiceBusy() && !capturingRef.current) holdListen(false);
      }, 600);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleEscapeRef.current();
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
      mountedRef.current = false;
      cancelReply("unmount");
      interruptListenRef.current?.abort("unmount");
      interruptListenRef.current = null;
      captureControllerRef.current?.abort("unmount");
      captureControllerRef.current = null;
      turnRef.current += 1;
      busyRef.current = false;
      endFlight();
      holdListen(false);
    };
  }, []);

  useEffect(() => {
    if (!window.omniDesktop) return;
    return startWakeListener({
      onWake: () => {
        window.clearTimeout(idleRef.current);
        window.omniDesktop?.show();
        window.omniDesktop?.resize?.(COMPACT.w, COMPACT.h);
        setCards([]);
        setActivity([]);
        setResponse({ text: "Listening…", kind: "status" });
      },
      onPartial: (text) => {
        if (busyRef.current) return;
        window.omniDesktop?.show();
        setResponse({ text, kind: "status" });
      },
      onStatus: (text) => {
        setResponse({ text, kind: "status" });
        note(text);
      },
      onIdle: () => {
        window.clearTimeout(idleRef.current);
      },
      shouldIgnore: () =>
        busyRef.current ||
        inFlight() ||
        isVoiceBusy() ||
        !!replyRef.current ||
        !!interruptListenRef.current,
      onCommand: (text) => {
        if (
          busyRef.current ||
          inFlight() ||
          replyRef.current ||
          interruptListenRef.current
        )
          return;
        if (!beginFlight()) return;
        busyRef.current = true;
        window.omniDesktop?.show();
        void runCaptureRef.current(text);
      },
    });
  }, []);

  function note(line: string) {
    const text = line.replace(/^\s*\[omni\]\s*/i, "").trim();
    if (!text) return;
    console.log("[omni]", text);
    setActivity((prev) => [...prev.slice(-5), text]);
  }

  function resetConversation() {
    cancelReply("reset");
    interruptListenRef.current?.abort("conversation reset");
    interruptListenRef.current = null;
    captureControllerRef.current?.abort("conversation reset");
    captureControllerRef.current = null;
    turnRef.current += 1;
    setValue("");
    setResponse(null);
    setActivity([]);
    setCards([]);
    heardRef.current = "";
    speakerRef.current.stop();
    capturingRef.current = false;
    busyRef.current = false;
    setBusy(false);
    endFlight();
    holdListen(false);
    window.omniDesktop?.resize?.(COMPACT.w, COMPACT.h);
    void fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
  }

  async function runCapture(text: string) {
    const spokenIn = text.trim();
    if (!spokenIn) {
      capturingRef.current = false;
      busyRef.current = false;
      endFlight();
      holdListen(false);
      return;
    }
    console.log("[omni] capture", spokenIn);
    note(`capture ${spokenIn}`);
    interruptListenRef.current?.abort("new capture");
    interruptListenRef.current = null;
    cancelReply("new capture");
    captureControllerRef.current?.abort("superseded capture");
    const captureController = new AbortController();
    captureControllerRef.current = captureController;
    if (!inFlight() && !beginFlight()) return;

    turnRef.current += 1;
    const turn = turnRef.current;
    heardRef.current = "";
    holdListen(true);
    capturingRef.current = true;
    busyRef.current = true;
    setBusy(true);
    setCards([]);
    setResponse({ text: "Thinking…", kind: "status" });
    setValue("");
    speakerRef.current.stop();

    try {
      let res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenIn }),
        signal: captureController.signal,
      });
      console.log(
        "[omni] capture response",
        res.status,
        res.headers.get("x-omni-request-id") ?? "no-request-id"
      );
      if (res.status === 409) {
        console.warn("[omni] capture busy; retrying");
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: spokenIn }),
          signal: captureController.signal,
        });
        console.log(
          "[omni] capture retry response",
          res.status,
          res.headers.get("x-omni-request-id") ?? "no-request-id"
        );
      }
      if (res.status === 409) throw new Error("Capture server is still busy.");
      if (!res.ok) {
        throw new Error(
          `Capture server returned ${res.status}: ${await res.text()}`
        );
      }
      if (!res.body) throw new Error("No stream");

      const requestId =
        res.headers.get("x-omni-request-id") ?? "no-request-id";
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let spoken = "";
      const extras: HudCard[] = [];

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          console.log(
            "[omni] capture event",
            requestId,
            streamEventSummary(event)
          );

          if (event.type === "status") {
            note(event.text);
            if (!heardRef.current) {
              setResponse({ text: event.text, kind: "status" });
            }
          } else if (event.type === "log") {
            note(event.text);
          } else if (event.type === "card") {
            extras.push(event.card);
            note(`${event.card.title} ready`);
          } else if (event.type === "token") {
            spoken += event.text;
            speakerRef.current.push(event.text);
            if (/checking/i.test(event.text)) speakerRef.current.flush();
          } else if (event.type === "done") {
            if (event.result.type === "saved") {
              setResponse({ text: "Saved.", kind: "saved" });
              speakerRef.current.stop();
              speakerRef.current.push("Saved.");
              speakerRef.current.flush();
            } else if (event.result.type === "filtered") {
              setResponse({ text: event.result.reason, kind: "filtered" });
              speakerRef.current.stop();
              speakerRef.current.push(event.result.reason);
              speakerRef.current.flush();
            } else if (event.result.type === "clarify") {
              const question = event.result.question.trim();
              setCards([]);
              window.omniDesktop?.resize?.(COMPACT.w, COMPACT.h);
              setResponse({ text: question, kind: "status" });
              note(`clarification ${event.result.reason}`);
              speakerRef.current.stop();
              speakerRef.current.push(question);
              speakerRef.current.flush();
              armReply(turn, question);
            } else {
              const full = event.result.text || spoken;
              const next = event.result.cards?.length
                ? event.result.cards
                : [
                    { id: "answer", kind: "answer" as const, title: "Jarvis", body: full },
                    ...extras,
                  ];
              if (next.length > 0) {
                setCards(next);
                window.omniDesktop?.resize?.(HUD.w, HUD.h);
              }
              speakerRef.current.flush();
              window.setTimeout(() => {
                if (turn !== turnRef.current) return;
                if (!heardRef.current && full) {
                  setResponse({ text: full, kind: "answer" });
                }
              }, 2500);
            }
          } else if (event.type === "error") {
            console.error("[omni] agent error", requestId, event.text);
            cancelReply("stream error");
            setResponse({ text: event.text, kind: "error" });
            speakerRef.current.stop();
          }
        }
      }
      console.log("[omni] capture stream complete", requestId);
    } catch (err) {
      if (isAbortError(err)) {
        console.log("[omni] capture aborted");
        return;
      }
      console.error(
        "[omni] capture client failed",
        err instanceof Error ? err.stack || err.message : err
      );
      cancelReply("capture error");
      setResponse({ text: "Something went wrong.", kind: "error" });
      speakerRef.current.stop();
    } finally {
      if (captureControllerRef.current === captureController) {
        captureControllerRef.current = null;
      }
      if (turn !== turnRef.current) return;
      capturingRef.current = false;
      setBusy(false);
      if (replyRef.current?.turn === turn) {
        tryReplyRef.current();
      } else if (!isVoiceBusy()) {
        endFlight();
        busyRef.current = false;
        window.setTimeout(() => {
          if (!isVoiceBusy()) holdListen(false);
        }, 600);
      }
      inputRef.current?.focus();
    }
  }

  runCaptureRef.current = runCapture;

  function cancelReply(reason: string): boolean {
    const reply = replyRef.current;
    if (!reply) return false;
    replyRef.current = null;
    reply.controller.abort();
    console.log("[omni] reply listen canceled", reason);
    return true;
  }

  function handleEscape() {
    if (
      capturingRef.current ||
      isVoiceBusy() ||
      isSpeaking() ||
      !!replyRef.current
    ) {
      interruptSpeech();
      return;
    }
    resetConversation();
  }

  function interruptSpeech() {
    if (!mountedRef.current) return;
    console.log("[omni] interrupted");
    note("interrupted");
    cancelReply("interrupted");
    captureControllerRef.current?.abort("interrupted");
    captureControllerRef.current = null;
    turnRef.current += 1;
    speakerRef.current.stop();
    capturingRef.current = false;
    busyRef.current = false;
    setBusy(false);
    endFlight();
    holdListen(false);
    window.omniDesktop?.show();
    window.omniDesktop?.resize?.(COMPACT.w, COMPACT.h);
    listenAfterInterrupt();
  }

  function listenAfterInterrupt() {
    interruptListenRef.current?.abort("superseded interrupt");
    const controller = new AbortController();
    interruptListenRef.current = controller;
    setResponse({ text: "Listening…", kind: "status" });
    inputRef.current?.focus();

    void captureReply({
      signal: controller.signal,
      onPartial: (text) => {
        if (!mountedRef.current || interruptListenRef.current !== controller)
          return;
        setResponse({ text, kind: "status" });
      },
      onStatus: (text) => {
        if (!mountedRef.current || interruptListenRef.current !== controller)
          return;
        note(text);
        setResponse({ text, kind: "status" });
      },
    }).then((text) => {
      if (!mountedRef.current || interruptListenRef.current !== controller)
        return;
      interruptListenRef.current = null;
      if (!text) {
        inputRef.current?.focus();
        return;
      }
      if (!beginFlight()) {
        setResponse({
          text: "Heard you, but Jarvis is still busy. Type it instead.",
          kind: "error",
        });
        return;
      }
      busyRef.current = true;
      window.omniDesktop?.show();
      void runCaptureRef.current(text);
    });
  }

  function armReply(turn: number, question: string) {
    if (!mountedRef.current || turn !== turnRef.current) return;
    cancelReply("superseded");
    replyRef.current = {
      turn,
      question,
      controller: new AbortController(),
      started: false,
    };
    tryReplyRef.current();
    window.setTimeout(() => tryReplyRef.current(), 700);
  }

  function tryReply() {
    const reply = replyRef.current;
    if (
      !mountedRef.current ||
      !reply ||
      reply.started ||
      reply.turn !== turnRef.current ||
      capturingRef.current ||
      isVoiceBusy() ||
      isSpeaking()
    ) {
      return;
    }

    reply.started = true;
    busyRef.current = false;
    endFlight();
    holdListen(false);
    setBusy(false);

    void captureReply({
      signal: reply.controller.signal,
      onStatus: (text) => {
        if (!mountedRef.current || replyRef.current !== reply) return;
        note(text);
      },
    }).then((text) => {
      if (!mountedRef.current || replyRef.current !== reply) return;
      replyRef.current = null;
      if (!text) {
        inputRef.current?.focus();
        return;
      }
      if (!beginFlight()) {
        setResponse({
          text: "Reply captured, but Jarvis is still busy. Please type it again.",
          kind: "error",
        });
        return;
      }
      busyRef.current = true;
      window.omniDesktop?.show();
      void runCaptureRef.current(text);
    });
  }

  tryReplyRef.current = tryReply;
  handleEscapeRef.current = handleEscape;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    interruptListenRef.current?.abort("typed submit");
    interruptListenRef.current = null;
    cancelReply("typed submit");
    await runCapture(value);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col items-stretch gap-4 overflow-y-auto">
      <VoiceViz onInterrupt={interruptSpeech} />

      <form onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              handleEscape();
            }
          }}
          placeholder="Hey Jarvis, or type"
          disabled={busy && !speaking}
          aria-label="Omni input — press Enter to submit, Escape to interrupt or clear"
        />
      </form>

      {activity.length > 0 ? (
        <ul className="px-2 font-mono text-[11px] leading-5 text-muted-foreground">
          {activity.slice(-4).map((line, i) => (
            <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div
        className="min-h-[1.5rem] px-2 text-[15px] leading-relaxed text-foreground/70"
        aria-live="polite"
        aria-atomic="true"
      >
        {response && cards.length === 0 ? (
          <p className="whitespace-pre-wrap">{response.text}</p>
        ) : null}
      </div>

      <HudGraph cards={cards} />
    </div>
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function streamEventSummary(event: StreamEvent): string {
  if (event.type === "done") {
    const text =
      event.result.type === "answer"
        ? event.result.text
        : event.result.type === "filtered"
          ? event.result.reason
          : event.result.type === "clarify"
            ? `${event.result.reason} ${event.result.question}`
            : "saved";
    return `done.${event.result.type} ${JSON.stringify(text)}`;
  }
  if (event.type === "card") return `card ${JSON.stringify(event.card.title)}`;
  return `${event.type} ${JSON.stringify(event.text)}`;
}
