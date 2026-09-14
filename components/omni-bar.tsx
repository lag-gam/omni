"use client";

import { useEffect, useRef, useState } from "react";
import { HudGraph } from "@/components/hud-graph";
import { Input } from "@/components/ui/input";
import { VoiceViz } from "@/components/voice-viz";
import { beginFlight, endFlight, inFlight } from "@/lib/flight";
import { holdListen, startWakeListener } from "@/lib/listen";
import { getSpeaker, isVoiceBusy, onSpeaking, onUtterance } from "@/lib/speech";
import type { HudCard, StreamEvent } from "@/lib/types";

type Response = {
  text: string;
  kind: "saved" | "answer" | "filtered" | "error" | "status";
};

const COMPACT = { w: 720, h: 560 };
const HUD = { w: 980, h: 720 };

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
  const runCaptureRef = useRef<(text: string) => Promise<void>>(async () => {});
  const idleRef = useRef(0);

  useEffect(() => {
    return onUtterance((sentence) => {
      heardRef.current = `${heardRef.current} ${sentence}`.trim();
      setResponse({ text: heardRef.current, kind: "answer" });
    });
  }, []);

  useEffect(() => {
    return onSpeaking((on) => {
      if (on) {
        holdListen(true);
        return;
      }
      if (capturingRef.current) return;
      busyRef.current = false;
      endFlight();
      window.setTimeout(() => {
        if (!isVoiceBusy() && !capturingRef.current) holdListen(false);
      }, 600);
    });
  }, []);

  useEffect(() => {
    if (!window.omniDesktop) return;
    return startWakeListener({
      shouldIgnore: () => busyRef.current || inFlight() || isVoiceBusy(),
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
      onCommand: (text) => {
        if (busyRef.current || inFlight()) return;
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
    setValue("");
    setResponse(null);
    setActivity([]);
    setCards([]);
    heardRef.current = "";
    speakerRef.current.stop();
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
    if (!inFlight() && !beginFlight()) return;

    turnRef.current += 1;
    const turn = turnRef.current;
    heardRef.current = "";
    speakerRef.current.stop();
    holdListen(true);
    capturingRef.current = true;
    busyRef.current = true;
    setBusy(true);
    setCards([]);
    setResponse({ text: "Thinking…", kind: "status" });
    setValue("");

    try {
      let res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenIn }),
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
            setResponse({ text: event.text, kind: "error" });
            speakerRef.current.stop();
          }
        }
      }
      console.log("[omni] capture stream complete", requestId);
    } catch (err) {
      console.error(
        "[omni] capture client failed",
        err instanceof Error ? err.stack || err.message : err
      );
      setResponse({ text: "Something went wrong.", kind: "error" });
      speakerRef.current.stop();
    } finally {
      capturingRef.current = false;
      setBusy(false);
      if (!isVoiceBusy()) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await runCapture(value);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col items-stretch gap-4 overflow-y-auto">
      <VoiceViz />

      <form onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") resetConversation();
          }}
          placeholder="Hey Jarvis, or type"
          disabled={busy}
          aria-label="Omni input — press Enter to submit, Escape to clear"
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

function streamEventSummary(event: StreamEvent): string {
  if (event.type === "done") {
    const text =
      event.result.type === "answer"
        ? event.result.text
        : event.result.type === "filtered"
          ? event.result.reason
          : "saved";
    return `done.${event.result.type} ${JSON.stringify(text)}`;
  }
  if (event.type === "card") return `card ${JSON.stringify(event.card.title)}`;
  return `${event.type} ${JSON.stringify(event.text)}`;
}
