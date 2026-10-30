"use client";

import { shallow, useOthersMapped, useSelf } from "@liveblocks/react/suspense";
import Link from "next/link";
import { Icon } from "./Icon";

export function BoardHeader({ name, onShare }: { name: string; onShare: () => void }) {
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
        <span className="max-w-[40vw] truncate text-sm font-semibold">{name}</span>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1 pl-2 shadow-md">
        <Avatars />
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          <Icon name="share" className="size-4" />
          Share
        </button>
      </div>
    </>
  );
}

const MAX_AVATARS = 4;

function Avatars() {
  const me = useSelf((s) => ({ id: s.id, name: s.info.name, color: s.info.color }), shallow);
  const others = useOthersMapped((o) => ({ id: o.id, name: o.info.name, color: o.info.color }), shallow);

  // The same person can be connected from several tabs; show them once.
  const seen = new Set([me.id]);
  const people = [];
  for (const [, o] of others) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    people.push(o);
  }
  const extra = people.length - MAX_AVATARS;

  return (
    <div className="flex -space-x-2">
      {people.slice(0, MAX_AVATARS).map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} />
      ))}
      {extra > 0 && (
        <span className="grid size-8 place-items-center rounded-full border-2 border-white bg-zinc-200 text-xs font-semibold text-zinc-700">
          +{extra}
        </span>
      )}
      <Avatar name={`${me.name} (you)`} color={me.color} />
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      title={name}
      className="grid size-8 place-items-center rounded-full border-2 border-white text-sm font-semibold uppercase text-white"
      style={{ background: color }}
    >
      {name[0]}
    </span>
  );
}
