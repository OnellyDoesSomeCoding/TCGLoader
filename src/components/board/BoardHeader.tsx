"use client";

import { shallow, useOthersMapped, useSelf, useStorage } from "@liveblocks/react/suspense";
import Link from "next/link";
import { Icon } from "./Icon";

/** The board name and the way back, and who's here with the Share button. `compact` fits them on a phone. */
export function BoardHeader({ name, compact, onShare }: { name: string; compact: boolean; onShare: () => void }) {
  return (
    <>
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white py-1 pl-1 pr-3 shadow-md">
        <Link
          href="/dashboard"
          title="Back to your boards"
          className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100"
        >
          <Icon name="back_arrow" />
        </Link>
        <span className={`truncate text-sm font-semibold ${compact ? "max-w-[30vw]" : "max-w-[40vw]"}`}>{name}</span>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1 pl-2 shadow-md">
        <Avatars max={compact ? 2 : 4} />
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          title="Share"
          className={`flex items-center gap-1.5 rounded-lg bg-brand py-1.5 text-sm font-medium text-white hover:bg-brand-strong ${compact ? "px-2" : "px-3"}`}
        >
          <Icon name="share" className="size-4" />
          {!compact && "Share"}
        </button>
      </div>
    </>
  );
}

/** Everyone on the board, you last. `max`: how many others to show before "+3". */
function Avatars({ max }: { max: number }) {
  const me = useSelf((s) => ({ id: s.id, name: s.info.name, color: s.info.color }), shallow);
  const others = useOthersMapped((o) => ({ id: o.id, name: o.info.name, color: o.info.color }), shallow);
  // How many cards each person holds; everyone can see the counts, not the cards.
  const handSizes = useStorage((root) => {
    const sizes: Record<string, number> = {};
    for (const [userId, cards] of Object.entries(root.hands ?? {})) sizes[userId] = cards.length;
    return sizes;
  }, shallow);

  // The same person can be connected from several tabs; show them once.
  const seen = new Set([me.id]);
  const people = [];
  for (const [, o] of others) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    people.push(o);
  }
  const extra = people.length - max;

  return (
    <div className="flex -space-x-2">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} cards={handSizes[p.id] ?? 0} />
      ))}
      {extra > 0 && (
        <span className="grid size-8 place-items-center rounded-full border-2 border-white bg-zinc-200 text-xs font-semibold text-zinc-700">
          +{extra}
        </span>
      )}
      <Avatar name={`${me.name} (you)`} color={me.color} cards={handSizes[me.id] ?? 0} />
    </div>
  );
}

function Avatar({ name, color, cards }: { name: string; color: string; cards: number }) {
  return (
    <span className="relative" title={`${name} · ${cards} card${cards === 1 ? "" : "s"} in hand`}>
      <span
        className="grid size-8 place-items-center rounded-full border-2 border-white text-sm font-semibold uppercase text-white"
        style={{ background: color }}
      >
        {name[0]}
      </span>
      {cards > 0 && (
        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-white bg-indigo-900 px-0.5 text-[10px] font-bold leading-none text-white">
          {cards}
        </span>
      )}
    </span>
  );
}
