"use client";

import { useSelf, useStorage } from "@liveblocks/react/suspense";
import { useState } from "react";
import { CardImage } from "./CardArt";
import type { Card } from "./types";

const CARD_HEIGHT = 112;
// Past this many cards they overlap so the hand stays a reasonable width.
const SPREAD_LIMIT = 6;
// The hover preview is this tall, or half the window on short screens.
const PREVIEW_HEIGHT = 360;
const PREVIEW_MARGIN = 12;

export function HandTray({
  trayRef,
  highlighted,
  draggingIndex,
  onCardPointerDown,
  flipped,
  onFlippedChange,
}: {
  trayRef: React.RefObject<HTMLDivElement | null>;
  highlighted: boolean;
  draggingIndex: number | null;
  onCardPointerDown: (e: React.PointerEvent, index: number, card: Card) => void;
  flipped: boolean;
  onFlippedChange: (flipped: boolean) => void;
}) {
  const myId = useSelf((me) => me.id);
  const hand = useStorage((root) => root.hands?.[myId]) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  // The hovered card and where its preview sits, in pixels from the tray's left edge.
  const [preview, setPreview] = useState<{ index: number; left: number; height: number } | null>(null);

  const ring = highlighted ? "ring-2 ring-brand bg-indigo-50" : "bg-white/95";
  const seatSwitch = <SeatSwitch flipped={flipped} onChange={onFlippedChange} />;

  if (collapsed) {
    return (
      <div
        ref={trayRef}
        className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-zinc-200 pl-1.5 shadow-md ${ring}`}
      >
        {seatSwitch}
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-700"
        >
          Your hand · {hand.length}
          <span aria-hidden>▲</span>
        </button>
      </div>
    );
  }

  function showPreview(e: React.PointerEvent<HTMLElement>, index: number, card: Card) {
    const tray = trayRef.current;
    if (!tray || e.pointerType === "touch") return;
    const cardRect = e.currentTarget.getBoundingClientRect();
    const trayRect = tray.getBoundingClientRect();
    const height = Math.min(PREVIEW_HEIGHT, Math.round(window.innerHeight * 0.5));
    const half = (height * card.width) / card.height / 2;
    // Centered over the card, but kept inside the window.
    const center = Math.min(
      Math.max(cardRect.left + cardRect.width / 2, half + PREVIEW_MARGIN),
      window.innerWidth - half - PREVIEW_MARGIN,
    );
    setPreview({ index, left: center - trayRect.left, height });
  }

  const previewCard = preview && draggingIndex === null ? hand[preview.index] : undefined;

  return (
    <div
      ref={trayRef}
      className={`absolute bottom-3 left-1/2 flex max-w-[calc(100%-22rem)] -translate-x-1/2 flex-col rounded-xl border border-zinc-200 px-3 pb-3 pt-1.5 shadow-md backdrop-blur ${ring}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-4 text-xs font-medium text-zinc-500">
        <span className="whitespace-nowrap">Your hand · {hand.length}</span>
        <div className="flex items-center gap-1">
          {seatSwitch}
          <button type="button" onClick={() => setCollapsed(true)} className="rounded px-1.5 py-1 hover:bg-zinc-100" title="Hide hand">
            ▼
          </button>
        </div>
      </div>

      {hand.length === 0 ? (
        <p className="grid h-16 min-w-64 place-items-center rounded-lg border border-dashed border-zinc-300 px-4 text-center text-xs text-zinc-500">
          Drag cards here or draw from a pile
        </p>
      ) : (
        <div className="flex items-end overflow-x-auto overflow-y-visible px-1 pt-3" onPointerLeave={() => setPreview(null)}>
          {hand.map((card, i) => {
            const width = Math.round((CARD_HEIGHT * card.width) / card.height);
            const overlap = hand.length > SPREAD_LIMIT ? -Math.round(width * 0.45) : 6;
            return (
              <div
                key={i}
                onPointerDown={(e) => {
                  setPreview(null);
                  onCardPointerDown(e, i, card);
                }}
                onPointerEnter={(e) => showPreview(e, i, card)}
                className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-md bg-white shadow ring-1 ring-black/10 transition hover:z-10 hover:-translate-y-3"
                style={{ marginLeft: i === 0 ? 0 : overlap, opacity: draggingIndex === i ? 0.3 : 1 }}
              >
                <CardImage card={card} width={width} height={CARD_HEIGHT} />
              </div>
            );
          })}
        </div>
      )}

      {preview && previewCard && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-3 -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
          style={{ left: preview.left }}
        >
          <CardImage
            card={previewCard}
            width={Math.round((preview.height * previewCard.width) / previewCard.height)}
            height={preview.height}
          />
          <p className="bg-zinc-900 px-3 py-1.5 text-center text-[11px] font-medium text-white">
            Drag to play · Shift + drag to play face down
          </p>
        </div>
      )}
    </div>
  );
}

/** Which side of the table you're looking from. Player 2 sees the board turned 180°. */
function SeatSwitch({ flipped, onChange }: { flipped: boolean; onChange: (flipped: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={flipped}
      aria-label="View the table as Player 2"
      title="Switch sides of the table"
      onClick={() => onChange(!flipped)}
      className="relative grid grid-cols-2 rounded-lg bg-zinc-100 p-0.5 text-[11px] font-semibold ring-1 ring-zinc-200"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-white shadow-sm ring-1 ring-black/5 transition-transform ${flipped ? "translate-x-full" : ""}`}
      />
      <span className={`relative whitespace-nowrap px-2.5 py-1 transition-colors ${flipped ? "text-zinc-500" : "text-brand"}`}>
        Player 1
      </span>
      <span className={`relative whitespace-nowrap px-2.5 py-1 transition-colors ${flipped ? "text-brand" : "text-zinc-500"}`}>
        Player 2
      </span>
    </button>
  );
}
