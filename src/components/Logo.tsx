import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="3" width="11" height="15" rx="2" />
          <path d="M9 21h9a2 2 0 0 0 2-2V8" />
        </svg>
      </span>
      <span className="text-lg">TCGLoader</span>
    </Link>
  );
}
