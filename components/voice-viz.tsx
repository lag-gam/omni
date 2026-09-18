"use client";

import { useEffect, useRef, useState } from "react";
import { getAnalyser, onSpeaking } from "@/lib/speech";

export function VoiceViz({ onInterrupt }: { onInterrupt?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const surface = canvasRef.current;
    if (!surface) return;
    const g = surface.getContext("2d");
    if (!g) return;

    const node = surface;
    const brush = g;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let live = false;
    let frame = 0;
    let raf = 0;
    const bins = new Uint8Array(128);

    const stopListen = onSpeaking((on) => {
      live = on;
      setSpeaking(on);
    });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = node.clientWidth;
      const h = node.clientHeight;
      node.width = Math.floor(w * dpr);
      node.height = Math.floor(h * dpr);
      brush.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      brush.clearRect(0, 0, w, h);

      const analyser = getAnalyser();
      if (analyser && live && !reduced) {
        analyser.getByteFrequencyData(bins);
      } else {
        bins.fill(0);
      }

      const mid = h / 2;
      brush.beginPath();
      brush.lineWidth = 1.25;
      brush.strokeStyle = "hsl(0 0% 9%)";
      brush.lineJoin = "round";
      brush.lineCap = "round";

      const usable = 72;
      for (let i = 0; i < usable; i++) {
        const t = i / (usable - 1);
        const x = t * w;
        const raw = live && !reduced ? bins[i] / 255 : 0;
        const idle = reduced ? 0 : Math.sin(frame / 28 + i * 0.18) * 1.4;
        const amp = live ? raw * (h * 0.42) : idle;
        const y = mid - amp;
        if (i === 0) brush.moveTo(x, y);
        else brush.lineTo(x, y);
      }

      brush.stroke();
      frame += 1;
      raf = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      stopListen();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const canInterrupt = Boolean(onInterrupt) && speaking;

  return (
    <button
      type="button"
      onClick={() => {
        if (!canInterrupt) return;
        onInterrupt?.();
      }}
      className={`h-12 w-full rounded-md bg-transparent p-0 ${
        canInterrupt ? "cursor-pointer" : "cursor-default"
      }`}
      aria-label={
        canInterrupt ? "Interrupt Jarvis and speak" : "Jarvis voice"
      }
      title={canInterrupt ? "Tap to interrupt" : undefined}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none h-12 w-full"
        aria-hidden="true"
      />
    </button>
  );
}
