"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { VoiceViz } from "@/components/voice-viz";
import { createSpeaker } from "@/lib/speech";
import type { StreamEvent } from "@/lib/types";

type Response = {
  text: string;
  kind: "saved" | "answer" | "filtered" | "error" | "status";
};

export function OmniBar() {
  const [value, setValue] = useState("");
  const [response, setResponse] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const speakerRef = useRef(createSpeaker());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;

    speakerRef.current.stop();
    setBusy(true);
    setResponse({ text: "Listening…", kind: "status" });
    setValue("");

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let spoken = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;

          if (event.type === "status") {
            setResponse({ text: event.text, kind: "status" });
          } else if (event.type === "token") {
            spoken += event.text;
            setResponse({ text: spoken, kind: "answer" });
            speakerRef.current.push(event.text);
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
              setResponse({ text: event.result.text || spoken, kind: "answer" });
              speakerRef.current.flush();
            }
          } else if (event.type === "error") {
            setResponse({ text: event.text, kind: "error" });
            speakerRef.current.stop();
          }
        }
      }
    } catch {
      setResponse({ text: "Something went wrong.", kind: "error" });
      speakerRef.current.stop();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex w-full max-w-lg flex-col items-stretch gap-5">
      <VoiceViz />

      <form onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue("");
              setResponse(null);
              speakerRef.current.stop();
            }
          }}
          placeholder="Say anything"
          disabled={busy}
          aria-label="Omni input — press Enter to submit, Escape to clear"
        />
      </form>

      <div
        className="min-h-[1.5rem] px-2 text-[15px] leading-relaxed text-foreground/70"
        aria-live="polite"
        aria-atomic="true"
      >
        {response ? (
          <p className="whitespace-pre-wrap">{response.text}</p>
        ) : null}
      </div>
    </div>
  );
}
