"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteBoard, leaveBoard, renameBoard } from "@/app/actions/boards";
import type { BoardSummary } from "@/lib/boards";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function BoardCard({ board }: { board: BoardSummary }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await renameBoard(board.id, name);
      if (result?.error) setError(result.error);
      else {
        setError(undefined);
        setEditing(false);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${board.name}"? This removes it for everyone and can't be undone.`)) return;
    startTransition(async () => {
      await deleteBoard(board.id);
    });
  }

  function handleLeave() {
    if (!confirm(`Leave "${board.name}"? You'll need a new invite to get back in.`)) return;
    startTransition(async () => {
      await leaveBoard(board.id);
    });
  }

  return (
    <div
      className={`group flex h-40 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-brand/50 hover:shadow-md ${pending ? "opacity-60" : ""}`}
    >
      <Link
        href={`/board/${board.id}`}
        className="flex-1 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:14px_14px]"
        aria-label={`Open ${board.name}`}
      />
      <div className="border-t border-zinc-100 px-4 py-3">
        {editing ? (
          <form onSubmit={submitRename} className="flex flex-col gap-1">
            <div className="flex gap-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={80}
                className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-brand"
              />
              <button className="rounded bg-brand px-2 text-xs font-medium text-white">Save</button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(board.name);
                  setError(undefined);
                }}
                className="rounded px-2 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/board/${board.id}`} className="block truncate font-medium hover:text-brand">
                {board.name}
              </Link>
              <p className="truncate text-xs text-zinc-500">
                {board.isOwner ? "Created" : `By ${board.ownerName} ·`} {dateFormat.format(board.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              {board.isOwner ? (
                <>
                  <IconButton label="Rename" onClick={() => setEditing(true)}>
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
                  </IconButton>
                  <IconButton label="Delete" onClick={handleDelete} danger>
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </IconButton>
                </>
              ) : (
                <IconButton label="Leave board" onClick={handleLeave} danger>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </IconButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 ${danger ? "hover:text-red-600" : "hover:text-zinc-900"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
