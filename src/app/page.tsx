import Link from "next/link";
import { Logo } from "@/components/Logo";

const features = [
  { title: "Draw and sketch", text: "Freehand pen, shapes, lines, arrows and text boxes on an infinite canvas." },
  { title: "Drop in images", text: "Upload, drag and drop or paste images straight onto your board." },
  { title: "Edit together", text: "Invite friends by username and see their cursors and changes live." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-200/60">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 pb-20 pt-16 text-center">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          A shared whiteboard for you and your friends
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-600">
          Create boards, sketch ideas, lay out decks and plan together in real time.
        </p>
        <div className="mt-10 flex gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-strong"
          >
            Create your first board
          </Link>
          <Link href="/login" className="rounded-lg border border-zinc-300 bg-white px-6 py-3 font-medium hover:bg-zinc-50">
            I have an account
          </Link>
        </div>

        <div className="mt-20 grid w-full gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-6 text-left">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
