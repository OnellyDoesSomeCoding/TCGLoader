"use client";

import { LiveList, LiveMap } from "@liveblocks/client";
import { ClientSideSuspense, LiveblocksProvider, RoomProvider } from "@liveblocks/react/suspense";
import { Canvas } from "./Canvas";
import type { BoardInfo } from "./ShareDialog";

export function BoardRoom({ board }: { board: BoardInfo }) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" throttle={16}>
      <RoomProvider
        id={`board:${board.id}`}
        initialPresence={{ cursor: null, selection: [], pencilDraft: null, pencilColor: "#1e1e1e", pencilWidth: 4 }}
        initialStorage={{ layers: new LiveMap(), layerIds: new LiveList([]), piles: new LiveMap(), hands: new LiveMap() }}
      >
        <ClientSideSuspense fallback={<BoardLoading />}>
          <Canvas board={board} />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}

export function BoardLoading() {
  return (
    <div className="grid h-dvh place-items-center bg-[#f7f7f8]">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-brand" />
        Loading board…
      </div>
    </div>
  );
}
