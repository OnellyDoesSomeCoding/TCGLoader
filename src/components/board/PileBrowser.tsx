"use client";

import { useStorage } from "@liveblocks/react/suspense";
import { useEffect, useRef, useState } from "react";
import { CardImage } from "./CardArt";
import { Icon } from "./Icon";
import type { Card } from "./types";

const THUMB_HEIGHT = 96;
// The preview is this tall, or under half the window on short screens, and never wider than PREVIEW_MAX_WIDTH.
const PREVIEW_HEIGHT = 380;
const PREVIEW_MAX_WIDTH = 480;

function previewSize(card: Card, maxHeight: number) {
  const scale = Math.min(maxHeight / card.height, PREVIEW_MAX_WIDTH / card.width);
  return { width: Math.round(card.width * scale), height: Math.round(card.height * scale) };
}

/** Shows every card in a pile, top first, so you can take any of them. Only you see this. */
export function PileBrowser({
  pileId,
  onClose,
  onTake,
}: {
  pileId: string;
  onClose: () => void;
  onTake: (index: number, to: "hand" | "board") => void;
}) {
  const pile = useStorage((root) => {
    const l = root.layers[pileId];
    return l?.type === "pile" ? l : null;
  });
  const cards = useStorage((root) => root.piles?.[pileId]) ?? [];
  // Position counted from the top of the pile. Clamped below because cards can be taken while this is open.
  const [position, setPosition] = useState(0);
  const [previewHeight] = useState(() => Math.min(PREVIEW_HEIGHT, Math.round(window.innerHeight * 0.45)));
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Someone else deleted the pile while it was open.
  useEffect(() => {
    if (pile === null) onClose();
  }, [pile, onClose]);

  const count = cards.length;
  const current = Math.max(0, Math.min(position, count - 1));

  useEffect(() => {
    thumbRefs.current[current]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  if (!pile) return null;

  // Top first: position 0 is the last card in storage.
  const index = count - 1 - current;
  const card = count > 0 ? cards[index] : null;
  const size = card ? previewSize(card, previewHeight) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        // The slider moves itself with the arrow keys.
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          setPosition(Math.max(0, Math.min(current + (e.key === "ArrowLeft" ? -1 : 1), count - 1)));
        }
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="browse-title"
        className="flex max-h-full w-full max-w-4xl flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="browse-title" className="text-lg font-semibold">
            {pile.name} · {count} card{count === 1 ? "" : "s"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>
        <p className="mb-5 text-sm text-zinc-500">
          Slide or click through the pile, top card first. Only you can see this
          {pile.faceDown ? ", even though the pile is face down" : ""}.
        </p>

        {!card || !size ? (
          <p className="py-10 text-center text-sm text-zinc-500">This pile is empty.</p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-5 rounded-xl bg-zinc-50 p-5 sm:flex-row sm:justify-center sm:gap-10">
              <div
                className="relative shrink-0 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10"
                style={{ width: size.width, height: size.height }}
              >
                <CardImage card={card} width={size.width} height={size.height} />
                {current === 0 && (
                  <span className="absolute left-2 top-2 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    TOP
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center gap-4 sm:items-start">
                <div className="text-center sm:text-left">
                  <p className="text-3xl font-semibold tabular-nums">
                    {current + 1}
                    <span className="text-base font-medium text-zinc-400"> of {count}</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {current === 0
                      ? "Top of the pile"
                      : current === count - 1
                        ? "Bottom of the pile"
                        : `${current} card${current === 1 ? "" : "s"} above it`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onTake(index, "hand")}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-strong"
                  >
                    To hand
                  </button>
                  <button
                    type="button"
                    onClick={() => onTake(index, "board")}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                  >
                    To board
                  </button>
                </div>
                <p className="text-xs text-zinc-400">← → to move through the pile</p>
              </div>
            </div>

            {count > 1 && (
              <label className="mt-5 flex items-center gap-3 text-xs font-medium text-zinc-500">
                <span>Top</span>
                <input
                  type="range"
                  min={0}
                  max={count - 1}
                  value={current}
                  onChange={(e) => setPosition(Number(e.target.value))}
                  aria-label="Position in the pile"
                  aria-valuetext={`Card ${current + 1} of ${count}`}
                  className="h-2 flex-1 cursor-pointer accent-brand"
                />
                <span>Bottom</span>
              </label>
            )}

            <ul className="mt-4 flex gap-2 overflow-x-auto px-1 pb-2 pt-1">
              {cards
                .map((c, i) => ({ card: c, index: i }))
                .reverse()
                .map(({ card: c, index: i }, p) => (
                  <li key={i} className="shrink-0">
                    <button
                      ref={(el) => {
                        thumbRefs.current[p] = el;
                      }}
                      type="button"
                      onClick={() => setPosition(p)}
                      aria-label={`Card ${p + 1} of ${count}`}
                      aria-current={p === current}
                      className={`block overflow-hidden rounded-md shadow ring-1 transition ${
                        p === current
                          ? "ring-2 ring-brand ring-offset-2"
                          : "ring-black/10 opacity-60 hover:-translate-y-0.5 hover:opacity-100"
                      }`}
                    >
                      <CardImage card={c} width={Math.round((THUMB_HEIGHT * c.width) / c.height)} height={THUMB_HEIGHT} />
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
