"use client";

import { useEffect } from "react";

/** Marks the document when running inside the desktop overlay and
 *  dismisses the window on a second Escape (empty input). */
export function DesktopShell() {
  useEffect(() => {
    if (!window.omniDesktop) return;
    document.documentElement.classList.add("omni-desktop");

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label^="Omni input"]'
      );
      if (input && input.value.trim().length > 0) return;
      window.omniDesktop?.hide();
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("omni-desktop");
    };
  }, []);

  return null;
}
