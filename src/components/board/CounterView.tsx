"use client";

import type { CounterLayer } from "./types";

type PointerHandler = (e: React.PointerEvent) => void;

// Counters are drawn in this box and scaled to the layer's size, keeping their shape.
export const COUNTER_SIZE = { width: 160, height: 128 };
const { width: W, height: H } = COUNTER_SIZE;
const BUTTON = { y: 90, width: 66, height: 28 };

export function CounterView({
  layer,
  onBodyPointerDown,
  onBodyDoubleClick,
  onStep,
}: {
  layer: Readonly<CounterLayer>;
  onBodyPointerDown: PointerHandler;
  onBodyDoubleClick: () => void;
  onStep: (e: React.PointerEvent, delta: number) => void;
}) {
  const value = String(layer.value);
  // Shrink long numbers so they stay inside the counter.
  const valueSize = Math.min(44, (W - 24) / (value.length * 0.62));

  return (
    <svg
      x={layer.x}
      y={layer.y}
      width={Math.max(layer.width, 1)}
      height={Math.max(layer.height, 1)}
      viewBox={`0 0 ${W} ${H}`}
      overflow="visible"
      fontFamily="var(--font-geist-sans)"
      className="select-none"
    >
      <rect
        onPointerDown={onBodyPointerDown}
        onDoubleClick={onBodyDoubleClick}
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={14}
        fill="#ffffff"
        stroke={layer.color}
        strokeWidth={2}
      />
      <text x={W / 2} y={22} textAnchor="middle" fontSize={13} fontWeight={500} fill="#52525b" pointerEvents="none">
        {layer.name}
      </text>
      <text
        x={W / 2}
        y={58}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={valueSize}
        fontWeight={700}
        fill={layer.color}
        pointerEvents="none"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </text>
      <StepButton x={10} label="−" title="Subtract 1 (Shift: 5)" color={layer.color} onPointerDown={(e) => onStep(e, -1)} />
      <StepButton x={W - 10 - BUTTON.width} label="+" title="Add 1 (Shift: 5)" color={layer.color} onPointerDown={(e) => onStep(e, 1)} />
    </svg>
  );
}

function StepButton({
  x,
  label,
  title,
  color,
  onPointerDown,
}: {
  x: number;
  label: string;
  title: string;
  color: string;
  onPointerDown: PointerHandler;
}) {
  return (
    <g onPointerDown={onPointerDown} className="cursor-pointer [&:hover>rect]:opacity-25">
      <title>{title}</title>
      <rect x={x} y={BUTTON.y} width={BUTTON.width} height={BUTTON.height} rx={8} fill={color} opacity={0.12} />
      <text
        x={x + BUTTON.width / 2}
        y={BUTTON.y + BUTTON.height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={22}
        fontWeight={600}
        fill={color}
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
}
