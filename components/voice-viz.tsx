"use client";

import { useEffect, useRef } from "react";
import { getAnalyser, onSpeaking } from "@/lib/speech";

export function VoiceViz() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    let speaking = false;
    let frame = 0;
    let raf = 0;
    const bins = new Uint8Array(128);

    const stopListen = onSpeaking((on) => {
      speaking = on;
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
      if (analyser && speaking && !reduced) {
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
        const raw = speaking && !reduced ? bins[i] / 255 : 0;
        const idle = reduced ? 0 : Math.sin(frame / 28 + i * 0.18) * 1.4;
        const amp = speaking ? raw * (h * 0.42) : idle;
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

  return <canvas ref={canvasRef} className="h-12 w-full" aria-hidden="true" />;
}
