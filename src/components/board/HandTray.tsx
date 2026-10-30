"use client";

import { useSelf, useStorage } from "@liveblocks/react/suspense";
import { useState } from "react";
import { CardImage } from "./CardArt";
import type { Card } from "./types";

const CARD_HEIGHT = 112;
// Past this many cards they overlap so the hand stays a reasonable width.
const SPREAD_LIMIT = 6;

export function HandTray({
  trayRef,
  highlighted,
  draggingIndex,
  onCardPointerDown,
}: {
  trayRef: React.RefObject<HTMLDivElement | null>;
  highlighted: boolean;
  draggingIndex: number | null;
  onCardPointerDown: (e: React.PointerEvent, index: number, card: Card) => void;
}) {
  const myId = useSelf((me) => me.id);
  const hand = useStorage((root) => root.hands?.[myId]) ?? [];
  const [collapsed, setCollapsed] = useState(false);

  const ring = highlighted ? "ring-2 ring-brand bg-indigo-50" : "bg-white/95";

  if (collapsed) {
    return (
      <div ref={trayRef} className={`absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl border border-zinc-200 shadow-md ${ring}`}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700"
        >
          Your hand · {hand.length}
          <span aria-hidden>▲</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={trayRef}
      className={`absolute bottom-3 left-1/2 flex max-w-[calc(100%-22rem)] -translate-x-1/2 flex-col rounded-xl border border-zinc-200 px-3 pb-3 pt-1.5 shadow-md backdrop-blur ${ring}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-4 text-xs font-medium text-zinc-500">
        <span>Your hand · {hand.length}</span>
        <button type="button" onClick={() => setCollapsed(true)} className="rounded px-1.5 hover:bg-zinc-100" title="Hide hand">
          ▼
        </button>
      </div>

      {hand.length === 0 ? (
        <p className="grid h-16 min-w-64 place-items-center rounded-lg border border-dashed border-zinc-300 px-4 text-center text-xs text-zinc-500">
          Drag cards here or draw from a pile
        </p>
      ) : (
        <div className="flex items-end overflow-x-auto overflow-y-visible px-1 pt-3">
          {hand.map((card, i) => {
            const width = Math.round((CARD_HEIGHT * card.width) / card.height);
            const overlap = hand.length > SPREAD_LIMIT ? -Math.round(width * 0.45) : 6;
            return (
              <div
                key={i}
                onPointerDown={(e) => onCardPointerDown(e, i, card)}
                title="Drag onto the board to play · Shift + drag to play face down"
                className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-md bg-white shadow ring-1 ring-black/10 transition hover:z-10 hover:-translate-y-3"
                style={{ marginLeft: i === 0 ? 0 : overlap, opacity: draggingIndex === i ? 0.3 : 1 }}
              >
                <CardImage card={card} width={width} height={CARD_HEIGHT} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
