import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BoardLoading, BoardRoom } from "@/components/board/BoardRoom";
import { getBoardAccess } from "@/lib/boards";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Board · TCGLoader" };

export default function BoardPage({ params }: PageProps<"/board/[id]">) {
  return (
    <Suspense fallback={<BoardLoading />}>
      <BoardLoader params={params} />
    </Suspense>
  );
}

async function BoardLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const board = await getBoardAccess(id, user.userId);
  // Same response whether the board doesn't exist or you weren't invited.
  if (!board) notFound();
  return <BoardRoom board={board} />;
}
