import "server-only";
import { Liveblocks } from "@liveblocks/node";

let client: Liveblocks | null = null;

export function getLiveblocks() {
  if (!client) {
    const secret = process.env.LIVEBLOCKS_SECRET_KEY;
    if (!secret) throw new Error("LIVEBLOCKS_SECRET_KEY is not set");
    client = new Liveblocks({ secret });
  }
  return client;
}

const CURSOR_COLORS = [
  "#E5484D",
  "#F76B15",
  "#FFB224",
  "#30A46C",
  "#12A594",
  "#0090FF",
  "#3E63DD",
  "#8E4EC6",
  "#D6409F",
];

/** Gives each user a stable cursor color. */
export function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}
