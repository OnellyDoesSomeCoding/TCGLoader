"use client";

import { useStorage } from "@liveblocks/react/suspense";
import { useEffect } from "react";
import { CardImage } from "./CardArt";
import { Icon } from "./Icon";

const CARD_HEIGHT = 150;

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

  // Someone else deleted the pile while it was open.
  useEffect(() => {
    if (pile === null) onClose();
  }, [pile, onClose]);

  if (!pile) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="browse-title"
        className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="browse-title" className="text-lg font-semibold">
            {pile.name} · {cards.length} card{cards.length === 1 ? "" : "s"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Top card first. Only you can see this{pile.faceDown ? ", even though the pile is face down" : ""}.
        </p>

        {cards.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">This pile is empty.</p>
        ) : (
          <ul className="flex flex-wrap gap-4 overflow-y-auto pb-1">
            {cards
              .map((card, index) => ({ card, index }))
              .reverse()
              .map(({ card, index }, position) => (
                <li key={index} className="flex flex-col items-center gap-1.5">
                  <div className="relative overflow-hidden rounded-md shadow ring-1 ring-black/10">
                    <CardImage
                      card={card}
                      width={Math.round((CARD_HEIGHT * card.width) / card.height)}
                      height={CARD_HEIGHT}
                    />
                    {position === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-zinc-900/80 px-1.5 text-[10px] font-semibold text-white">
                        TOP
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onTake(index, "hand")}
                      className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand-strong"
                    >
                      To hand
                    </button>
                    <button
                      type="button"
                      onClick={() => onTake(index, "board")}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
                    >
                      To board
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
