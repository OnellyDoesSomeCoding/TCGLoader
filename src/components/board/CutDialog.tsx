"use client";

import { useStorage } from "@liveblocks/react/suspense";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { CroppedImage } from "./CardArt";
import { FULL_CROP, type Crop } from "./types";

const MAX_CELLS_PER_SIDE = 20;
const PREVIEW_WIDTH = 520;
const PREVIEW_HEIGHT = 360;

const PRESETS = [
  { cols: 3, rows: 3 },
  { cols: 4, rows: 2 },
  { cols: 5, rows: 2 },
  { cols: 10, rows: 7 },
];

export type CutOptions = { cells: Crop[]; columns: number; keepOriginal: boolean };

/**
 * Splits a sheet of `width`×`height` pixels into a grid of equal cells.
 * `margin` is trimmed from every outer edge and `gap` is the space between
 * cards, both in pixels. Cells are returned row by row as fractions of the sheet.
 */
export function gridCells(
  width: number,
  height: number,
  columns: number,
  rows: number,
  margin: number,
  gap: number,
): Crop[] | null {
  const cellW = (width - 2 * margin - (columns - 1) * gap) / columns;
  const cellH = (height - 2 * margin - (rows - 1) * gap) / rows;
  if (!(cellW > 0 && cellH > 0)) return null;

  const cells: Crop[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      cells.push({
        x: (margin + c * (cellW + gap)) / width,
        y: (margin + r * (cellH + gap)) / height,
        width: cellW / width,
        height: cellH / height,
      });
    }
  }
  return cells;
}

function useNaturalSize(url: string | undefined) {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.src = url;
    img
      .decode()
      .then(() => {
        if (!cancelled) setSize({ url, width: img.naturalWidth, height: img.naturalHeight });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  return size && size.url === url ? size : null;
}

export function CutDialog({
  layerId,
  onClose,
  onCut,
}: {
  layerId: string;
  onClose: () => void;
  onCut: (options: CutOptions) => void;
}) {
  const layer = useStorage((root) => {
    const l = root.layers[layerId];
    return l?.type === "image" ? l : null;
  });
  const natural = useNaturalSize(layer?.url);

  const [grid, setGrid] = useState(DEFAULT_GRID);
  const { columns, rows } = grid;
  const [keepOriginal, setKeepOriginal] = useState(false);

  // Someone else deleted the image while the dialog was open.
  useEffect(() => {
    if (layer === null) onClose();
  }, [layer, onClose]);

  if (!layer) return null;

  const crop = layer.crop ?? FULL_CROP;
  // Pixel size of the part of the image this layer shows.
  const sheetW = natural ? Math.round(natural.width * crop.width) : 0;
  const sheetH = natural ? Math.round(natural.height * crop.height) : 0;
  const cells = natural ? gridCells(sheetW, sheetH, columns, rows, grid.margin, grid.gap) : null;
  const cardW = cells ? Math.floor(cells[0].width * sheetW) : 0;
  const cardH = cells ? Math.floor(cells[0].height * sheetH) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cells) onCut({ cells, columns, keepOriginal });
  }

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
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal
        aria-labelledby="cut-title"
        className="flex max-h-full w-full max-w-[600px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="cut-title" className="text-lg font-semibold">
            Cut into cards
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>

        <div
          className="grid place-items-center rounded-xl bg-zinc-100 p-3"
          style={{ minHeight: PREVIEW_HEIGHT / 2 }}
        >
          {natural ? (
            <GridPreview
              url={layer.url}
              crop={layer.crop}
              sheetW={sheetW}
              sheetH={sheetH}
              cells={cells}
              maxWidth={PREVIEW_WIDTH}
              maxHeight={PREVIEW_HEIGHT}
            />
          ) : (
            <span className="text-sm text-zinc-500">Loading image…</span>
          )}
        </div>

        <GridFields grid={grid} onChange={(patch) => setGrid((g) => ({ ...g, ...patch }))} />

        <p className={`text-sm ${natural && !cells ? "text-red-600" : "text-zinc-600"}`}>
          {!natural
            ? " "
            : cells
              ? `${columns * rows} cards, each ${cardW} × ${cardH} px (sheet is ${sheetW} × ${sheetH} px)`
              : "Margin and gap are too large for this sheet."}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepOriginal}
            onChange={(e) => setKeepOriginal(e.target.checked)}
            className="size-4 accent-brand"
          />
          Keep the uncut sheet on the board
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100">
            Cancel
          </button>
          <button
            disabled={!cells}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
          >
            Cut into {columns * rows} cards
          </button>
        </div>
      </form>
    </div>
  );
}

/** How a sheet is split: a columns × rows grid, with `margin` and `gap` in source pixels. */
export type Grid = { columns: number; rows: number; margin: number; gap: number };

export const DEFAULT_GRID: Grid = { columns: 3, rows: 3, margin: 0, gap: 0 };

/** Preset buttons plus columns, rows, margin and gap inputs. */
export function GridFields({ grid, onChange }: { grid: Grid; onChange: (patch: Partial<Grid>) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-zinc-500">Presets</span>
        {PRESETS.map((p) => (
          <button
            key={`${p.cols}x${p.rows}`}
            type="button"
            onClick={() => onChange({ columns: p.cols, rows: p.rows })}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              grid.columns === p.cols && grid.rows === p.rows
                ? "border-brand bg-brand/10 text-brand"
                : "border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {p.cols} × {p.rows}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField label="Columns" value={grid.columns} min={1} max={MAX_CELLS_PER_SIDE} onChange={(columns) => onChange({ columns })} />
        <NumberField label="Rows" value={grid.rows} min={1} max={MAX_CELLS_PER_SIDE} onChange={(rows) => onChange({ rows })} />
        <NumberField label="Margin (px)" value={grid.margin} min={0} max={10000} onChange={(margin) => onChange({ margin })} />
        <NumberField label="Gap (px)" value={grid.gap} min={0} max={10000} onChange={(gap) => onChange({ gap })} />
      </div>
    </>
  );
}

/** A sheet scaled to fit `maxWidth`×`maxHeight`, with its grid cells outlined. */
export function GridPreview({
  url,
  crop,
  sheetW,
  sheetH,
  cells,
  maxWidth,
  maxHeight,
}: {
  url: string;
  crop?: Readonly<Crop>;
  sheetW: number;
  sheetH: number;
  cells: Crop[] | null;
  maxWidth: number;
  maxHeight: number;
}) {
  const scale = Math.min(maxWidth / sheetW, maxHeight / sheetH);
  return (
    <svg
      width={Math.round(sheetW * scale)}
      height={Math.round(sheetH * scale)}
      viewBox={`0 0 ${sheetW} ${sheetH}`}
      className="max-w-full"
    >
      <CroppedImage url={url} crop={crop} x={0} y={0} width={sheetW} height={sheetH} />
      {cells?.map((c, i) => (
        <rect
          key={i}
          x={c.x * sheetW}
          y={c.y * sheetH}
          width={c.width * sheetW}
          height={c.height * sheetH}
          fill="rgb(79 70 229 / 0.12)"
          stroke="#4f46e5"
          strokeWidth={1.5 / scale}
        />
      ))}
    </svg>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
