"use client";

import { useEffect } from "react";

type NavigationEventLike = Event & {
  navigationType?: string;
  destination?: { url?: string };
};

function errorText(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  return typeof value === "string"
    ? value
    : (JSON.stringify(value) ?? String(value));
}

/** Marks the document when running inside the desktop overlay and
 *  dismisses the window on a second Escape (empty input). */
export function DesktopShell() {
  useEffect(() => {
    if (!window.omniDesktop) return;
    document.documentElement.classList.add("omni-desktop");
    const navigation = (
      window as typeof window & { navigation?: EventTarget }
    ).navigation;
    const nativeClose = window.close;

    function blockWindowClose() {
      console.warn(
        "[omni] blocked renderer window.close",
        new Error("window.close requested").stack
      );
    }

    function blockReload(event: Event) {
      const next = event as NavigationEventLike;
      const destination = next.destination?.url;
      const target = destination ? new URL(destination) : null;
      const samePage =
        next.navigationType === "reload" ||
        (target?.origin === window.location.origin &&
          target.pathname === window.location.pathname &&
          target.search === window.location.search);
      if (!samePage) return;
      event.preventDefault();
      console.warn(
        "[omni] blocked unexpected renderer navigation",
        next.navigationType ?? "unknown",
        destination ?? window.location.href
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label^="Omni input"]'
      );
      if (input && input.value.trim().length > 0) return;
      window.omniDesktop?.hide();
    }

    function onError(event: ErrorEvent) {
      console.error(
        "[omni] renderer error",
        event.error ? errorText(event.error) : event.message
      );
    }

    function onUnhandled(event: PromiseRejectionEvent) {
      console.error("[omni] renderer unhandled rejection", errorText(event.reason));
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      console.warn(
        "[omni] renderer beforeunload blocked",
        window.location.href,
        new Error("unload requested").stack
      );
      event.preventDefault();
      event.returnValue = "Omni is still running.";
    }

    function onPageHide(event: PageTransitionEvent) {
      console.warn("[omni] renderer pagehide", `persisted=${event.persisted}`);
    }

    window.close = blockWindowClose;
    navigation?.addEventListener("navigate", blockReload);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onKey);
    return () => {
      if (window.close === blockWindowClose) window.close = nativeClose;
      navigation?.removeEventListener("navigate", blockReload);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("omni-desktop");
    };
  }, []);

  return null;
}
