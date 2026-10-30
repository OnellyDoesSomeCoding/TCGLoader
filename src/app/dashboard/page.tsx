import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { listBoardsForUser, type BoardSummary } from "@/lib/boards";
import { requireUser } from "@/lib/session";
import { BoardCard } from "./BoardCard";
import { CreateBoardForm } from "./CreateBoardForm";

export const metadata = { title: "Your boards · TCGLoader" };

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo href="/dashboard" />
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Your boards</h1>
          <CreateBoardForm />
        </div>
        <Suspense fallback={<BoardsSkeleton />}>
          <BoardLists />
        </Suspense>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-600">
        Signed in as <span className="font-medium text-zinc-900">{user.username}</span>
      </span>
      <form action={logout}>
        <button className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50">
          Log out
        </button>
      </form>
    </div>
  );
}

async function BoardLists() {
  const user = await requireUser();
  const { owned, shared } = await listBoardsForUser(user.userId);
  return (
    <>
      <BoardSection
        title="My boards"
        boards={owned}
        empty="You don't have any boards yet. Create one to get started."
      />
      <BoardSection
        title="Shared with me"
        boards={shared}
        empty="Boards your friends invite you to will show up here."
      />
    </>
  );
}

function BoardSection({ title, boards, empty }: { title: string; boards: BoardSummary[]; empty: string }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {boards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500">
          {empty}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {boards.map((b) => (
            <li key={b.id}>
              <BoardCard board={b} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BoardsSkeleton() {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-zinc-200/70" />
      ))}
    </div>
  );
}
