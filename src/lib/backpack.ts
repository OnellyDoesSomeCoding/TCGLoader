import "server-only";
import type { BackpackKind, BackpackPreview, BackpackSummary } from "@/components/board/backpack";
import { db } from "./db";

const summaryFields = { id: true, name: true, kind: true, preview: true, updatedAt: true } as const;

type SummaryRow = { id: string; name: string; kind: string; preview: unknown; updatedAt: Date };

export function toSummary(row: SummaryRow): BackpackSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as BackpackKind,
    preview: row.preview as BackpackPreview,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A user's backpack, most recently changed first, without each item's full data. */
export async function listBackpackItems(userId: string): Promise<BackpackSummary[]> {
  const rows = await db.backpackItem.findMany({
    where: { ownerId: userId },
    select: summaryFields,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toSummary);
}

export { summaryFields };
