"use client";

import type { LiveObject } from "@liveblocks/client";
import { useMutation, useStorage } from "@liveblocks/react/suspense";
import { useEffect, useRef, useState } from "react";
import { CardImage } from "./CardArt";
import { Icon } from "./Icon";
import { PackImage } from "./PackArt";
import { MAX_PACK_CARDS, MAX_WEIGHT, MIN_PACK_CARDS, packCards } from "./packs";
import type { PackCard, PackLayer } from "./types";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const THUMB_HEIGHT = 56;
const MAX_NAME = 40;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** "12%", "1.4%", "<0.1%", or "Never" for weight 0. */
function formatChance(p: number) {
  if (p === 0) return "Never";
  if (p < 0.001) return "<0.1%";
  return `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
}

const fieldClass =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * A text or whole-number field that saves when you leave it or press Enter, so typing isn't one undo
 * step per key. It starts over from the saved value whenever that changes.
 */
function SavedField({
  value,
  onSave,
  label,
  className,
  range,
}: {
  value: string | number;
  onSave: (value: string) => void;
  label: string;
  className: string;
  range?: { min: number; max: number };
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      aria-label={label}
      maxLength={range ? undefined : MAX_NAME}
      {...(range ? { type: "number", inputMode: "numeric" as const, min: range.min, max: range.max, step: 1 } : {})}
      onBlur={(e) => {
        const input = e.currentTarget;
        let next = input.value.trim();
        if (range) {
          const n = Number(next);
          next = next === "" || !Number.isFinite(n) ? String(value) : String(clamp(Math.round(n), range.min, range.max));
        } else if (!next) {
          next = String(value);
        }
        input.value = next;
        if (next !== String(value)) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${fieldClass} ${className}`}
    />
  );
}

/**
 * A pack's settings and the cards it can give, with their weights and chances. Changes are saved to
 * the board straight away, and everyone on the board can see and change them.
 */
export function PackEditor({
  packId,
  onClose,
  uploadImage,
}: {
  packId: string;
  onClose: () => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const pack = useStorage((root) => {
    const l = root.layers[packId];
    return l?.type === "pack" ? l : null;
  });
  const cards = useStorage((root) => root.packs?.[packId]) ?? [];
  const [uploading, setUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Someone opened or deleted the pack while this was open.
  useEffect(() => {
    if (pack === null) onClose();
  }, [pack, onClose]);

  const updatePack = useMutation(
    ({ storage }, patch: Partial<PackLayer>) => {
      const l = storage.get("layers").get(packId);
      if (l?.get("type") === "pack") l.update(patch);
    },
    [packId],
  );

  const removeCover = useMutation(
    ({ storage }) => {
      const l = storage.get("layers").get(packId);
      if (l?.get("type") === "pack") (l as unknown as LiveObject<PackLayer>).delete("cover");
    },
    [packId],
  );

  const updateCard = useMutation(
    ({ storage }, index: number, patch: Partial<PackCard>) => {
      const list = packCards(storage, packId);
      const card = list.get(index);
      if (!card) return;
      const next: PackCard = { ...card, ...patch };
      if (!next.guaranteed) delete next.guaranteed;
      list.set(index, next);
    },
    [packId],
  );

  const removeCard = useMutation(({ storage }, index: number) => packCards(storage, packId).delete(index), [packId]);

  if (!pack) return null;

  const total = cards.reduce((sum, c) => sum + c.weight, 0);
  const possible = cards.filter((c) => c.weight > 0).length;
  const guarantees = cards.filter((c) => c.guaranteed && c.weight > 0).length;

  async function pickCover(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) updatePack({ cover: url });
    } finally {
      setUploading(false);
    }
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
      <div
        role="dialog"
        aria-modal
        aria-labelledby="pack-title"
        className="flex max-h-full w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="pack-title" className="text-lg font-semibold">
            Edit pack
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>

        <div className="flex gap-4">
          <div className="shrink-0 overflow-hidden rounded-md">
            <PackImage pack={pack} width={86} height={139} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Name
              <SavedField
                value={pack.name}
                label="Pack name"
                onSave={(name) => updatePack({ name })}
                className="w-full"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => coverInputRef.current?.click()}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : pack.cover ? "Change cover" : "Upload cover"}
              </button>
              {pack.cover && !uploading && (
                <button type="button" onClick={removeCover} className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
                  Use default cover
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {pack.cover ? "Your cover replaces the default art and name." : "The default cover shows the pack's name. Recolor it with the color swatches."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-zinc-200 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Cards per pack ({MIN_PACK_CARDS}–{MAX_PACK_CARDS})
            <SavedField
              value={pack.size}
              label="Cards per pack"
              range={{ min: MIN_PACK_CARDS, max: MAX_PACK_CARDS }}
              onSave={(size) => updatePack({ size: Number(size) })}
              className="w-24"
            />
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              checked={pack.allowDuplicates}
              onChange={(e) => updatePack({ allowDuplicates: e.target.checked })}
              className="size-4 accent-brand"
            />
            The same card can come up more than once in a pack
          </label>
        </div>
        {!pack.allowDuplicates && possible > 0 && possible < pack.size && (
          <p className="-mt-2 text-sm text-amber-700">
            Only {possible} card{possible === 1 ? "" : "s"} can come up, so each pack will have {possible}.
          </p>
        )}

        <div className="border-t border-zinc-200 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Cards · {cards.length}
            </h3>
            <span className="text-xs text-zinc-500">Bigger weights come up more often. 0 means never.</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {guarantees > 0
              ? `Every pack has at least one of the ${guarantees} Guarantee card${guarantees === 1 ? "" : "s"}.`
              : "Tag cards as Guarantee to make sure every pack has at least one of them."}
          </p>
        </div>

        {cards.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            No cards yet. Close this and drag cards onto the pack: from the board, your hand or a pile, or image files from
            your computer.
          </p>
        ) : (
          <ul className="-mt-1 flex flex-col divide-y divide-zinc-100">
            {cards.map((card, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <div className="shrink-0 overflow-hidden rounded ring-1 ring-black/10">
                  <CardImage card={card} width={Math.round((THUMB_HEIGHT * card.width) / card.height)} height={THUMB_HEIGHT} />
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                  Weight
                  <SavedField
                    value={card.weight}
                    label={`Weight of card ${i + 1}`}
                    range={{ min: 0, max: MAX_WEIGHT }}
                    onSave={(weight) => updateCard(i, { weight: Number(weight) })}
                    className="w-20 py-1.5"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!card.guaranteed}
                    onChange={(e) => updateCard(i, { guaranteed: e.target.checked })}
                    className="size-4 accent-brand"
                  />
                  Guarantee
                </label>
                <span
                  className="ml-auto text-sm font-medium tabular-nums text-zinc-700"
                  title="How likely each pick is to be this card. Without duplicates, cards already picked are left out, so later picks shift a little."
                >
                  {formatChance(total > 0 ? card.weight / total : 0)}
                  {card.weight > 0 && <span className="text-xs font-normal text-zinc-400"> per pick</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removeCard(i)}
                  aria-label={`Remove card ${i + 1} from the pack`}
                  title="Remove from the pack"
                  className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                >
                  <Icon name="trash" className="size-[18px]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-zinc-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
            Done
          </button>
        </div>

        <input
          ref={coverInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) pickCover(file);
          }}
        />
      </div>
    </div>
  );
}
