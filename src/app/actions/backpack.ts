"use server";

import { z } from "zod";
import {
  MAX_BACKPACK_ITEMS,
  MAX_ITEM_CARDS,
  MAX_ITEM_CHARS,
  MAX_ITEM_LAYERS,
  MAX_ITEM_NAME,
  kindOf,
  previewOf,
  type BackpackData,
  type BackpackSummary,
} from "@/components/board/backpack";
import type { LayerType } from "@/components/board/types";
import type { Prisma } from "@/generated/prisma/client";
import { listBackpackItems, summaryFields, toSummary } from "@/lib/backpack";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type BackpackResult = { error: string; item?: undefined } | { error?: undefined; item: BackpackSummary };

const LAYER_TYPES = [
  "rectangle",
  "ellipse",
  "path",
  "line",
  "arrow",
  "text",
  "image",
  "pile",
  "counter",
  "die",
  "coin",
  "pawn",
  "chip",
  "timer",
  "pack",
] as const satisfies readonly LayerType[];

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(MAX_ITEM_NAME, `Names can be at most ${MAX_ITEM_NAME} characters.`);

// The board draws whatever it's given, so this checks the shape of things rather than every field:
// each layer has a known type and a box, and each card a picture and a size. Unknown extra fields on
// layers (each type has its own) are kept; anything else is dropped.
const cardSchema = z.looseObject({
  url: z.string().min(1).max(2048),
  width: z.number().positive(),
  height: z.number().positive(),
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  finish: z.enum(["foil", "holo"]).optional(),
});

const dataSchema = z.object({
  entries: z
    .array(
      z.object({
        layer: z.looseObject({
          type: z.enum(LAYER_TYPES),
          x: z.number(),
          y: z.number(),
          width: z.number().min(0),
          height: z.number().min(0),
        }),
        cards: z.array(cardSchema).max(MAX_ITEM_CARDS, `A deck or pack can hold at most ${MAX_ITEM_CARDS} cards.`).optional(),
      }),
    )
    .min(1, "There's nothing to save.")
    .max(MAX_ITEM_LAYERS, `An item can hold at most ${MAX_ITEM_LAYERS} pieces.`),
});

/** The checked data, ready to store, or why it can't be. */
function parseData(data: unknown): { error: string } | { data: BackpackData } {
  const parsed = dataSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (JSON.stringify(parsed.data).length > MAX_ITEM_CHARS) return { error: "That's too big to fit in your backpack." };
  return { data: parsed.data as unknown as BackpackData };
}

function stored(data: BackpackData) {
  return {
    kind: kindOf(data),
    data: data as unknown as Prisma.InputJsonValue,
    preview: previewOf(data) as unknown as Prisma.InputJsonValue,
  };
}

export async function listBackpack(): Promise<BackpackSummary[]> {
  const user = await requireUser();
  return listBackpackItems(user.userId);
}

/** One of your items with everything in it, or null if it's gone. */
export async function getBackpackItem(id: string): Promise<{ name: string; data: BackpackData } | null> {
  const user = await requireUser();
  const item = await db.backpackItem.findFirst({ where: { id, ownerId: user.userId }, select: { name: true, data: true } });
  return item ? { name: item.name, data: item.data as unknown as BackpackData } : null;
}

export async function saveToBackpack(name: string, data: BackpackData): Promise<BackpackResult> {
  const user = await requireUser();
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: parsedName.error.issues[0].message };
  const parsed = parseData(data);
  if ("error" in parsed) return parsed;

  const count = await db.backpackItem.count({ where: { ownerId: user.userId } });
  if (count >= MAX_BACKPACK_ITEMS) {
    return { error: `Your backpack is full (${MAX_BACKPACK_ITEMS} items). Delete something to make room.` };
  }
  const item = await db.backpackItem.create({
    data: { ownerId: user.userId, name: parsedName.data, ...stored(parsed.data) },
    select: summaryFields,
  });
  return { item: toSummary(item) };
}

/** Swaps an item's contents for new ones, keeping its name. */
export async function replaceBackpackItem(id: string, data: BackpackData): Promise<BackpackResult> {
  const user = await requireUser();
  const parsed = parseData(data);
  if ("error" in parsed) return parsed;
  return updateOwned(id, user.userId, stored(parsed.data));
}

export async function renameBackpackItem(id: string, name: string): Promise<BackpackResult> {
  const user = await requireUser();
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: parsedName.error.issues[0].message };
  return updateOwned(id, user.userId, { name: parsedName.data });
}

export async function deleteBackpackItem(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  await db.backpackItem.deleteMany({ where: { id, ownerId: user.userId } });
  return {};
}

async function updateOwned(id: string, ownerId: string, data: Prisma.BackpackItemUpdateManyMutationInput): Promise<BackpackResult> {
  const { count } = await db.backpackItem.updateMany({ where: { id, ownerId }, data });
  if (count === 0) return { error: "That item isn't in your backpack anymore." };
  const item = await db.backpackItem.findUniqueOrThrow({ where: { id }, select: summaryFields });
  return { item: toSummary(item) };
}
