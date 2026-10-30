import { LiveList, LiveMap, type LiveObject } from "@liveblocks/client";
import type { Card, Crop, ImageLayer } from "./types";

type Root = LiveObject<Liveblocks["Storage"]>;
type CardLike = { url: string; width: number; height: number; crop?: Readonly<Crop>; rotation?: number };

export const DEFAULT_PILE_SIZE = { width: 160, height: 224 };

/** Board size for a card cut from `width`×`height` source pixels: as tall as a new pile, same aspect ratio. */
export function cardSizeFor(width: number, height: number) {
  return { width: (width / height) * DEFAULT_PILE_SIZE.height, height: DEFAULT_PILE_SIZE.height };
}

function cardMap(storage: Root, key: "piles" | "hands") {
  let map = storage.get(key);
  if (!map) {
    map = new LiveMap<string, LiveList<Card>>();
    storage.set(key, map);
  }
  return map;
}

function cardList(storage: Root, key: "piles" | "hands", id: string) {
  const map = cardMap(storage, key);
  let list = map.get(id);
  if (!list) {
    list = new LiveList<Card>([]);
    map.set(id, list);
  }
  return list;
}

/** The cards in a pile (last = top), created if missing. */
export function pileCards(storage: Root, pileId: string) {
  return cardList(storage, "piles", pileId);
}

/** The cards in someone's hand, created if missing. */
export function handCards(storage: Root, userId: string) {
  return cardList(storage, "hands", userId);
}

/** Creates the card maps on boards made before hands and piles existed. Returns true if it did. */
export function ensureCardStorage(storage: Root) {
  const missing = !storage.get("piles") || !storage.get("hands");
  cardMap(storage, "piles");
  cardMap(storage, "hands");
  return missing;
}

/** Where a card taken from a pile goes on the board: just to the pile's right. */
export function besidePile(storage: Root, pileId: string, card: CardLike) {
  const pile = storage.get("layers").get(pileId)?.toJSON();
  if (!pile) return { x: 0, y: 0 };
  return { x: pile.x + pile.width + 24 + card.width / 2, y: pile.y + pile.height / 2 };
}

/** Removes a layer from the board, along with a pile's cards. */
export function removeLayer(storage: Root, id: string) {
  storage.get("layers").delete(id);
  storage.get("piles")?.delete(id);
  const order = storage.get("layerIds");
  const index = order.indexOf(id);
  if (index !== -1) order.delete(index);
}

/** Pops the top card off a list, if there is one. */
export function popTop(list: LiveList<Card>): Card | null {
  if (list.length === 0) return null;
  const card = list.get(list.length - 1)!;
  list.delete(list.length - 1);
  return card;
}

/** True when a card is turned on its side, so its footprint's width and height are swapped. */
export function isSideways(rotation: number | undefined) {
  return (rotation ?? 0) % 180 !== 0;
}

/** A board card as it goes into a pile or hand: turned back upright. */
export function cardFromImage(layer: CardLike): Card {
  const sideways = isSideways(layer.rotation);
  return {
    url: layer.url,
    width: sideways ? layer.height : layer.width,
    height: sideways ? layer.width : layer.height,
    ...(layer.crop ? { crop: { ...layer.crop } } : {}),
  };
}

/** An image layer for a card, centered on (cx, cy). */
export function imageFromCard(card: CardLike, cx: number, cy: number, faceDown: boolean): ImageLayer {
  return {
    type: "image",
    url: card.url,
    x: cx - card.width / 2,
    y: cy - card.height / 2,
    width: card.width,
    height: card.height,
    ...(card.crop ? { crop: { ...card.crop } } : {}),
    ...(faceDown ? { faceDown: true } : {}),
  };
}

export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
