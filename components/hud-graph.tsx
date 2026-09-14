"use client";

import { useEffect, useRef, useState } from "react";
import type { HudCard } from "@/lib/types";

type Props = {
  cards: HudCard[];
};

export function HudGraph({ cards }: Props) {
  const [index, setIndex] = useState(0);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const node = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);

  useEffect(() => {
    setIndex(0);
  }, [cards]);

  if (cards.length === 0) return null;
  const current = cards[Math.max(0, Math.min(index, cards.length - 1))]!;

  function go(next: number) {
    if (cards.length === 0) return;
    const wrapped = ((next % cards.length) + cards.length) % cards.length;
    setIndex(wrapped);
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, from: index };
    try {
      node.current?.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events may not support capture
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = drag.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < 56) return;
    const next = start.from + (dx < 0 ? 1 : -1);
    drag.current = { x: e.clientX, from: next };
    go(next);
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaX) < 28 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (Date.now() - lastWheel.current < 180) return;
    lastWheel.current = Date.now();
    go(index + (e.deltaX > 0 ? 1 : -1));
  }

  const w = 640;
  const h = 168;
  const cx = w / 2;
  const cy = h / 2 + 8;

  return (
    <div
      ref={node}
      className="select-none touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      role="region"
      aria-label="Jarvis notes. Swipe to browse."
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" aria-hidden="true">
        {cards.map((card, i) => {
          const t = (i - index) * ((Math.PI * 1.15) / Math.max(cards.length, 2));
          const x = cx + Math.sin(t) * 210;
          const y = cy - Math.cos(t) * 46;
          const active = i === index;
          return (
            <g key={card.id} onClick={() => setIndex(i)} className="cursor-pointer">
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeOpacity={active ? 0.35 : 0.12}
                strokeWidth={active ? 1.25 : 0.75}
              />
              <circle
                cx={x}
                cy={y}
                r={active ? 9 : 5.5}
                fill={active ? "hsl(0 0% 9%)" : "hsl(0 0% 100%)"}
                stroke="currentColor"
                strokeWidth={1}
                strokeOpacity={active ? 1 : 0.35}
              />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={22} fill="hsl(0 0% 100%)" stroke="currentColor" strokeWidth={1.25} />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize="9"
          fill="currentColor"
          opacity={0.7}
        >
          {current.kind}
        </text>
      </svg>
      <div className="min-h-[4.5rem] px-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {current.title}
          <span className="ml-2 normal-case tracking-normal opacity-70">
            {index + 1}/{cards.length} · swipe
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/80">
          {current.body}
        </p>
      </div>
    </div>
  );
}
