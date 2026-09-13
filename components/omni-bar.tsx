"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { CaptureResult } from "@/lib/types";

type Response = {
  text: string;
  kind: "saved" | "answer-memory" | "answer-general" | "filtered" | "error";
};

/**
 * The entire capture surface. One field, one unified response area.
 * No mode switch, no save/ask buttons — see docs/ARCHITECTURE.md for why.
 *
 * Every result — save confirmation, memory-grounded answer, general-knowledge
 * answer, filter rejection — renders in the same spot with the same styling.
 * The only distinction is a subtle "(from your notes)" or "(general knowledge)"
 * tag on answers, communicated in words, not colour.
 */
export function OmniBar() {
  const [value, setValue] = useState("");
  const [response, setResponse] = useState<Response | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;

    setBusy(true);
    setResponse(null);
    setValue("");

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result: CaptureResult = await res.json();

      switch (result.type) {
        case "saved":
          setResponse({ text: "Saved.", kind: "saved" });
          break;
        case "filtered":
          setResponse({ text: result.reason, kind: "filtered" });
          break;
        case "answer":
          setResponse({
            text: result.text,
            kind: result.source === "memory" ? "answer-memory" : "answer-general",
          });
          break;
      }
    } catch {
      setResponse({ text: "Something went wrong.", kind: "error" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const sourceTag =
    response?.kind === "answer-memory"
      ? "(from your notes)"
      : response?.kind === "answer-general"
        ? "(general knowledge)"
        : null;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <form onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Say or type anything"
          disabled={busy}
          aria-label="Omni input"
        />
      </form>

      <div
        className="min-h-[1.5rem] px-1 text-sm text-foreground/80"
        aria-live="polite"
        aria-atomic="true"
      >
        {busy ? (
          <span className="text-muted-foreground">Thinking\u2026</span>
        ) : response ? (
          <div className="flex flex-col gap-1">
            <p className="whitespace-pre-wrap leading-relaxed">
              {response.text}
            </p>
            {sourceTag && (
              <p className="text-xs text-muted-foreground">{sourceTag}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
