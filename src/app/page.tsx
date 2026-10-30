import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/board/Icon";

const steps: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "sheet",
    title: "Upload your cards",
    text: "Drop in uncut card sheets or single card images. Drag and drop, paste, or pick files.",
  },
  {
    icon: "scissors",
    title: "Cut them into a deck",
    text: "Set columns and rows, plus a margin and gap if your sheet has them. The 10 × 7 preset fits Tabletop Simulator decks.",
  },
  {
    icon: "share",
    title: "Invite friends and play",
    text: "Add friends by username. Everyone joins the same table and sees every move as it happens.",
  },
];

const features: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "to_hand",
    title: "A hand only you can see",
    text: "Keep cards in a tray at the bottom of your screen. Everyone else only sees how many you're holding.",
  },
  {
    icon: "pile",
    title: "Draw and discard piles",
    text: "Draw one or several, take the top card, shuffle, or look through a pile without anyone else seeing.",
  },
  {
    icon: "flip",
    title: "Face up or face down",
    text: "Press F to flip a card or a whole pile, or hold Shift while dragging to play a card face down.",
  },
  {
    icon: "counter",
    title: "Counters for everything",
    text: "Track life, damage, mana or score with counters anyone at the table can tap up or down.",
  },
  {
    icon: "pen",
    title: "Sketch and annotate",
    text: "Pen, shapes, arrows and text boxes for rules notes, score sheets or pointing out a combo.",
  },
  {
    icon: "select",
    title: "Live cursors and presence",
    text: "See who's at the table, where they're pointing and what they've picked up, in real time.",
  },
];

const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ["F"], label: "Flip a card or pile" },
  { keys: ["Shift", "Drag"], label: "Play face down" },
  { keys: ["Ctrl", "Z"], label: "Undo your last move" },
  { keys: ["Space", "Drag"], label: "Pan the table" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#how-it-works" className="hidden rounded-lg px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 md:block">
              How it works
            </a>
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 md:block">
              Features
            </a>
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-200/60 sm:px-4">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-strong sm:px-4"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-10rem] h-[32rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
          />

          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-medium text-brand shadow-sm sm:text-sm">
              <span className="size-1.5 rounded-full bg-brand" />
              For TCGs, homebrew decks and game prototypes
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Play any card game online, <span className="text-brand">together.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base text-pretty text-zinc-600 sm:text-lg">
              Upload your card sheets, cut them into a deck in seconds and play on a shared table with friends. Hold
              a private hand, draw from piles, shuffle and flip cards, all in real time.
            </p>
            <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/signup"
                className="rounded-xl bg-brand px-6 py-3 font-medium text-white shadow-lg shadow-indigo-600/20 hover:bg-brand-strong"
              >
                Set up your table
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-zinc-300 bg-white px-6 py-3 font-medium hover:bg-zinc-50"
              >
                Log in to your boards
              </Link>
            </div>
            <p className="mt-4 text-sm text-zinc-500">Runs in your browser. All you need is a username and password.</p>

            <TablePreview />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-y border-zinc-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <SectionHeading
              eyebrow="How it works"
              title="From card sheet to game night in three steps"
              text="No scanning cards one by one. Cutting reuses your uploaded sheet, so it's instant and keeps full quality."
            />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border border-zinc-200 bg-background p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-sm">
                      <Icon name={s.icon} />
                    </span>
                    <span className="font-mono text-sm text-zinc-400">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <SectionHeading
              eyebrow="Features"
              title="Everything you need at the table"
              text="Any image on the board is a card. Pick it up, play it, stack it or flip it, just like a real table."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-2xl border border-zinc-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-900/5"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-brand transition group-hover:bg-brand group-hover:text-white">
                    <Icon name={f.icon} />
                  </span>
                  <h3 className="mt-5 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">{f.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold">Built for quick hands</h3>
                <p className="mt-1 text-sm text-zinc-600">Keyboard shortcuts for the moves you make every turn.</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:flex lg:gap-6">
                {shortcuts.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm text-zinc-600">
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-zinc-400">+</span>}
                          <kbd className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-800 shadow-[0_1px_0_#d4d4d8]">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </span>
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-900 px-6 py-16 text-center text-white shadow-xl shadow-indigo-900/20 sm:px-12">
            <div aria-hidden className="card-back-stripes pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Your table is ready when you are
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-indigo-100">
                Create an account, set up your first board and send the invite to your playgroup.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-xl bg-white px-6 py-3 font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                >
                  Create your first board
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-white/30 px-6 py-3 font-medium text-white hover:bg-white/10"
                >
                  I have an account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Logo />
            <span>Made for game nights, playtests and homebrew decks.</span>
          </div>
          <nav className="flex gap-4">
            <Link href="/login" className="hover:text-zinc-900">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-zinc-900">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-4 text-pretty text-zinc-600">{text}</p>
    </div>
  );
}

// ---------- Hero illustration: a static mock of a board mid-game ----------

const TONES = {
  amber: { bar: "bg-amber-200", art: "from-amber-300 to-orange-500", glyph: "M12 2l2.9 6.9L22 9.6l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.6L2 9.6l7.1-.7z" },
  sky: { bar: "bg-sky-200", art: "from-sky-300 to-blue-600", glyph: "M12 2c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z" },
  emerald: { bar: "bg-emerald-200", art: "from-emerald-300 to-teal-600", glyph: "M12 2l8 10-8 10-8-10z" },
  rose: { bar: "bg-rose-200", art: "from-rose-300 to-red-600", glyph: "M13 2L4 14h7l-1 8 9-12h-7z" },
  violet: { bar: "bg-violet-200", art: "from-violet-300 to-purple-600", glyph: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" },
} as const;

type Tone = keyof typeof TONES;

const HAND: { tone: Tone; tilt: string }[] = [
  { tone: "sky", tilt: "-rotate-[8deg] translate-y-2" },
  { tone: "amber", tilt: "-rotate-[4deg] translate-y-0.5" },
  { tone: "violet", tilt: "" },
  { tone: "emerald", tilt: "rotate-[4deg] translate-y-0.5" },
  { tone: "rose", tilt: "rotate-[8deg] translate-y-2" },
];

const TOOLBAR: IconName[] = ["select", "hand", "pen", "text", "rectangle"];
const TOOLBAR_CARDS: IconName[] = ["sheet", "load", "pile", "counter"];

function TablePreview() {
  return (
    <div className="relative mt-16 w-full max-w-5xl sm:mt-20" aria-hidden>
      <div className="pointer-events-none absolute -inset-x-6 -bottom-6 top-12 rounded-[2rem] bg-brand/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl shadow-indigo-950/10">
        {/* Board header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-zinc-400">
              <Icon name="back_arrow" className="size-4" />
            </span>
            <span className="truncate font-medium">Friday night game</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <Avatar initial="M" className="bg-rose-500" count={5} />
              <Avatar initial="J" className="bg-emerald-500" count={4} />
              <Avatar initial="S" className="bg-brand" />
            </div>
            <span className="hidden items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white sm:flex">
              <Icon name="share" className="size-3.5" />
              Share
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-dots relative aspect-[4/3] overflow-hidden bg-[#f7f7f8] sm:aspect-[16/9]">
          <div className="absolute left-3 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex">
            <div className="flex flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-md">
              {TOOLBAR.map((icon, i) => (
                <span
                  key={icon}
                  className={`grid size-7 place-items-center rounded-lg ${i === 0 ? "bg-brand text-white" : "text-zinc-600"}`}
                >
                  <Icon name={icon} className="size-4" />
                </span>
              ))}
              <span className="mx-1.5 my-0.5 border-t border-zinc-200" />
              {TOOLBAR_CARDS.map((icon) => (
                <span key={icon} className="grid size-7 place-items-center rounded-lg text-zinc-600">
                  <Icon name={icon} className="size-4" />
                </span>
              ))}
            </div>
          </div>

          {/* Draw pile */}
          <div className="absolute left-[6%] top-[10%] w-[14%] md:left-[11%] md:w-[12%]">
            <PileTab name="Draw pile" count={42} />
            <div className="relative">
              <div className="absolute inset-0 translate-x-[6%] translate-y-[5%]">
                <CardBack />
              </div>
              <div className="absolute inset-0 translate-x-[3%] translate-y-[2.5%]">
                <CardBack />
              </div>
              <div className="relative">
                <CardBack />
              </div>
            </div>
          </div>

          {/* "Pen" annotation pointing at the draw pile */}
          <div className="absolute left-[7%] top-[52%] flex items-start gap-1 text-rose-500 md:left-[12%]">
            <svg viewBox="0 0 40 40" className="size-6 sm:size-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M30 34C14 32 8 22 10 6M4 12l6-7 6 7" />
            </svg>
            <span className="mt-3 -rotate-6 text-xs font-semibold sm:mt-6 sm:text-base">your turn!</span>
          </div>

          {/* Cards in play */}
          <div className="absolute left-[29%] top-[18%] w-[14%] -rotate-[5deg] sm:left-[38%] md:w-[12%]">
            <CardFace tone="amber" />
          </div>
          <div className="absolute left-[44%] top-[22%] w-[14%] rotate-[4deg] sm:left-[47%] md:left-[50%] md:w-[12%]">
            <div className="rounded-lg ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#f7f7f8]">
              <CardFace tone="sky" />
            </div>
          </div>
          <div className="absolute left-[26%] top-[26%] hidden w-[10%] -rotate-[12deg] sm:block">
            <CardBack />
          </div>

          {/* Discard pile */}
          <div className="absolute right-[22%] top-[10%] w-[14%] md:right-[19%] md:w-[12%]">
            <PileTab name="Discard" count={7} />
            <div className="rotate-[3deg]">
              <CardFace tone="rose" />
            </div>
          </div>

          {/* Counter */}
          <div className="absolute right-[4%] top-[14%] w-[15%] md:w-[13%]">
            <CounterPreview name="Life" value={18} color="#e11d48" />
          </div>

          {/* Other players' cursors */}
          <Cursor name="jun" className="left-[61%] top-[46%] motion-safe:animate-cursor-a" fill="#10b981" />
          <Cursor name="maya" className="right-[10%] top-[52%] motion-safe:animate-cursor-b" fill="#f43f5e" />

          {/* Hand tray */}
          <div className="absolute bottom-[4%] left-1/2 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/85 px-2.5 pb-2.5 pt-1 shadow-md backdrop-blur sm:px-3 sm:pb-3 sm:pt-1.5">
            <p className="mb-1 text-[10px] font-medium text-zinc-500 sm:mb-1.5 sm:text-xs">Your hand · 5</p>
            <div className="flex items-end gap-1 px-1 pt-2 sm:gap-1.5">
              {HAND.map((c) => (
                <div key={c.tone} className={`w-8 origin-bottom transition duration-200 hover:-translate-y-3 sm:w-12 lg:w-16 ${c.tilt}`}>
                  <CardFace tone={c.tone} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardFace({ tone }: { tone: Tone }) {
  const t = TONES[tone];
  return (
    <div className="flex aspect-[5/7] flex-col rounded-[10%/7%] bg-white p-[7%] shadow-md ring-1 ring-black/10">
      <div className={`h-[9%] rounded-sm ${t.bar}`} />
      <div className={`mt-[7%] grid h-[50%] place-items-center rounded-sm bg-gradient-to-br ${t.art}`}>
        <svg viewBox="0 0 24 24" className="w-2/5 fill-white/85">
          <path d={t.glyph} />
        </svg>
      </div>
      <div className="mt-[9%] h-[4%] rounded-full bg-zinc-200" />
      <div className="mt-[5%] h-[4%] w-2/3 rounded-full bg-zinc-200" />
    </div>
  );
}

function CardBack() {
  return (
    <div className="aspect-[5/7] rounded-[10%/7%] bg-[#1e1b4b] p-[7%] shadow-md ring-1 ring-black/10">
      <div className="card-back-stripes grid h-full place-items-center rounded-[6%/4%] ring-1 ring-indigo-300">
        <div className="aspect-square w-[26%] rotate-45 bg-[#1e1b4b] ring-1 ring-indigo-200" />
      </div>
    </div>
  );
}

function PileTab({ name, count }: { name: string; count: number }) {
  return (
    <div className="mb-1.5 flex justify-center">
      <span className="whitespace-nowrap rounded-md bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-white shadow sm:text-[11px]">
        {name} · {count}
      </span>
    </div>
  );
}

/** Mirrors CounterView's drawing so it matches the real board. */
function CounterPreview({ name, value, color }: { name: string; value: number; color: string }) {
  return (
    <svg viewBox="0 0 160 128" className="w-full drop-shadow-sm" fontFamily="var(--font-geist-sans)">
      <rect x={1} y={1} width={158} height={126} rx={14} fill="#ffffff" stroke={color} strokeWidth={2} />
      <text x={80} y={22} textAnchor="middle" fontSize={13} fontWeight={500} fill="#52525b">
        {name}
      </text>
      <text x={80} y={58} textAnchor="middle" dominantBaseline="central" fontSize={44} fontWeight={700} fill={color}>
        {value}
      </text>
      {[
        { x: 10, label: "−" },
        { x: 84, label: "+" },
      ].map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={90} width={66} height={28} rx={8} fill={color} opacity={0.12} />
          <text x={b.x + 33} y={104} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={600} fill={color}>
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Cursor({ name, fill, className }: { name: string; fill: string; className: string }) {
  return (
    <div className={`pointer-events-none absolute flex items-start ${className}`}>
      <svg viewBox="0 0 20 20" className="size-4 drop-shadow sm:size-5">
        <path d="M3 2v15l4.5-4.5 3 6.5 2.5-1-3-6.5H16z" fill={fill} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span
        className="mt-3 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow sm:mt-4 sm:text-xs"
        style={{ backgroundColor: fill }}
      >
        {name}
      </span>
    </div>
  );
}

function Avatar({ initial, className, count }: { initial: string; className: string; count?: number }) {
  return (
    <span className={`relative grid size-7 place-items-center rounded-full text-xs font-semibold text-white ring-2 ring-white ${className}`}>
      {initial}
      {count !== undefined && (
        <span className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full bg-zinc-800 text-[8px] ring-1 ring-white">
          {count}
        </span>
      )}
    </span>
  );
}
