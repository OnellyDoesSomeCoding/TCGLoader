"use client";

import { useRef, useState } from "react";
import { deleteBackpackItem, renameBackpackItem, saveToBackpack } from "@/app/actions/backpack";
import {
  BACKPACK_UPLOAD,
  KIND_NAMES,
  MAX_BACKPACK_ITEMS,
  MAX_ITEM_CARDS,
  MAX_ITEM_NAME,
  dataFromCard,
  describeItem,
  type BackpackData,
  type BackpackKind,
  type BackpackSummary,
} from "@/components/board/backpack";
import { BackpackThumb } from "@/components/board/BackpackThumb";
import { cardSizeFor } from "@/components/board/cards";
import type { Card } from "@/components/board/types";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, imageSize, uploadImageFile } from "@/components/board/upload";

const FILTERS: (BackpackKind | "all")[] = ["all", "asset", "deck", "pack"];

/** A file's name without its extension, cut to fit an item name. */
function baseName(file: File) {
  return (file.name.replace(/\.[^.]+$/, "").trim() || "Card").slice(0, MAX_ITEM_NAME);
}

/**
 * Your backpack on the dashboard: look through it, rename and delete items, and upload images
 * straight into it, as separate cards or as one deck.
 */
export function BackpackManager({ initialItems }: { initialItems: BackpackSummary[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<BackpackKind | "all">("all");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const cardsInputRef = useRef<HTMLInputElement>(null);
  const deckInputRef = useRef<HTMLInputElement>(null);
  const shown = items.filter((i) => filter === "all" || i.kind === filter);

  function put(item: BackpackSummary) {
    setItems((current) => [item, ...current.filter((i) => i.id !== item.id)]);
  }

  async function save(name: string, data: BackpackData) {
    const result = await saveToBackpack(name, data);
    if (result.error !== undefined) throw new Error(result.error);
    put(result.item);
  }

  /** Uploads the images, then saves each as a card, or all of them as one deck (first file on top). */
  async function upload(files: File[], asDeck: boolean) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const tooBig = images.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setStatus(`${tooBig.name} is larger than 10 MB.`);
      return;
    }
    if (asDeck && images.length > MAX_ITEM_CARDS) {
      setStatus(`A deck can hold at most ${MAX_ITEM_CARDS} cards.`);
      return;
    }
    if (!asDeck && items.length + images.length > MAX_BACKPACK_ITEMS) {
      setStatus(`That's more than fits: your backpack holds ${MAX_BACKPACK_ITEMS} items.`);
      return;
    }
    let deckName = "Deck";
    if (asDeck) {
      const answer = window.prompt("Deck name", deckName);
      if (answer === null) return;
      deckName = (answer.trim() || deckName).slice(0, MAX_ITEM_NAME);
    }

    setUploading(true);
    setStatus(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
    try {
      const cards: Card[] = await Promise.all(
        images.map(async (file) => {
          const [size, url] = await Promise.all([imageSize(file), uploadImageFile(file, "backpack", BACKPACK_UPLOAD)]);
          return { url, ...cardSizeFor(size.width, size.height) };
        }),
      );
      if (asDeck) {
        const top = cards[0];
        await save(deckName, {
          entries: [
            {
              layer: { type: "pile", x: 0, y: 0, width: top.width, height: top.height, name: deckName, faceDown: false },
              // A pile's top is its last card.
              cards: [...cards].reverse(),
            },
          ],
        });
        setStatus(`Saved the deck “${deckName}” with ${cards.length} card${cards.length === 1 ? "" : "s"}.`);
      } else {
        // One at a time: the server checks the item limit as each one goes in.
        for (let i = 0; i < cards.length; i++) await save(baseName(images[i]), dataFromCard(cards[i]));
        setStatus(`Saved ${cards.length} card${cards.length === 1 ? "" : "s"} to your backpack.`);
      }
    } catch (error) {
      setStatus(`Couldn't finish: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  async function rename(item: BackpackSummary) {
    const name = window.prompt("New name", item.name)?.trim();
    if (!name || name === item.name) return;
    setBusyId(item.id);
    try {
      const result = await renameBackpackItem(item.id, name.slice(0, MAX_ITEM_NAME));
      if (result.error !== undefined) setStatus(result.error);
      else put(result.item);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: BackpackSummary) {
    if (!window.confirm(`Delete “${item.name}” from your backpack? Copies already on boards stay.`)) return;
    setBusyId(item.id);
    try {
      await deleteBackpackItem(item.id);
      setItems((current) => current.filter((i) => i.id !== item.id));
    } finally {
      setBusyId(null);
    }
  }

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, asDeck: boolean) => (
    <input
      ref={ref}
      type="file"
      accept={IMAGE_ACCEPT}
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        upload(files, asDeck);
      }}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === f ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200/60"
              }`}
            >
              {f === "all" ? "All" : `${KIND_NAMES[f]}s`}
            </button>
          ))}
          <span className="self-center pl-2 text-sm tabular-nums text-zinc-400">
            {items.length}/{MAX_BACKPACK_ITEMS}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => cardsInputRef.current?.click()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Upload cards
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => deckInputRef.current?.click()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Upload a deck
          </button>
        </div>
      </div>
      {status && (
        <p role="status" className="mt-3 text-sm text-zinc-600">
          {status}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500">
          {items.length === 0
            ? "Your backpack is empty. Save cards, decks, packs and anything else from a board to bring them to any other board, or upload images here."
            : `No ${KIND_NAMES[filter as BackpackKind].toLowerCase()}s yet.`}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {shown.map((item) => (
            <li
              key={item.id}
              className={`flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white ${busyId === item.id ? "opacity-60" : ""}`}
            >
              <div className="grid place-items-center bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] py-4 [background-size:14px_14px]">
                <BackpackThumb preview={item.preview} width={80} height={112} />
              </div>
              <div className="flex flex-1 flex-col gap-1 border-t border-zinc-100 px-3 py-2">
                <p className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </p>
                <p className="text-xs text-zinc-500">{describeItem(item.kind, item.preview.count)}</p>
                <div className="mt-auto flex gap-3 pt-1 text-xs font-medium">
                  <button type="button" onClick={() => rename(item)} className="text-zinc-600 hover:text-zinc-900">
                    Rename
                  </button>
                  <button type="button" onClick={() => remove(item)} className="text-red-600 hover:text-red-700">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {fileInput(cardsInputRef, false)}
      {fileInput(deckInputRef, true)}
    </div>
  );
}
