import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="max-w-sm text-zinc-600">
        This page doesn&apos;t exist, or it&apos;s a board you haven&apos;t been invited to.
      </p>
      <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong">
        Go to your boards
      </Link>
    </main>
  );
}
