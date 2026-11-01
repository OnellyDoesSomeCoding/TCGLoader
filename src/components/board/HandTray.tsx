"use client";

import { useSelf, useStorage } from "@liveblocks/react/suspense";
import { useRef, useState } from "react";
import { CardImage } from "./CardArt";
import { LONG_PRESS_MS, TAP_SLOP } from "./touch";
import type { Card } from "./types";

const CARD_HEIGHT = 112;
const COMPACT_CARD_HEIGHT = 80;
// Past this many cards they overlap so the hand stays a reasonable width.
const SPREAD_LIMIT = 6;
// The hover preview is this tall, or half the window on short screens.
const PREVIEW_HEIGHT = 360;
const PREVIEW_MARGIN = 12;

/**
 * Your hand, at the bottom of the board. `docked` puts it in the layout around it (on phones,
 * above the toolbar) instead of floating it, and `compact` makes the cards smaller.
 */
export function HandTray({
  trayRef,
  compact,
  docked,
  highlighted,
  draggingIndex,
  onCardPointerDown,
  flipped,
  onFlippedChange,
  faceDown,
  onFaceDownChange,
}: {
  trayRef: React.RefObject<HTMLDivElement | null>;
  compact: boolean;
  docked: boolean;
  highlighted: boolean;
  draggingIndex: number | null;
  onCardPointerDown: (e: React.PointerEvent, index: number, card: Card) => void;
  flipped: boolean;
  onFlippedChange: (flipped: boolean) => void;
  // Cards played from your hand or dragged off a pile land face down, as if Shift were held.
  faceDown: boolean;
  onFaceDownChange: (faceDown: boolean) => void;
}) {
  const myId = useSelf((me) => me.id);
  const hand = useStorage((root) => root.hands?.[myId]) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  // The previewed card and where its preview sits, in pixels from the tray's left edge.
  // `touch`: shown by holding a finger on the card rather than hovering it.
  const [preview, setPreview] = useState<{ index: number; left: number; height: number; touch: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const ring = highlighted ? "ring-2 ring-brand bg-indigo-50" : "bg-white/95";
  const place = docked ? "pointer-events-auto relative" : "absolute bottom-3 left-1/2 -translate-x-1/2";
  const seatSwitch = <SeatSwitch flipped={flipped} short={compact} onChange={onFlippedChange} />;

  if (collapsed) {
    return (
      <div ref={trayRef} className={`${place} flex items-center gap-1 rounded-xl border border-zinc-200 pl-1.5 shadow-md ${ring}`}>
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

  function showPreview(cardEl: HTMLElement, index: number, card: Card, touch: boolean) {
    const tray = trayRef.current;
    if (!tray) return;
    const cardRect = cardEl.getBoundingClientRect();
    const trayRect = tray.getBoundingClientRect();
    const height = Math.min(PREVIEW_HEIGHT, Math.round(window.innerHeight * 0.5));
    const half = (height * card.width) / card.height / 2;
    // Centered over the card, but kept inside the window.
    const center = Math.min(
      Math.max(cardRect.left + cardRect.width / 2, half + PREVIEW_MARGIN),
      window.innerWidth - half - PREVIEW_MARGIN,
    );
    setPreview({ index, left: center - trayRect.left, height, touch });
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>, index: number, card: Card) {
    setPreview(null);
    onCardPointerDown(e, index, card);
    if (e.pointerType !== "touch") return;

    // Holding a finger still on a card previews it until the finger is lifted.
    const cardEl = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => showPreview(cardEl, index, card, true), LONG_PRESS_MS);
    const done = new AbortController();
    const end = () => {
      clearTimeout(holdTimer.current);
      setPreview(null);
      done.abort();
    };
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > TAP_SLOP) clearTimeout(holdTimer.current);
    };
    window.addEventListener("pointermove", move, { signal: done.signal });
    window.addEventListener("pointerup", end, { signal: done.signal });
    window.addEventListener("pointercancel", end, { signal: done.signal });
  }

  const previewCard = preview && draggingIndex === null ? hand[preview.index] : undefined;
  const cardHeight = compact ? COMPACT_CARD_HEIGHT : CARD_HEIGHT;
  // Clear of the toolbar on the left, and of the zoom buttons too when they're shown.
  const width = docked ? "w-full" : compact ? "max-w-[calc(100%-9rem)]" : "max-w-[calc(100%-22rem)]";

  return (
    <div
      ref={trayRef}
      className={`${place} ${width} flex flex-col rounded-xl border border-zinc-200 px-3 pb-3 pt-1.5 shadow-md backdrop-blur ${ring}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-zinc-500">
        <span className="whitespace-nowrap">
          {compact ? "Hand" : "Your hand"} · {hand.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={faceDown}
            onClick={() => onFaceDownChange(!faceDown)}
            title="Play cards from your hand, and drag them off piles, face down (or hold Shift while dragging)"
            className={`whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 transition-colors ${
              faceDown ? "bg-brand text-white ring-brand" : "bg-zinc-100 text-zinc-500 ring-zinc-200 hover:text-zinc-700"
            }`}
          >
            Face down
          </button>
          {seatSwitch}
          <button type="button" onClick={() => setCollapsed(true)} className="rounded px-2 py-1 hover:bg-zinc-100" title="Hide hand">
            ▼
          </button>
        </div>
      </div>

      {hand.length === 0 ? (
        <p
          className="grid min-w-64 place-items-center rounded-lg border border-dashed border-zinc-300 px-4 text-center text-xs text-zinc-500"
          style={{ height: compact ? 56 : 64 }}
        >
          Drag cards here or draw from a pile
        </p>
      ) : (
        // A finger swiping sideways scrolls the hand; dragging a card up plays it.
        <div
          className="flex touch-pan-x items-end overflow-x-auto overflow-y-visible overscroll-x-contain px-1 pt-3"
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setPreview(null);
          }}
        >
          {hand.map((card, i) => {
            const width = Math.round((cardHeight * card.width) / card.height);
            const overlap = hand.length > SPREAD_LIMIT ? -Math.round(width * 0.45) : 6;
            return (
              <div
                key={i}
                onPointerDown={(e) => onPointerDown(e, i, card)}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") showPreview(e.currentTarget, i, card, false);
                }}
                className="relative shrink-0 cursor-grab touch-pan-x overflow-hidden rounded-md bg-white shadow ring-1 ring-black/10 transition hover:z-10 hover:-translate-y-3"
                style={{ marginLeft: i === 0 ? 0 : overlap, opacity: draggingIndex === i ? 0.3 : 1 }}
              >
                <CardImage card={card} width={width} height={cardHeight} />
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
            {preview.touch
              ? `Drag up to play${faceDown ? " face down" : ""} · swipe sideways to scroll`
              : "Drag to play · Shift + drag to play face down"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Which side of the table you're looking from. Player 2 sees the board turned 180°. */
function SeatSwitch({
  flipped,
  short,
  onChange,
}: {
  flipped: boolean;
  // "P1" and "P2", to fit on a phone.
  short: boolean;
  onChange: (flipped: boolean) => void;
}) {
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
        {short ? "P1" : "Player 1"}
      </span>
      <span className={`relative whitespace-nowrap px-2.5 py-1 transition-colors ${flipped ? "text-brand" : "text-zinc-500"}`}>
        {short ? "P2" : "Player 2"}
      </span>
    </button>
  );
}
