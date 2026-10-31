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
  sheet: "M3 4h18v16H3zM9 4v16M15 4v16M3 12h18",
  pile: "M5 9h11v12H5zM8 6h11v12M11 3h10v12",
  counter: "M3 6h18v12H3zM7 12h3M14 12h3M15.5 10.5v3",
  load:"M5 11h11v10H5zM8 8h11v10M15 2v5M12.5 4.5L15 2l2.5 2.5",
  cards: "M3 6h11v15H3zM14 8.5l6 1.6-3.5 12.9-5.5-1.5",
  group: "M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 7h6v6H7zM11 11h6v6h-6z",
  ungroup: "M3 3h8v8H3zM13 13h8v8h-8z",
  die: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  coin: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  pawn: "M12 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM10 10.5L8.5 18h7L14 10.5M6 18h12v3H6z",
  chip: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  timer: "M6 3h12M6 21h12M7 3v3l5 6-5 6v3M17 3v3l-5 6 5 6v3",
  play: "M7 4l13 8-13 8z",
  to_hand: "M6 4h9v14H6zM15 7l4 1-3 13-7-2M10 21h9",
  draw: "M12 3v11M7 9l5 5 5-5M5 20h14",
  take: "M6 11h12v10H6zM12 2v6M9 5l3 3 3-3",
  shuffle: "M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  rotate: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  flip: "M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  rename: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12",
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
