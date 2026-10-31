"use client";

import { useEffect, useState } from "react";
import type { ChipLayer, CoinLayer, DieLayer, Layer, PawnLayer, Point, TimerLayer } from "./types";

type PointerHandler = (e: React.PointerEvent) => void;
type PieceProps<L> = { layer: Readonly<L>; onPointerDown: PointerHandler; onDoubleClick: () => void };

export type PieceKind = "die" | "coin" | "pawn" | "chip" | "timer";

export const DIE_SIDES = [4, 6, 8, 10, 12, 20];
export const TIMER_LENGTHS = [30, 60, 120, 300];
export const MAX_CHIP_LABEL = 8;

const SIZES: Record<PieceKind, { width: number; height: number }> = {
  die: { width: 72, height: 72 },
  coin: { width: 72, height: 72 },
  pawn: { width: 48, height: 72 },
  chip: { width: 56, height: 56 },
  timer: { width: 160, height: 96 },
};

// Spins and scales from the piece's own center.
const AROUND_CENTER: React.CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const OUTLINE = "rgb(0 0 0 / 0.3)";

export const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

/** A new kit piece centered on `center`. */
export function newPiece(kind: PieceKind, center: Point): Layer {
  const { width, height } = SIZES[kind];
  const box = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  switch (kind) {
    case "die":
      return { type: "die", ...box, sides: 6, value: rollDie(6), rolls: 0, color: "#e03131" };
    case "coin":
      return { type: "coin", ...box, heads: true, tosses: 0, color: "#f08c00" };
    case "pawn":
      return { type: "pawn", ...box, color: "#1971c2" };
    case "chip":
      return { type: "chip", ...box, label: "", color: "#2f9e44" };
    case "timer":
      return { type: "timer", ...box, seconds: 60, endsAt: null, color: "#7048e8" };
  }
}

/** "30 s", "1 min", "1:30 min". */
export function formatLength(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${formatClock(seconds)} min`;
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Black or white, whichever reads better on a #rrggbb color. */
function inkOn(color: string) {
  const n = parseInt(color.slice(1), 16);
  if (color.length !== 7 || Number.isNaN(n)) return "#ffffff";
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 160 ? "#18181b" : "#ffffff";
}

/**
 * True once `count` has changed since the piece appeared, so a roll or toss animates
 * for everyone without every die on the board tumbling when the board loads.
 */
function useChangedSinceMount(count: number) {
  const [initial] = useState(count);
  return count !== initial;
}

/** A regular polygon around (50, 50), with a corner at the top. */
function polygon(corners: number, radius: number, cy = 50) {
  const points = Array.from({ length: corners }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / corners;
    return `${50 + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  });
  return points.join(" ");
}

/** Outline of each die, drawn in a 100 × 100 box, and where its number sits. */
const DIE_SHAPES: Record<number, { points: string; textY: number; fontSize: number }> = {
  4: { points: "50,6 95,88 5,88", textY: 64, fontSize: 32 },
  8: { points: "50,2 98,50 50,98 2,50", textY: 50, fontSize: 36 },
  10: { points: "50,2 96,42 50,98 4,42", textY: 46, fontSize: 34 },
  12: { points: polygon(5, 49, 53), textY: 54, fontSize: 38 },
  20: { points: polygon(6, 49), textY: 50, fontSize: 38 },
};

// Pip positions on a d6 face, in the same 100 × 100 box.
const L = 28;
const M = 50;
const R = 72;
const PIPS: Record<number, [number, number][]> = {
  1: [[M, M]],
  2: [[L, L], [R, R]],
  3: [[L, L], [M, M], [R, R]],
  4: [[L, L], [R, L], [L, R], [R, R]],
  5: [[L, L], [R, L], [M, M], [L, R], [R, R]],
  6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]],
};

/** Draws a piece in its own `viewBox`, scaled to the layer's size. */
function PieceFrame({
  layer,
  viewBox,
  children,
}: {
  layer: Readonly<{ x: number; y: number; width: number; height: number }>;
  viewBox: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      x={layer.x}
      y={layer.y}
      width={Math.max(layer.width, 1)}
      height={Math.max(layer.height, 1)}
      viewBox={viewBox}
      overflow="visible"
      fontFamily="var(--font-geist-sans)"
      className="select-none"
    >
      {children}
    </svg>
  );
}

export function DieView({ layer, onPointerDown, onDoubleClick }: PieceProps<DieLayer>) {
  const animate = useChangedSinceMount(layer.rolls);
  const ink = inkOn(layer.color);
  const shape = DIE_SHAPES[layer.sides];

  return (
    <PieceFrame layer={layer} viewBox="0 0 100 100">
      <g
        key={layer.rolls}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        className={animate ? "animate-die-roll" : undefined}
        style={AROUND_CENTER}
      >
        <title>{`d${layer.sides}: ${layer.value} (double-click to roll)`}</title>
        {shape ? (
          <>
            <polygon points={shape.points} fill={layer.color} stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />
            <text
              x={50}
              y={shape.textY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={shape.fontSize}
              fontWeight={700}
              fill={ink}
              pointerEvents="none"
              // Tells 6 from 9 on dice that show both.
              textDecoration={layer.value === 6 || layer.value === 9 ? "underline" : undefined}
            >
              {layer.value}
            </text>
          </>
        ) : (
          <>
            <rect x={3} y={3} width={94} height={94} rx={18} fill={layer.color} stroke={OUTLINE} strokeWidth={2} />
            {(PIPS[layer.value] ?? []).map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={8.5} fill={ink} pointerEvents="none" />
            ))}
          </>
        )}
      </g>
    </PieceFrame>
  );
}

export function CoinView({ layer, onPointerDown, onDoubleClick }: PieceProps<CoinLayer>) {
  const animate = useChangedSinceMount(layer.tosses);
  const ink = inkOn(layer.color);

  return (
    <PieceFrame layer={layer} viewBox="0 0 100 100">
      <g
        key={layer.tosses}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        className={animate ? "animate-coin-toss" : undefined}
        style={AROUND_CENTER}
      >
        <title>{`${layer.heads ? "Heads" : "Tails"} (double-click to toss)`}</title>
        <circle cx={50} cy={50} r={48} fill={layer.color} stroke={OUTLINE} strokeWidth={2} />
        {/* Tails is a shade darker, so the two sides are easy to tell apart at a glance. */}
        {!layer.heads && <circle cx={50} cy={50} r={48} fill="rgb(0 0 0 / 0.18)" pointerEvents="none" />}
        <circle cx={50} cy={50} r={39} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={2} pointerEvents="none" />
        <text x={50} y={46} textAnchor="middle" dominantBaseline="central" fontSize={38} fontWeight={700} fill={ink} pointerEvents="none">
          {layer.heads ? "H" : "T"}
        </text>
        <text x={50} y={74} textAnchor="middle" fontSize={11} fontWeight={600} letterSpacing={1.5} fill={ink} pointerEvents="none">
          {layer.heads ? "HEADS" : "TAILS"}
        </text>
      </g>
    </PieceFrame>
  );
}

export function PawnView({ layer, onPointerDown }: Omit<PieceProps<PawnLayer>, "onDoubleClick">) {
  return (
    <PieceFrame layer={layer} viewBox="0 0 60 90">
      <g onPointerDown={onPointerDown} fill={layer.color} stroke={OUTLINE} strokeWidth={1.5} strokeLinejoin="round">
        <path d="M17 76 L22 44 Q30 38 38 44 L43 76 Z" />
        <circle cx={30} cy={20} r={15} />
        <rect x={4} y={72} width={52} height={16} rx={7} />
        {/* Highlight, so the pawn reads as round. */}
        <circle cx={25} cy={15} r={4} fill="#ffffff" fillOpacity={0.35} stroke="none" pointerEvents="none" />
      </g>
    </PieceFrame>
  );
}

export function ChipView({ layer, onPointerDown, onDoubleClick }: PieceProps<ChipLayer>) {
  const ink = inkOn(layer.color);
  // Shrink long labels so they stay inside the chip.
  const fontSize = Math.min(28, 54 / Math.max(1, layer.label.length * 0.6));

  return (
    <PieceFrame layer={layer} viewBox="0 0 100 100">
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        <title>{layer.label ? `${layer.label} (double-click to change)` : "Double-click to add a label"}</title>
        <circle cx={50} cy={50} r={48} fill={layer.color} stroke={OUTLINE} strokeWidth={2} />
        <circle
          cx={50}
          cy={50}
          r={40}
          fill="none"
          stroke={ink}
          strokeOpacity={0.6}
          strokeWidth={7}
          strokeDasharray="12 9.3"
          pointerEvents="none"
        />
        <circle cx={50} cy={50} r={30} fill="#ffffff" fillOpacity={0.92} pointerEvents="none" />
        <text
          x={50}
          y={50}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={700}
          fill="#18181b"
          pointerEvents="none"
        >
          {layer.label}
        </text>
      </g>
    </PieceFrame>
  );
}

export function TimerView({ layer, onPointerDown, onDoubleClick }: PieceProps<TimerLayer>) {
  const [now, setNow] = useState(() => Date.now());
  const running = layer.endsAt !== null;
  const left = running ? Math.max(0, Math.min(layer.seconds * 1000, layer.endsAt! - now)) : layer.seconds * 1000;
  const done = running && left === 0;

  // Tick while it runs. Timers started by others count down from their clock, so a few
  // hundred milliseconds of difference between computers is expected.
  useEffect(() => {
    if (!running || done) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running, done]);

  let status = "Double-click to start";
  if (done) status = "Time's up!";
  else if (running) status = "Double-click to reset";

  return (
    <PieceFrame layer={layer} viewBox="0 0 160 96">
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        <rect x={1} y={1} width={158} height={94} rx={14} fill="#ffffff" stroke={done ? "#e03131" : layer.color} strokeWidth={2} />
        <path
          d="M14 14h16M14 34h16M15 14v4l7 6-7 6v4M29 14v4l-7 6 7 6v4"
          fill="none"
          stroke={layer.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        <text x={146} y={24} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#71717a" pointerEvents="none">
          {formatLength(layer.seconds)}
        </text>
        <text
          x={80}
          y={54}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={36}
          fontWeight={700}
          fill={done ? "#e03131" : layer.color}
          pointerEvents="none"
          className={done ? "animate-pulse" : undefined}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatClock(Math.ceil(left / 1000))}
        </text>
        <text x={80} y={82} textAnchor="middle" fontSize={11} fill={done ? "#e03131" : "#71717a"} pointerEvents="none">
          {status}
        </text>
      </g>
    </PieceFrame>
  );
}
