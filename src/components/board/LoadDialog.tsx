"use client";

import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_GRID, GridFields, GridPreview, gridCells, type Grid } from "./CutDialog";
import { Icon } from "./Icon";
import type { Crop } from "./types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const PREVIEW_WIDTH = 520;
const PREVIEW_HEIGHT = 280;

/** One image to cut, with its pixel size and the cells to cut it into. */
export type LoadSheet = { file: File; width: number; height: number; cells: Crop[] };

export type LoadOptions = { name: string; shuffle: boolean; faceDown: boolean; sheets: LoadSheet[] };

type Item = {
  key: string;
  file: File;
  size: { width: number; height: number } | null;
  failed: boolean;
  grid: Grid;
};

function cellsOf(item: Item) {
  if (!item.size) return null;
  const { columns, rows, margin, gap } = item.grid;
  return gridCells(item.size.width, item.size.height, columns, rows, margin, gap);
}

/** Splits picked files into new items and the names of images too large to upload. */
function toItems(files: File[], grid: Grid) {
  const items: Item[] = [];
  const tooBig: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_BYTES) tooBig.push(file.name);
    else items.push({ key: nanoid(), file, size: null, failed: false, grid });
  }
  return { items, tooBig };
}

// Local preview URLs, one per picked file. Revoked when a file is removed or the dialog closes.
const previews = new WeakMap<File, string>();

function previewUrl(file: File) {
  let url = previews.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    previews.set(file, url);
  }
  return url;
}

function revokePreview(file: File) {
  const url = previews.get(file);
  if (url) URL.revokeObjectURL(url);
  previews.delete(file);
}

async function naturalSize(file: File) {
  const img = new Image();
  img.src = previewUrl(file);
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export function LoadDialog({
  files,
  onClose,
  onLoad,
}: {
  files: File[];
  onClose: () => void;
  onLoad: (options: LoadOptions) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const measuring = useRef(new Set<string>());
  const [initial] = useState(() => toItems(files, DEFAULT_GRID));
  const [items, setItems] = useState<Item[]>(initial.items);
  const [activeKey, setActiveKey] = useState<string | null>(initial.items[0]?.key ?? null);
  const [skipped, setSkipped] = useState<string[]>(initial.tooBig);
  const [name, setName] = useState("Pile");
  const [shuffle, setShuffle] = useState(false);
  const [faceDown, setFaceDown] = useState(false);

  const active = items.find((i) => i.key === activeKey) ?? null;

  // Read each new image's pixel size, which the grid is measured in.
  useEffect(() => {
    for (const item of items) {
      if (item.size || item.failed || measuring.current.has(item.key)) continue;
      measuring.current.add(item.key);
      naturalSize(item.file)
        .then((size) => ({ size, failed: false }))
        .catch(() => ({ size: null, failed: true }))
        .then((patch) => setItems((current) => current.map((i) => (i.key === item.key ? { ...i, ...patch } : i))));
    }
  }, [items]);

  function addFiles(added: File[]) {
    // Sheets in a set usually share a layout, so new ones start with the grid being edited.
    const next = toItems(added, active?.grid ?? DEFAULT_GRID);
    setSkipped(next.tooBig);
    if (next.items.length === 0) return;
    setItems((current) => [...current, ...next.items]);
    setActiveKey((key) => key ?? next.items[0].key);
  }

  function remove(key: string) {
    const index = items.findIndex((i) => i.key === key);
    const rest = items.filter((i) => i.key !== key);
    revokePreview(items[index].file);
    setItems(rest);
    if (activeKey === key) setActiveKey(rest[Math.min(index, rest.length - 1)]?.key ?? null);
  }

  function setGrid(key: string, patch: Partial<Grid>) {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, grid: { ...i.grid, ...patch } } : i)));
  }

  const activeCells = active ? cellsOf(active) : null;
  const ready = items.every((i) => i.size || i.failed);
  const sheets: LoadSheet[] = [];
  let broken = 0;
  for (const item of items) {
    const cells = cellsOf(item);
    if (item.size && cells) sheets.push({ file: item.file, ...item.size, cells });
    else if (item.size) broken++;
  }
  const total = sheets.reduce((n, s) => n + s.cells.length, 0);
  const canLoad = ready && broken === 0 && total > 0;

  function close() {
    for (const item of items) revokePreview(item.file);
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canLoad) return;
    for (const item of items) revokePreview(item.file);
    onLoad({ name: name.trim() || "Pile", shuffle, faceDown, sheets });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal
        aria-labelledby="load-title"
        className="flex max-h-full w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="load-title" className="text-lg font-semibold">
            Load cards into a pile
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item) => {
            const cells = cellsOf(item);
            return (
              <div key={item.key} className="relative shrink-0">
                <button
                  type="button"
                  title={item.file.name}
                  onClick={() => setActiveKey(item.key)}
                  className={`flex w-20 flex-col items-center gap-1 rounded-lg border p-1 text-[11px] ${
                    item.key === activeKey ? "border-brand bg-brand/10" : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl(item.file)} alt="" className="h-14 w-full rounded object-contain" />
                  <span className={item.failed || (item.size && !cells) ? "text-red-600" : "text-zinc-600"}>
                    {item.failed ? "Can't read" : !item.size ? "…" : cells ? `${cells.length} cards` : "Bad grid"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  aria-label={`Remove ${item.file.name}`}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-red-600"
                >
                  <Icon name="close" className="size-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 p-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
          >
            <Icon name="plus" />
            Add images
          </button>
        </div>

        {skipped.length > 0 && (
          <p className="text-sm text-red-600">Skipped (larger than 10 MB): {skipped.join(", ")}</p>
        )}

        {active && (
          <>
            <div className="grid place-items-center rounded-xl bg-zinc-100 p-3" style={{ minHeight: PREVIEW_HEIGHT / 2 }}>
              {active.size ? (
                <GridPreview
                  url={previewUrl(active.file)}
                  sheetW={active.size.width}
                  sheetH={active.size.height}
                  cells={activeCells}
                  maxWidth={PREVIEW_WIDTH}
                  maxHeight={PREVIEW_HEIGHT}
                />
              ) : (
                <span className="text-sm text-zinc-500">{active.failed ? "This image couldn't be read." : "Loading image…"}</span>
              )}
            </div>

            <GridFields grid={active.grid} onChange={(patch) => setGrid(active.key, patch)} />

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={active.size && !activeCells ? "text-red-600" : "text-zinc-600"}>
                {!active.size
                  ? " "
                  : activeCells
                    ? `${activeCells.length} cards from ${active.file.name}`
                    : "Margin and gap are too large for this image."}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((current) => current.map((i) => ({ ...i, grid: active.grid })))}
                  className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10"
                >
                  Use this grid for all images
                </button>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-end gap-4 border-t border-zinc-200 pt-4">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-600">
            Pile name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="size-4 accent-brand" />
            Shuffle
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" checked={faceDown} onChange={(e) => setFaceDown(e.target.checked)} className="size-4 accent-brand" />
            Face down
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100">
            Cancel
          </button>
          <button
            disabled={!canLoad}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
          >
            Load {total} card{total === 1 ? "" : "s"}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </form>
    </div>
  );
}
