import { boardIdFromRoom, canAccessBoard } from "@/lib/boards";
import { colorForUser, getLiveblocks } from "@/lib/liveblocks";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });

  const { room } = (await request.json().catch(() => ({}))) as { room?: string };
  const boardId = room ? boardIdFromRoom(room) : null;
  if (!room || !boardId || !(await canAccessBoard(boardId, user.userId))) {
    return new Response("You don't have access to this board", { status: 403 });
  }

  const liveblocks = getLiveblocks();
  const session = liveblocks.prepareSession(user.userId, {
    userInfo: { name: user.username, color: colorForUser(user.userId) },
  });
  session.allow(room, session.FULL_ACCESS);

  const { status, body } = await session.authorize();
  return new Response(body, { status });
}
