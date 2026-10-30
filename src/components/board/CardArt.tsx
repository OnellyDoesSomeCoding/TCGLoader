"use client";

import { shallow, useStorage } from "@liveblocks/react/suspense";
import type { Card, Crop, PileLayer } from "./types";

// The source image is stretched over a 1000×1000 box so a crop in fractions
// becomes a plain viewBox.
const UNIT = 1000;

const CARD_BACK_PATTERN = "tcg-card-back";

type Box = { x: number; y: number; width: number; height: number };
type PointerHandler = (e: React.PointerEvent) => void;

/** Draws the cropped part of an image stretched to fill x/y/width/height. */
export function CroppedImage({
  url,
  crop,
  x,
  y,
  width,
  height,
  onPointerDown,
}: Box & { url: string; crop?: Readonly<Crop>; onPointerDown?: PointerHandler }) {
  if (!crop) {
    return (
      <image
        onPointerDown={onPointerDown}
        href={url}
        x={x}
        y={y}
        width={width}
        height={height}
        preserveAspectRatio="none"
      />
    );
  }
  return (
    <svg
      onPointerDown={onPointerDown}
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`${crop.x * UNIT} ${crop.y * UNIT} ${crop.width * UNIT} ${crop.height * UNIT}`}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <image href={url} width={UNIT} height={UNIT} preserveAspectRatio="none" />
    </svg>
  );
}

/** Pattern used by every card back. Rendered once inside the board's <svg>. */
export function CardBackDefs() {
  return (
    <defs>
      <pattern
        id={CARD_BACK_PATTERN}
        width={10}
        height={10}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width={10} height={10} fill="#3730a3" />
        <rect width={5} height={10} fill="#4338ca" />
      </pattern>
    </defs>
  );
}

/** The shared card back: a framed stripe pattern with a diamond in the middle. */
export function CardBack({ x, y, width, height, onPointerDown }: Box & { onPointerDown?: PointerHandler }) {
  const short = Math.min(width, height);
  const radius = short * 0.06;
  const inset = short * 0.07;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const d = short * 0.16;
  return (
    <g onPointerDown={onPointerDown}>
      <rect x={x} y={y} width={width} height={height} rx={radius} fill="#1e1b4b" />
      <rect
        x={x + inset}
        y={y + inset}
        width={Math.max(width - inset * 2, 0)}
        height={Math.max(height - inset * 2, 0)}
        rx={radius * 0.6}
        fill={`url(#${CARD_BACK_PATTERN})`}
        stroke="#a5b4fc"
        strokeWidth={Math.max(inset * 0.18, 0.5)}
      />
      <path
        d={`M ${cx} ${cy - d} L ${cx + d * 0.7} ${cy} L ${cx} ${cy + d} L ${cx - d * 0.7} ${cy} Z`}
        fill="#1e1b4b"
        stroke="#c7d2fe"
        strokeWidth={Math.max(inset * 0.18, 0.5)}
      />
    </g>
  );
}

/** A card's face fitted (keeping its proportions) and centered in a box. */
export function CardFace({ card, x, y, width, height }: Box & { card: Readonly<Card> }) {
  const scale = Math.min(width / card.width, height / card.height);
  const w = card.width * scale;
  const h = card.height * scale;
  return <CroppedImage url={card.url} crop={card.crop} x={x + (width - w) / 2} y={y + (height - h) / 2} width={w} height={h} />;
}

/** A standalone <svg> of a card, for use in HTML (hand, ghost, pile browser). */
export function CardImage({
  card,
  width,
  height,
  faceDown = false,
}: {
  card: Readonly<Card>;
  width: number;
  height: number;
  faceDown?: boolean;
}) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {faceDown ? (
        <CardBack x={0} y={0} width={width} height={height} />
      ) : (
        <CroppedImage url={card.url} crop={card.crop} x={0} y={0} width={width} height={height} />
      )}
    </svg>
  );
}

export function PileView({
  id,
  layer,
  zoom,
  highlighted,
  onTabPointerDown,
  onBodyPointerDown,
  onTabDoubleClick,
}: {
  id: string;
  layer: Readonly<PileLayer>;
  zoom: number;
  highlighted: boolean;
  onTabPointerDown: PointerHandler;
  onBodyPointerDown: PointerHandler;
  onTabDoubleClick: () => void;
}) {
  const { count, top } = useStorage((root) => {
    const cards = root.piles?.[id];
    return { count: cards?.length ?? 0, top: cards && cards.length > 0 ? cards[cards.length - 1] : null };
  }, shallow);

  const { x, y, width, height } = layer;
  const radius = Math.min(width, height) * 0.06;
  // A few offset edges behind the top card hint at how tall the stack is.
  const edges = Math.min(3, Math.max(0, count - 1));
  const step = Math.min(width, height) * 0.025;

  // The name tab keeps the same on-screen size at any zoom.
  const label = `${layer.name} · ${count}`;
  const tabH = 22 / zoom;
  const tabW = (label.length * 7 + 18) / zoom;

  return (
    <g>
      {Array.from({ length: edges }, (_, i) => {
        const offset = (edges - i) * step;
        return (
          <rect
            key={i}
            x={x + offset}
            y={y + offset}
            width={width}
            height={height}
            rx={radius}
            fill="#f4f4f5"
            stroke="#a1a1aa"
            strokeWidth={1 / zoom}
            pointerEvents="none"
          />
        );
      })}

      <g onPointerDown={onBodyPointerDown} style={{ cursor: count > 0 ? "grab" : "move" }}>
        {count === 0 || !top ? (
          <>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={radius}
              fill="rgb(255 255 255 / 0.6)"
              stroke="#a1a1aa"
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13 / zoom}
              fill="#71717a"
              pointerEvents="none"
            >
              Empty pile
            </text>
          </>
        ) : layer.faceDown ? (
          <CardBack x={x} y={y} width={width} height={height} />
        ) : (
          <>
            <rect x={x} y={y} width={width} height={height} rx={radius} fill="white" />
            <CardFace card={top} x={x} y={y} width={width} height={height} />
          </>
        )}
      </g>

      {highlighted && (
        <rect
          x={x - 4 / zoom}
          y={y - 4 / zoom}
          width={width + 8 / zoom}
          height={height + 8 / zoom}
          rx={radius}
          fill="rgb(79 70 229 / 0.12)"
          stroke="#4f46e5"
          strokeWidth={3 / zoom}
          pointerEvents="none"
        />
      )}

      <g onPointerDown={onTabPointerDown} onDoubleClick={onTabDoubleClick} style={{ cursor: "move" }}>
        <title>Drag to move the pile · double-click to rename</title>
        <rect x={x} y={y - tabH - 4 / zoom} width={tabW} height={tabH} rx={6 / zoom} fill="#27272a" />
        <text
          x={x + 9 / zoom}
          y={y - 4 / zoom - tabH / 2}
          dominantBaseline="central"
          fontSize={12 / zoom}
          fontWeight={600}
          fill="white"
          fontFamily="var(--font-geist-sans)"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
