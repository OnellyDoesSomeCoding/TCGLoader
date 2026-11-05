// What a backpack item holds, shared by the board (saving and placing) and the server (checking and
// storing). Free of client-only code so server actions can import it.
import type { Card, ImageLayer, Layer, LayerType, PackCard, PackLayer } from "./types";

export type BackpackKind = "asset" | "deck" | "pack";

/** One saved layer. Piles keep their cards (last = top) and packs the cards they can give. */
export type BackpackEntry = { layer: Layer; cards?: Card[] | PackCard[] };

/**
 * A saved selection, back to front. Positions are relative to the selection's top-left corner, so
 * placing it anywhere is just an offset. Layers keep their group ids; placing gives them new ones.
 */
export type BackpackData = { entries: BackpackEntry[] };

/** What the backpack list shows for an item, so the list doesn't need every item's full data. */
export type BackpackPreview = {
  // How many cards a deck or pack has, or how many pieces an asset has.
  count: number;
  // The card to show: a lone card, a deck's top card, or an asset's first card or image.
  card?: Card;
  pack?: Pick<PackLayer, "name" | "size" | "color" | "cover">;
  // For an asset without any picture, the kind of its first piece.
  type?: LayerType;
};

export type BackpackSummary = {
  id: string;
  name: string;
  kind: BackpackKind;
  preview: BackpackPreview;
  updatedAt: string;
};

// The upload route's `clientPayload` for images going straight into your backpack instead of a board.
export const BACKPACK_UPLOAD = "backpack";

export const MAX_BACKPACK_ITEMS = 200;
export const MAX_ITEM_NAME = 60;
export const MAX_ITEM_LAYERS = 500;
export const MAX_ITEM_CARDS = 1000;
// Server actions take at most 1 MB per request, so items stay well under that.
export const MAX_ITEM_CHARS = 750_000;

export const KIND_NAMES: Record<BackpackKind, string> = { asset: "Asset", deck: "Deck", pack: "Pack" };

/** A lone pile is a deck and a lone pack is a pack. Everything else (cards, pieces, mixes) is an asset. */
export function kindOf(data: BackpackData): BackpackKind {
  if (data.entries.length === 1) {
    const type = data.entries[0].layer.type;
    if (type === "pile") return "deck";
    if (type === "pack") return "pack";
  }
  return "asset";
}

export function previewOf(data: BackpackData): BackpackPreview {
  const kind = kindOf(data);
  const first = data.entries[0];
  if (kind === "deck") {
    const cards = first.cards ?? [];
    return { count: cards.length, ...(cards.length > 0 ? { card: plainCard(cards[cards.length - 1]) } : {}) };
  }
  if (kind === "pack" && first.layer.type === "pack") {
    const { name, size, color, cover } = first.layer;
    return { count: first.cards?.length ?? 0, pack: { name, size, color, ...(cover ? { cover } : {}) } };
  }
  const image = data.entries.find((e) => e.layer.type === "image")?.layer;
  return {
    count: data.entries.length,
    ...(image?.type === "image" ? { card: uprightCard(image) } : { type: first?.layer.type }),
  };
}

/** "Deck · 40 cards", "Pack · 12 cards", "Asset · 3 pieces". */
export function describeItem(kind: BackpackKind, count: number) {
  const unit = kind === "asset" ? "piece" : "card";
  return `${KIND_NAMES[kind]} · ${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** A name to start from: the pile's or pack's name, "Card", or "3 pieces". */
export function defaultItemName(data: BackpackData) {
  if (data.entries.length === 1) {
    const layer = data.entries[0].layer;
    if (layer.type === "pile" || layer.type === "pack") return layer.name;
    if (layer.type === "image") return "Card";
    return layer.type[0].toUpperCase() + layer.type.slice(1);
  }
  return `${data.entries.length} pieces`;
}

/** Without a pack card's weight and guarantee. */
function plainCard(card: Readonly<Card>): Card {
  return {
    url: card.url,
    width: card.width,
    height: card.height,
    ...(card.crop ? { crop: { ...card.crop } } : {}),
    ...(card.finish ? { finish: card.finish } : {}),
  };
}

/** A board card as a card, turned back upright (like cardFromImage, which needs the Liveblocks client). */
function uprightCard(layer: Readonly<ImageLayer>): Card {
  const sideways = (layer.rotation ?? 0) % 180 !== 0;
  return plainCard({
    ...layer,
    width: sideways ? layer.height : layer.width,
    height: sideways ? layer.width : layer.height,
  });
}

/** Moves layers so their bounds start at (0, 0), keeping the board's back-to-front order. */
export function relativeEntries(entries: readonly BackpackEntry[]): BackpackEntry[] {
  const left = Math.min(...entries.map((e) => e.layer.x));
  const top = Math.min(...entries.map((e) => e.layer.y));
  return entries.map((e) => ({ ...e, layer: { ...e.layer, x: e.layer.x - left, y: e.layer.y - top } }));
}

/** A card from your hand, as an item. */
export function dataFromCard(card: Readonly<Card>): BackpackData {
  return { entries: [{ layer: { type: "image", x: 0, y: 0, ...plainCard(card) } }] };
}

/** The size of an item's layers together. */
export function itemSize(data: BackpackData) {
  return {
    width: Math.max(0, ...data.entries.map((e) => e.layer.x + e.layer.width)),
    height: Math.max(0, ...data.entries.map((e) => e.layer.y + e.layer.height)),
  };
}
