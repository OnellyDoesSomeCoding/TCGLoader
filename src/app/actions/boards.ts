"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { roomIdForBoard } from "@/lib/boards";
import { db } from "@/lib/db";
import { getLiveblocks } from "@/lib/liveblocks";
import { requireUser } from "@/lib/session";

export type ActionResult = { error?: string; ok?: boolean } | undefined;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Board name can't be empty.")
  .max(80, "Board name must be at most 80 characters.");

async function requireOwnedBoard(boardId: string, userId: string) {
  const board = await db.board.findFirst({ where: { id: boardId, ownerId: userId } });
  if (!board) throw new Error("Board not found or you are not the owner.");
  return board;
}

export async function createBoard(_state: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(formData.get("name") || "Untitled board");
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const board = await db.board.create({ data: { name: parsed.data, ownerId: user.userId } });
  redirect(`/board/${board.id}`);
}

export async function renameBoard(boardId: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await requireOwnedBoard(boardId, user.userId);
  await db.board.update({ where: { id: boardId }, data: { name: parsed.data } });
  refresh();
  return { ok: true };
}

export async function deleteBoard(boardId: string): Promise<ActionResult> {
  const user = await requireUser();
  await requireOwnedBoard(boardId, user.userId);
  await db.board.delete({ where: { id: boardId } });

  // The board's drawing lives in Liveblocks; remove it too. A missing room is fine.
  try {
    await getLiveblocks().deleteRoom(roomIdForBoard(boardId));
  } catch {}

  refresh();
  return { ok: true };
}

export async function inviteMember(boardId: string, username: string): Promise<ActionResult> {
  const user = await requireUser();
  const board = await requireOwnedBoard(boardId, user.userId);

  const target = await db.user.findFirst({
    where: { username: { equals: username.trim(), mode: "insensitive" } },
    select: { id: true, username: true },
  });
  if (!target) return { error: `No user named "${username.trim()}".` };
  if (target.id === board.ownerId) return { error: "You already own this board." };

  await db.boardMember.upsert({
    where: { boardId_userId: { boardId, userId: target.id } },
    create: { boardId, userId: target.id },
    update: {},
  });
  refresh();
  return { ok: true };
}

export async function removeMember(boardId: string, memberId: string): Promise<ActionResult> {
  const user = await requireUser();
  await requireOwnedBoard(boardId, user.userId);
  await db.boardMember.deleteMany({ where: { boardId, userId: memberId } });
  refresh();
  return { ok: true };
}

export async function leaveBoard(boardId: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.boardMember.deleteMany({ where: { boardId, userId: user.userId } });
  redirect("/dashboard");
}
