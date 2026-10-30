import "server-only";
import { db } from "./db";

export type BoardSummary = {
  id: string;
  name: string;
  createdAt: Date;
  ownerName: string;
  isOwner: boolean;
};

export type BoardAccess = {
  id: string;
  name: string;
  isOwner: boolean;
  owner: { id: string; username: string };
  members: { id: string; username: string }[];
};

export function roomIdForBoard(boardId: string) {
  return `board:${boardId}`;
}

export function boardIdFromRoom(roomId: string) {
  return roomId.startsWith("board:") ? roomId.slice("board:".length) : null;
}

export async function listBoardsForUser(userId: string) {
  const boards = await db.board.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    include: { owner: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
  });

  const summaries: BoardSummary[] = boards.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    ownerName: b.owner.username,
    isOwner: b.ownerId === userId,
  }));

  return {
    owned: summaries.filter((b) => b.isOwner),
    shared: summaries.filter((b) => !b.isOwner),
  };
}

/** Returns the board if the user owns it or was invited to it, otherwise null. */
export async function getBoardAccess(
  boardId: string,
  userId: string,
): Promise<BoardAccess | null> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: {
      owner: { select: { id: true, username: true } },
      members: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!board) return null;

  const isOwner = board.ownerId === userId;
  const isMember = board.members.some((m) => m.userId === userId);
  if (!isOwner && !isMember) return null;

  return {
    id: board.id,
    name: board.name,
    isOwner,
    owner: board.owner,
    members: board.members.map((m) => m.user),
  };
}

export async function canAccessBoard(boardId: string, userId: string) {
  const count = await db.board.count({
    where: {
      id: boardId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
  });
  return count > 0;
}
