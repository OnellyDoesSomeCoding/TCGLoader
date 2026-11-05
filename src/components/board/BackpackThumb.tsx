"use client";

import type { BackpackPreview } from "./backpack";
import { CardImage } from "./CardArt";
import { Icon, type IconName } from "./Icon";
import { PACK_SIZE } from "./packs";
import { PackImage } from "./PackArt";
import type { LayerType } from "./types";

const TYPE_ICONS: Record<LayerType, IconName> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  path: "pen",
  line: "line",
  arrow: "arrow",
  text: "text",
  image: "image",
  pile: "pile",
  counter: "counter",
  die: "die",
  coin: "coin",
  pawn: "pawn",
  chip: "chip",
  timer: "timer",
  pack: "pack",
};

/** A backpack item's picture, fitted in a `width` × `height` box: its card, its pack, or an icon. */
export function BackpackThumb({ preview, width, height }: { preview: BackpackPreview; width: number; height: number }) {
  let content: React.ReactNode;
  if (preview.pack) {
    const scale = Math.min(width / PACK_SIZE.width, height / PACK_SIZE.height);
    content = <PackImage pack={preview.pack} width={PACK_SIZE.width * scale} height={PACK_SIZE.height * scale} />;
  } else if (preview.card) {
    const { card } = preview;
    const scale = Math.min(width / card.width, height / card.height);
    content = (
      <span className="overflow-hidden rounded-[3px] ring-1 ring-black/10">
        <CardImage card={card} width={Math.round(card.width * scale)} height={Math.round(card.height * scale)} />
      </span>
    );
  } else {
    content = (
      <span className="grid size-full place-items-center rounded-md bg-zinc-100 text-zinc-500">
        <Icon name={TYPE_ICONS[preview.type ?? "pile"]} className="size-6" />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center" style={{ width, height }}>
      {content}
    </span>
  );
}
