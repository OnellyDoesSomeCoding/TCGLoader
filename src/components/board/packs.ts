import { LiveList, LiveMap, type LiveObject } from "@liveblocks/client";
import type { Card, PackCard, PackLayer, Point } from "./types";

type Root = LiveObject<Liveblocks["Storage"]>;

// A little bigger than a new pile (160 × 224), and taller, like a foil booster.
export const PACK_SIZE = { width: 180, height: 290 };
export const MIN_PACK_CARDS = 1;
export const MAX_PACK_CARDS = 20;
export const MAX_WEIGHT = 9999;
export const MAX_PACK_COPIES = 50;
const PACK_COLOR = "#7048e8";

// Cards in the ring around an opened pack sit this far apart, as a share of their size,
// so they overlap a little instead of the ring growing huge for big packs.
const RING_SPACING = 0.75;
const RING_CLEARANCE = 16;

/** A new, empty pack centered on `center`. */
export function newPack(center: Point): PackLayer {
  const { width, height } = PACK_SIZE;
  return {
    type: "pack",
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    name: "Card pack",
    size: 10,
    allowDuplicates: false,
    color: PACK_COLOR,
  };
}

/** The cards a pack can give, created if missing. */
export function packCards(storage: Root, packId: string) {
  let map = storage.get("packs");
  if (!map) {
    map = new LiveMap<string, LiveList<PackCard>>();
    storage.set("packs", map);
  }
  let list = map.get(packId);
  if (!list) {
    list = new LiveList<PackCard>([]);
    map.set(packId, list);
  }
  return list;
}

/**
 * True when two cards are the same: the same image, the same part of it and the same finish. A foil
 * copy of a plain card is a card of its own, with its own weight.
 */
function sameCard(a: Readonly<Card>, b: Readonly<Card>) {
  if (a.url !== b.url || a.finish !== b.finish) return false;
  if (!a.crop || !b.crop) return !a.crop && !b.crop;
  return a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.width === b.crop.width && a.crop.height === b.crop.height;
}

/** Adds cards to a pack with weight 1, skipping ones it already has. Returns how many were added. */
export function addToPack(storage: Root, packId: string, cards: readonly Card[]) {
  const list = packCards(storage, packId);
  const known: Readonly<Card>[] = [...list.toJSON()];
  let added = 0;
  for (const card of cards) {
    if (known.some((c) => sameCard(c, card))) continue;
    const entry: PackCard = {
      url: card.url,
      width: card.width,
      height: card.height,
      ...(card.crop ? { crop: { ...card.crop } } : {}),
      ...(card.finish ? { finish: card.finish } : {}),
      weight: 1,
    };
    list.push(entry);
    known.push(entry);
    added++;
  }
  return added;
}

/** Index of a card picked at random, each card as likely as its weight. Weights must add up to more than 0. */
function pickIndex(cards: readonly PackCard[]) {
  const total = cards.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < cards.length; i++) {
    r -= cards[i].weight;
    if (r < 0) return i;
  }
  return cards.length - 1;
}

/**
 * The cards in one opened pack: `size` picks by weight. Without duplicates a pack gives each card at
 * most once, so it can come out smaller than `size`. If no guaranteed card came up, one random pick
 * is swapped for a guaranteed card.
 */
export function rollPack(cards: readonly PackCard[], size: number, allowDuplicates: boolean): PackCard[] {
  const pool = cards.filter((c) => c.weight > 0);
  const left = [...pool];
  const picked: PackCard[] = [];
  while (picked.length < size && left.length > 0) {
    const i = pickIndex(left);
    picked.push(left[i]);
    if (!allowDuplicates) left.splice(i, 1);
  }
  const guaranteed = pool.filter((c) => c.guaranteed);
  if (guaranteed.length > 0 && picked.length > 0 && !picked.some((c) => c.guaranteed)) {
    picked[Math.floor(Math.random() * picked.length)] = guaranteed[pickIndex(guaranteed)];
  }
  return picked;
}

/**
 * Where each card from an opened pack lands: evenly around an oval centered on the pack, starting at
 * the top and going clockwise. The oval has the cards' proportions and clears the pack's footprint.
 */
export function ringAround(pack: Readonly<PackLayer>, cards: readonly Card[]): Point[] {
  const center = { x: pack.x + pack.width / 2, y: pack.y + pack.height / 2 };
  const n = cards.length;
  if (n === 1) return [center];
  const w = Math.max(...cards.map((c) => c.width));
  const h = Math.max(...cards.map((c) => c.height));
  // Distance between neighbors on a unit circle.
  const chord = 2 * Math.sin(Math.PI / n);
  const k = Math.max(
    RING_SPACING / chord,
    (pack.width / 2 + w / 2 + RING_CLEARANCE) / w,
    (pack.height / 2 + h / 2 + RING_CLEARANCE) / h,
  );
  return cards.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: center.x + k * w * Math.cos(angle), y: center.y + k * h * Math.sin(angle) };
  });
}
