"use client";

import { useActionState } from "react";
import { createBoard } from "@/app/actions/boards";

export function CreateBoardForm() {
  const [state, action, pending] = useActionState(createBoard, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <input
          name="name"
          placeholder="New board name"
          maxLength={80}
          className="w-56 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Creating…" : "+ New board"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
