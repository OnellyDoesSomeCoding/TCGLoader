"use client";

import { useStorage } from "@liveblocks/react/suspense";
import { useId } from "react";
import { inkOn } from "./GamePieces";
import type { PackLayer } from "./types";

type PointerHandler = (e: React.PointerEvent) => void;
type PackLook = Pick<PackLayer, "name" | "size" | "color" | "cover">;

// Packs are drawn in this box and stretched to the layer's size.
const W = 180;
const H = 290;
// Crimped top and bottom edges: teeth this wide and deep, on bands this tall.
const TOOTH = 10;
const DEPTH = 5;
const CRIMP = 18;
// Opening tears the top off along this line.
const TEAR = 34;

// Pivots for the rip, in the pack box. (A clipped group's own box ignores the clip, so it can't be used.)
const AROUND_CENTER: React.CSSProperties = { transformBox: "view-box", transformOrigin: `${W / 2}px ${H / 2}px` };
// The top is torn from the left, so it swings up around the right end of the tear.
const AROUND_TEAR_END: React.CSSProperties = { transformBox: "view-box", transformOrigin: `${W}px ${TEAR}px` };

/** A zigzag across the pack at `y`, from left to right, as "L" steps. */
function zigzag(y: number, depth: number, fromX: number, toX: number) {
  let d = "";
  for (let x = fromX; x < toX; x += TOOTH) d += ` L ${x + TOOTH / 2} ${y - depth} L ${x + TOOTH} ${y}`;
  return d;
}

const OUTLINE = (() => {
  let d = `M 0 ${DEPTH}${zigzag(DEPTH, DEPTH, 0, W)} L ${W} ${H - DEPTH}`;
  for (let x = W; x > 0; x -= TOOTH) d += ` L ${x - TOOTH / 2} ${H} L ${x - TOOTH} ${H - DEPTH}`;
  return `${d} Z`;
})();

// The two pieces a pack tears into. They share the tear line and reach well past the pack's edges.
const TOP_PIECE = `M -20 -20 L ${W + 20} -20 L ${W + 20} ${TEAR} L ${W} ${TEAR}${zigzagBack()} L -20 ${TEAR} Z`;
const BOTTOM_PIECE = `M -20 ${TEAR} L 0 ${TEAR}${zigzag(TEAR, -4, 0, W)} L ${W + 20} ${TEAR} L ${W + 20} ${H + 20} L -20 ${H + 20} Z`;

function zigzagBack() {
  let d = "";
  for (let x = W; x > 0; x -= TOOTH) d += ` L ${x - TOOTH / 2} ${TEAR + 4} L ${x - TOOTH} ${TEAR}`;
  return d;
}

// Fine ridges pressed into the crimped bands.
const RIDGES = Array.from({ length: W / 4 }, (_, i) => `M ${i * 4 + 2} 0 v ${CRIMP} M ${i * 4 + 2} ${H - CRIMP} v ${CRIMP}`).join(" ");

/** Splits a pack name over two lines when it's long, at the space nearest the middle. */
function nameLines(name: string) {
  if (name.length <= 14) return [name];
  const middle = name.length / 2;
  let best = -1;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === " " && (best === -1 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return best === -1 ? [name] : [name.slice(0, best), name.slice(best + 1)];
}

/** SVG ids must be unique on the page and safe inside url(#…). */
function useSvgId() {
  return `pack${useId().replace(/[^\w-]/g, "")}`;
}

/** A pack's wrapper, drawn in the 180 × 290 pack box. An uploaded cover replaces the default art and name. */
function PackWrapper({ pack }: { pack: PackLook }) {
  const id = useSvgId();
  const ink = inkOn(pack.color);
  const lines = nameLines(pack.name);
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(24, 156 / Math.max(1, longest * 0.6));
  const nameY = lines.length === 1 ? 204 : 192;

  return (
    <g fontFamily="var(--font-geist-sans)">
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={OUTLINE} />
        </clipPath>
        {/* Diagonal glints, so the wrapper reads as foil. */}
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.4} />
          <stop offset="0.35" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.55" stopColor="#fff" stopOpacity={0.22} />
          <stop offset="0.75" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.28} />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${id}-clip)`}>
        {pack.cover ? (
          <image href={pack.cover} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <>
            <rect width={W} height={H} fill={pack.color} />
            <rect width={W} height={H} fill={`url(#${id}-shade)`} />
            {/* A fan of three cards. */}
            <g fill={ink} stroke={pack.color} strokeWidth={2.5}>
              {[-16, 0, 16].map((angle, i) => (
                <rect
                  key={angle}
                  x={68}
                  y={70}
                  width={44}
                  height={64}
                  rx={5}
                  fillOpacity={0.55 + i * 0.2}
                  transform={`rotate(${angle} 90 150)`}
                />
              ))}
            </g>
            <text textAnchor="middle" fontSize={fontSize} fontWeight={800} fill={ink}>
              {lines.map((line, i) => (
                <tspan key={i} x={W / 2} y={nameY + i * fontSize * 1.15}>
                  {line}
                </tspan>
              ))}
            </text>
            <text x={W / 2} y={254} textAnchor="middle" fontSize={11} fontWeight={600} letterSpacing={2} fill={ink} fillOpacity={0.75}>
              {pack.size} CARD{pack.size === 1 ? "" : "S"}
            </text>
          </>
        )}
        <rect width={W} height={H} fill={`url(#${id}-sheen)`} />
        <rect width={W} height={CRIMP} fill="#fff" fillOpacity={0.22} />
        <rect y={H - CRIMP} width={W} height={CRIMP} fill="#fff" fillOpacity={0.22} />
        <path d={RIDGES} stroke="#000" strokeOpacity={0.14} strokeWidth={1.2} />
      </g>
      <path d={OUTLINE} fill="none" stroke="rgb(0 0 0 / 0.3)" strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

/** A pack's wrapper as a standalone <svg>, for use in HTML (the pack editor). */
export function PackImage({ pack, width, height }: { pack: PackLook; width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
      <PackWrapper pack={pack} />
    </svg>
  );
}

export function PackView({
  id,
  layer,
  zoom,
  highlighted,
  onPointerDown,
  onDoubleClick,
}: {
  id: string;
  layer: Readonly<PackLayer>;
  zoom: number;
  highlighted: boolean;
  onPointerDown: PointerHandler;
  onDoubleClick: () => void;
}) {
  const count = useStorage((root) => root.packs?.[id]?.length ?? 0);
  const { x, y, width, height } = layer;

  return (
    <g>
      <svg
        x={x}
        y={y}
        width={Math.max(width, 1)}
        height={Math.max(height, 1)}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        overflow="visible"
        className="select-none"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <title>
          {count === 0
            ? `${layer.name}: drag cards onto the pack to add them`
            : `${layer.name}: ${layer.size} of ${count} card${count === 1 ? "" : "s"} (double-click to open)`}
        </title>
        <PackWrapper pack={layer} />
        {count === 0 && (
          <g pointerEvents="none" fontFamily="var(--font-geist-sans)">
            <rect x={22} y={126} width={136} height={38} rx={8} fill="rgb(24 24 27 / 0.82)" />
            <text x={W / 2} y={145} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#fff">
              Drop cards here
            </text>
          </g>
        )}
      </svg>

      {highlighted && (
        <rect
          x={x - 4 / zoom}
          y={y - 4 / zoom}
          width={width + 8 / zoom}
          height={height + 8 / zoom}
          rx={6 / zoom}
          fill="rgb(79 70 229 / 0.12)"
          stroke="#4f46e5"
          strokeWidth={3 / zoom}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

/** A pack tearing open: its top flies off along a zigzag and the rest of the wrapper falls away. */
export function PackRip({ pack }: { pack: Readonly<PackLayer> }) {
  const id = useSvgId();
  return (
    <svg
      x={pack.x}
      y={pack.y}
      width={Math.max(pack.width, 1)}
      height={Math.max(pack.height, 1)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      overflow="visible"
      pointerEvents="none"
    >
      <defs>
        <clipPath id={`${id}-top`}>
          <path d={TOP_PIECE} />
        </clipPath>
        <clipPath id={`${id}-bottom`}>
          <path d={BOTTOM_PIECE} />
        </clipPath>
      </defs>
      <g className="animate-pack-rip-body" style={AROUND_CENTER}>
        <g clipPath={`url(#${id}-bottom)`}>
          <PackWrapper pack={pack} />
        </g>
      </g>
      <g className="animate-pack-rip-top" style={AROUND_TEAR_END}>
        <g clipPath={`url(#${id}-top)`}>
          <PackWrapper pack={pack} />
        </g>
      </g>
    </svg>
  );
}
