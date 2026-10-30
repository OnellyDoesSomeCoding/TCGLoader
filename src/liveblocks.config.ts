import type { LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import type { Layer, Point } from "@/components/board/types";

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
    };
    UserMeta: {
      id: string;
      info: { name: string; color: string };
    };
  }
}

export {};
