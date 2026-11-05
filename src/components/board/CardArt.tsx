"use client";

import { shallow, useStorage } from "@liveblocks/react/suspense";
import { useRef, useSyncExternalStore } from "react";
import type { Card, Crop, Finish, PileLayer } from "./types";

// The source image is stretched over a 1000×1000 box so a crop in fractions
// becomes a plain viewBox.
const UNIT = 1000;

const CARD_BACK_PATTERN = "tcg-card-back";
const FOIL_TINT = "tcg-foil-tint";
const FOIL_SHEEN = "tcg-foil-sheen";
const HOLO_RAINBOW = "tcg-holo-rainbow";
const HOLO_SPARKLE = "tcg-holo-sparkle";
const HOLO_PATTERN = "tcg-holo-pattern";
const HOLO_MASK = "tcg-holo-mask";

// Holo cards' rainbow shows strongest through a lattice of diamonds printed on the card: each tile
// holds a diamond ring with a small diamond in the middle, and the rings meet their neighbors' at
// the corners. The tile is a unit square, stretched to 1/6 of the card's width and 1/9 of its height.
const HOLO_TILE =
  "M .5 0 L 1 .5 L .5 1 L 0 .5 Z M .5 .14 L .86 .5 L .5 .86 L .14 .5 Z M .5 .36 L .64 .5 L .5 .64 L .36 .5 Z";
const HOLO_TILES_ACROSS = 6;
const HOLO_TILES_DOWN = 9;
// How much rainbow shows between the diamonds, compared with on them.
const HOLO_BETWEEN = 0.45;
const HOLO_RAINBOW_OPACITY = 0.9;

// The same lattice as a CSS mask, for cards shown in HTML.
const HOLO_MASK_STYLE: React.CSSProperties = {
  maskImage: `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><rect width="1" height="1" fill-opacity="${HOLO_BETWEEN}"/><path d="${HOLO_TILE}" fill-rule="evenodd"/></svg>`,
  )}")`,
  maskSize: `${100 / HOLO_TILES_ACROSS}% ${100 / HOLO_TILES_DOWN}%`,
};

// The sheen sweeps across in the first part of each cycle, then rests off the card.
const SHEEN_SECONDS = 5;
const RAINBOW_SECONDS = 9;
const TWINKLE_SECONDS = 2.4;

// Sparkles in one tile of the holo pattern: x, y and size, in board units.
const SPARKLES = [
  [6, 8, 2.6],
  [31, 4, 1.8],
  [19, 22, 3.2],
  [42, 27, 2.2],
  [9, 38, 1.9],
  [33, 44, 2.8],
] as const;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the viewer's system asks for less motion. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** A four-pointed star centered on (cx, cy). */
function sparklePath(cx: number, cy: number, r: number) {
  return `M ${cx} ${cy - r} Q ${cx} ${cy} ${cx + r} ${cy} Q ${cx} ${cy} ${cx} ${cy + r} Q ${cx} ${cy} ${cx - r} ${cy} Q ${cx} ${cy} ${cx} ${cy - r} Z`;
}

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

/**
 * Pattern used by every card back, and the gradients behind foil and holo cards. Rendered once inside
 * the board's <svg>. The finishes' animations live here too, so every shiny card on the board moves in
 * step, and a table full of them costs about the same as one.
 */
export function CardBackDefs() {
  const still = usePrefersReducedMotion();
  return (
    <defs>
      {/* Foil: light and dark bands that give the art a metallic look, and a bright sheen that sweeps
          across. Gradients are in each card's own box, so they fit any card size. */}
      <linearGradient id={FOIL_TINT} x1={0} y1={0} x2={1} y2={1}>
        <stop offset={0} stopColor="white" stopOpacity={0.45} />
        <stop offset={0.3} stopColor="black" stopOpacity={0.18} />
        <stop offset={0.55} stopColor="white" stopOpacity={0.4} />
        <stop offset={0.8} stopColor="black" stopOpacity={0.18} />
        <stop offset={1} stopColor="white" stopOpacity={0.45} />
      </linearGradient>
      <linearGradient
        id={FOIL_SHEEN}
        x1={0}
        y1={0}
        x2={1}
        y2={1}
        gradientTransform={still ? "translate(-0.15 -0.15)" : undefined}
      >
        <stop offset={0.38} stopColor="white" stopOpacity={0} />
        <stop offset={0.5} stopColor="white" stopOpacity={0.6} />
        <stop offset={0.62} stopColor="white" stopOpacity={0} />
        {!still && (
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="-1 -1; 1 1; 1 1"
            keyTimes="0; 0.45; 1"
            dur={`${SHEEN_SECONDS}s`}
            repeatCount="indefinite"
          />
        )}
      </linearGradient>

      {/* Holo: rainbow bands that drift across the card. One step of the drift is exactly one repeat
          of the gradient, so the loop is seamless. */}
      <linearGradient id={HOLO_RAINBOW} x1={0} y1={0} x2={0.6} y2={0.4} spreadMethod="repeat">
        <stop offset={0} stopColor="#ff3c8e" />
        <stop offset={0.2} stopColor="#ffcc33" />
        <stop offset={0.4} stopColor="#3dffa0" />
        <stop offset={0.6} stopColor="#33c8ff" />
        <stop offset={0.8} stopColor="#b45cff" />
        <stop offset={1} stopColor="#ff3c8e" />
        {!still && (
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            values="0 0; 0.6 0.4"
            dur={`${RAINBOW_SECONDS}s`}
            repeatCount="indefinite"
          />
        )}
      </linearGradient>
      {/* The diamond lattice, as a mask in each card's own box: white shows the rainbow. */}
      <pattern
        id={HOLO_PATTERN}
        patternUnits="objectBoundingBox"
        width={1 / HOLO_TILES_ACROSS}
        height={1 / HOLO_TILES_DOWN}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <rect width={1} height={1} fill="white" fillOpacity={HOLO_BETWEEN} />
        <path d={HOLO_TILE} fill="white" fillRule="evenodd" />
      </pattern>
      <mask id={HOLO_MASK} maskContentUnits="objectBoundingBox">
        <rect width={1} height={1} fill={`url(#${HOLO_PATTERN})`} />
      </mask>
      {/* Two sets of sparkles that take turns twinkling. */}
      <pattern id={HOLO_SPARKLE} width={48} height={48} patternUnits="userSpaceOnUse">
        {[0, 1].map((half) => (
          <g key={half} fill="white" opacity={0.7}>
            {SPARKLES.filter((_, i) => i % 2 === half).map(([x, y, r]) => (
              <path key={`${x},${y}`} d={sparklePath(x, y, r)} />
            ))}
            {!still && (
              <animate
                attributeName="opacity"
                values="0.75; 0.1; 0.75"
                dur={`${TWINKLE_SECONDS}s`}
                begin={`${(half * TWINKLE_SECONDS) / 2}s`}
                repeatCount="indefinite"
              />
            )}
          </g>
        ))}
      </pattern>

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

/**
 * The shine on a foil or holo card's face, drawn over its picture. Uses the gradients from
 * <CardBackDefs>, so it only works inside the board's <svg>. Clicks go through to the card.
 */
export function FinishOverlay({ finish, x, y, width, height }: Box & { finish: Finish }) {
  const box = { x, y, width, height };
  return (
    <g pointerEvents="none">
      <rect {...box} fill={`url(#${FOIL_TINT})`} style={{ mixBlendMode: "overlay" }} />
      {finish === "holo" && (
        <>
          <rect
            {...box}
            fill={`url(#${HOLO_RAINBOW})`}
            opacity={HOLO_RAINBOW_OPACITY}
            mask={`url(#${HOLO_MASK})`}
            style={{ mixBlendMode: "overlay" }}
          />
          <rect {...box} fill={`url(#${HOLO_SPARKLE})`} />
        </>
      )}
      <rect {...box} fill={`url(#${FOIL_SHEEN})`} />
    </g>
  );
}

/** A card's face, with its finish if it has one. For use inside the board's <svg>. */
export function CardFaceImage({
  card,
  onPointerDown,
  ...box
}: Box & { card: Readonly<Pick<Card, "url" | "crop" | "finish">>; onPointerDown?: PointerHandler }) {
  const image = <CroppedImage onPointerDown={onPointerDown} url={card.url} crop={card.crop} {...box} />;
  if (!card.finish) return image;
  return (
    <g>
      {image}
      <FinishOverlay finish={card.finish} {...box} />
    </g>
  );
}

/** A card's face fitted (keeping its proportions) and centered in a box. */
export function CardFace({ card, x, y, width, height }: Box & { card: Readonly<Card> }) {
  const scale = Math.min(width / card.width, height / card.height);
  const w = card.width * scale;
  const h = card.height * scale;
  return <CardFaceImage card={card} x={x + (width - w) / 2} y={y + (height - h) / 2} width={w} height={h} />;
}

/**
 * A standalone <svg> of a card, for use in HTML (hand, ghost, pile browser). Foil and holo cards get
 * their shine as a CSS layer on top (`.card-finish` in globals.css). It follows the mouse while it's
 * over the card and drifts on its own the rest of the time.
 */
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
  const shineRef = useRef<HTMLSpanElement>(null);
  const svg = (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {faceDown ? (
        <CardBack x={0} y={0} width={width} height={height} />
      ) : (
        <CroppedImage url={card.url} crop={card.crop} x={0} y={0} width={width} height={height} />
      )}
    </svg>
  );
  if (faceDown || !card.finish) return svg;

  // Moves the shine under the mouse: --mx and --my are its spot, as fractions of the card's size.
  function follow(e: React.PointerEvent<HTMLSpanElement>) {
    const shine = shineRef.current;
    if (!shine || e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    shine.style.setProperty("--mx", String((e.clientX - rect.left) / rect.width));
    shine.style.setProperty("--my", String((e.clientY - rect.top) / rect.height));
    shine.dataset.follow = "";
  }

  return (
    <span
      className="relative block"
      style={{ width, height }}
      onPointerMove={follow}
      onPointerLeave={() => {
        if (shineRef.current) delete shineRef.current.dataset.follow;
      }}
    >
      {svg}
      <span ref={shineRef} className={`card-finish card-finish-${card.finish}`} aria-hidden>
        {card.finish === "holo" && <span className="card-finish-rainbow" style={HOLO_MASK_STYLE} />}
      </span>
    </span>
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
