const PATHS = {
  select: "M5 3l14 8-6.5 1.5L9 19z",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-6a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2c-2.2 0-3.6-.8-4.8-2.2L4 15.5a1.5 1.5 0 0 1 2.3-1.9L8 15",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z",
  text: "M4 7V4h16v3M9 20h6M12 4v16",
  rectangle: "M4 5h16v14H4z",
  ellipse: "M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z",
  line: "M5 19L19 5",
  arrow: "M5 19L19 5M10 5h9v9",
  image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  front: "M8 8h12v12H8zM4 16V4h12",
  back: "M4 4h12v12H4zM20 8v12H8",
  duplicate: "M8 8h12v12H8zM16 8V4H4v12h4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  share: "M16 8a3 3 0 1 0 0-.01M8 15a3 3 0 1 0 0-.01M16 22a3 3 0 1 0 0-.01M10.6 13.5l2.8-1.6M10.6 16.5l2.8 1.6",
  back_arrow: "M15 18l-6-6 6-6",
  close: "M6 6l12 12M18 6L6 18",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
