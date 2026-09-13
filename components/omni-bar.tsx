"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * The entire capture surface. One field, one line of status underneath.
 * No mode switch, no save/ask buttons — see docs/ARCHITECTURE.md for why.
 *
 * Phase 1 (current): submit clears the field, status line is static copy.
 * Phase 3 will wire this to POST /api/capture.
 * Phase 7 will make the status line reflect a real saved/answered result.
 */
export function OmniBar() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;

    // Placeholder behavior until Phase 3 wires this to the capture endpoint.
    setStatus("Saved.");
    setValue("");
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-2">
      <form onSubmit={handleSubmit}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Say or type anything"
          aria-label="Omni input"
        />
      </form>
      <p className="min-h-[1.25rem] px-1 text-sm text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
