"use client";

import { useState, useTransition } from "react";
import { inviteMember, leaveBoard, removeMember } from "@/app/actions/boards";
import { Icon } from "./Icon";

export type BoardInfo = {
  id: string;
  name: string;
  isOwner: boolean;
  owner: { id: string; username: string };
  members: { id: string; username: string }[];
};

export function ShareDialog({ board, onClose }: { board: BoardInfo; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    startTransition(async () => {
      const result = await inviteMember(board.id, username);
      if (result?.error) setError(result.error);
      else {
        setError(undefined);
        setUsername("");
      }
    });
  }

  function remove(memberId: string) {
    startTransition(async () => {
      await removeMember(board.id, memberId);
    });
  }

  function leave() {
    if (!confirm(`Leave "${board.name}"? You'll need a new invite to get back in.`)) return;
    startTransition(async () => {
      await leaveBoard(board.id);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div role="dialog" aria-modal aria-labelledby="share-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-semibold">
            Share “{board.name}”
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>

        {board.isOwner ? (
          <form onSubmit={invite} className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Friend's username"
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                disabled={pending || !username.trim()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
              >
                Invite
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-zinc-500">Everyone you invite can edit this board.</p>
          </form>
        ) : (
          <p className="text-sm text-zinc-600">Only the owner can invite people to this board.</p>
        )}

        <ul className={`mt-5 flex flex-col divide-y divide-zinc-100 ${pending ? "opacity-60" : ""}`}>
          <PersonRow name={board.owner.username} role="Owner" />
          {board.members.map((m) => (
            <PersonRow key={m.id} name={m.username} role="Editor">
              {board.isOwner && (
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </PersonRow>
          ))}
        </ul>

        {!board.isOwner && (
          <button
            type="button"
            onClick={leave}
            className="mt-4 w-full rounded-lg border border-zinc-300 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Leave board
          </button>
        )}
      </div>
    </div>
  );
}

function PersonRow({ name, role, children }: { name: string; role: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-zinc-200 text-sm font-semibold uppercase text-zinc-700">
        {name[0]}
      </span>
      <span className="flex-1 text-sm font-medium">{name}</span>
      <span className="text-xs text-zinc-500">{role}</span>
      {children}
    </li>
  );
}
