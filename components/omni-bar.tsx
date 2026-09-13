"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { CaptureResult } from "@/lib/types";

/**
 * The entire capture surface. One field, one line of status underneath.
 * No mode switch, no save/ask buttons — see docs/ARCHITECTURE.md for why.
 */
export function OmniBar() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;

    setBusy(true);
    setStatus(null);
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
          setStatus("Saved.");
          break;
        case "filtered":
          setStatus(result.reason);
          break;
        case "answer":
          setStatus(result.text);
          break;
      }
    } catch {
      setStatus("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-2">
      <form onSubmit={handleSubmit}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Say or type anything"
          disabled={busy}
          aria-label="Omni input"
        />
      </form>
      <p className="min-h-[1.25rem] px-1 text-sm text-muted-foreground">
        {busy ? "Thinking\u2026" : status}
      </p>
    </div>
  );
}
