import type { LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import type { Card, Layer, Point } from "@/components/board/types";

declare global {
  interface Liveblocks {
    Presence: {
      cursor: Point | null;
      selection: string[];
      // The stroke someone is drawing right now, before it becomes a layer.
      pencilDraft: number[][] | null;
      pencilColor: string;
      pencilWidth: number;
    };
    Storage: {
      layers: LiveMap<string, LiveObject<Layer>>;
      // Paint order, back to front.
      layerIds: LiveList<string>;
      // Cards in each pile, keyed by the pile layer's id. The last card is the top.
      // Optional because boards created before piles existed don't have them yet.
      piles?: LiveMap<string, LiveList<Card>>;
      // Cards in each person's hand, keyed by user id.
      hands?: LiveMap<string, LiveList<Card>>;
    };
    UserMeta: {
      id: string;
      info: { name: string; color: string };
    };
  }
}

export {};
