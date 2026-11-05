"use client";

import { useState } from "react";
import {
  deleteBackpackItem,
  getBackpackItem,
  listBackpack,
  renameBackpackItem,
  replaceBackpackItem,
  saveToBackpack,
  type BackpackResult,
} from "@/app/actions/backpack";
import {
  KIND_NAMES,
  MAX_BACKPACK_ITEMS,
  MAX_ITEM_NAME,
  describeItem,
  type BackpackData,
  type BackpackKind,
  type BackpackSummary,
} from "./backpack";
import { BackpackThumb } from "./BackpackThumb";
import { Icon } from "./Icon";

/** The drag data type for a backpack item dragged onto the board. Its value is the item's id. */
export const BACKPACK_MIME = "application/x-tcg-backpack";

const OFFLINE = "Couldn't reach the server. Try again.";

/**
 * Your backpack's items, loaded when first needed, and the ways to change them. Each change returns
 * an error message, or null when it worked.
 */
export function useBackpack() {
  const [items, setItems] = useState<BackpackSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Adds or updates an item and puts it first, like the server's most-recently-changed order.
  function put(item: BackpackSummary) {
    setItems((current) => current && [item, ...current.filter((i) => i.id !== item.id)]);
  }

  async function run(action: () => Promise<BackpackResult>) {
    try {
      const result = await action();
      if (result.error !== undefined) return result.error;
      put(result.item);
      return null;
    } catch {
      return OFFLINE;
    }
  }

  return {
    items,
    failed,
    async load() {
      setFailed(false);
      try {
        setItems(await listBackpack());
      } catch {
        setFailed(true);
      }
    },
    save: (name: string, data: BackpackData) => run(() => saveToBackpack(name, data)),
    replace: (id: string, data: BackpackData) => run(() => replaceBackpackItem(id, data)),
    rename: (id: string, name: string) => run(() => renameBackpackItem(id, name)),
    async remove(id: string) {
      try {
        await deleteBackpackItem(id);
        setItems((current) => current && current.filter((i) => i.id !== id));
        return null;
      } catch {
        return OFFLINE;
      }
    },
    /** An item's full contents, or null if it was deleted (or the server couldn't be reached). */
    async fetch(id: string) {
      try {
        return await getBackpackItem(id);
      } catch {
        return null;
      }
    },
  };
}

export type Backpack = ReturnType<typeof useBackpack>;

const FILTERS: (BackpackKind | "all")[] = ["all", "asset", "deck", "pack"];

/**
 * The backpack beside the board: place items, save the selection, and drop things on it to save
 * them. On phones it sits across the top instead of down the right side.
 */
export function BackpackPanel({
  panelRef,
  backpack,
  narrow,
  highlighted,
  hasSelection,
  placingId,
  onPlace,
  onSaveSelection,
  onReplace,
  onNotice,
  onClose,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
  backpack: Backpack;
  narrow: boolean;
  // Something is being dragged over the panel and will be saved if dropped.
  highlighted: boolean;
  hasSelection: boolean;
  placingId: string | null;
  onPlace: (id: string) => void;
  onSaveSelection: () => void;
  onReplace: (item: BackpackSummary) => void;
  onNotice: (message: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<BackpackKind | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const { items } = backpack;
  const shown = items?.filter((i) => filter === "all" || i.kind === filter) ?? [];

  async function rename(item: BackpackSummary) {
    const name = window.prompt("New name", item.name)?.trim();
    if (!name || name === item.name) return;
    const error = await backpack.rename(item.id, name.slice(0, MAX_ITEM_NAME));
    if (error) onNotice(error);
  }

  async function remove(item: BackpackSummary) {
    if (!window.confirm(`Delete “${item.name}” from your backpack? Copies already on boards stay.`)) return;
    const error = await backpack.remove(item.id);
    if (error) onNotice(error);
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Backpack"
      className={`absolute z-20 flex flex-col overflow-hidden rounded-xl border bg-white shadow-xl transition ${
        narrow ? "inset-x-3 top-28 max-h-[50dvh]" : "bottom-20 right-3 top-16 w-80"
      } ${highlighted ? "border-brand ring-4 ring-brand/25" : "border-zinc-200"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="backpack" className="size-[18px]" />
          Backpack
          {items && (
            <span className="text-xs font-normal tabular-nums text-zinc-400">
              {items.length}/{MAX_BACKPACK_ITEMS}
            </span>
          )}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close the backpack" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
          <Icon name="close" className="size-[18px]" />
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              filter === f ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {f === "all" ? "All" : `${KIND_NAMES[f]}s`}
          </button>
        ))}
      </div>

      <div className="relative min-h-24 flex-1 overflow-y-auto overscroll-contain p-2">
        {items === null ? (
          backpack.failed ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-zinc-500">
              Couldn&apos;t open your backpack.
              <button type="button" onClick={backpack.load} className="font-medium text-brand hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">Opening your backpack…</p>
          )
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            {items.length === 0
              ? "Nothing here yet. Select cards, piles, packs or anything else on the board and save them, or drag them here. Cards from your hand can be dragged here too."
              : `No ${KIND_NAMES[filter as BackpackKind].toLowerCase()}s yet.`}
          </p>
        ) : (
          <ul className="flex flex-col">
            {shown.map((item) => {
              const open = openId === item.id;
              return (
                <li
                  key={item.id}
                  draggable={!narrow}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(BACKPACK_MIME, item.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={narrow ? undefined : "Drag onto the board to place a copy"}
                  className="rounded-lg hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3 p-1.5">
                    <BackpackThumb preview={item.preview} width={40} height={56} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
                      <p className="text-xs text-zinc-500">{describeItem(item.kind, item.preview.count)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={placingId !== null}
                      onClick={() => onPlace(item.id)}
                      className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-50"
                    >
                      {placingId === item.id ? "Placing…" : "Place"}
                    </button>
                    <button
                      type="button"
                      aria-label={`More for ${item.name}`}
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : item.id)}
                      className={`grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-200 ${open ? "bg-zinc-200" : ""}`}
                    >
                      <Icon name="more" className="size-[18px]" />
                    </button>
                  </div>
                  {open && (
                    <div className="flex flex-wrap gap-1 px-1.5 pb-2 pl-[3.25rem]">
                      <RowAction label="Rename" icon="rename" onClick={() => rename(item)} />
                      <RowAction
                        label="Replace with selection"
                        icon="rotate"
                        disabled={!hasSelection}
                        title={hasSelection ? "Swap what's inside for what's selected on the board" : "Select something on the board first"}
                        onClick={() => onReplace(item)}
                      />
                      <RowAction label="Delete" icon="trash" danger onClick={() => remove(item)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {highlighted && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/85 text-sm font-medium text-brand">
            Drop to save to your backpack
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 p-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onSaveSelection}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          <Icon name="plus" className="size-4" />
          Save selection
        </button>
      </div>
    </aside>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  disabled,
  title,
  danger,
}: {
  label: string;
  icon: "rename" | "rotate" | "trash";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-40 ${
        danger ? "text-red-600" : "text-zinc-700"
      }`}
    >
      <Icon name={icon} className="size-3.5" />
      {label}
    </button>
  );
}
