"use client";

import { shallow, useOthersMapped, useStorage } from "@liveblocks/react/suspense";
import { memo } from "react";
import { smoothPath } from "./geometry";
import type { Handle, XYWH } from "./types";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function handlePosition(b: XYWH, h: Handle) {
  const x = h.includes("w") ? b.x : h.includes("e") ? b.x + b.width : b.x + b.width / 2;
  const y = h.includes("n") ? b.y : h.includes("s") ? b.y + b.height : b.y + b.height / 2;
  return { x, y };
}

export function SelectionBox({
  bounds,
  zoom,
  showHandles,
  onHandlePointerDown,
}: {
  bounds: XYWH;
  zoom: number;
  showHandles: boolean;
  onHandlePointerDown: (e: React.PointerEvent, handle: Handle) => void;
}) {
  const size = 9 / zoom;
  return (
    <g>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={1.5 / zoom}
        pointerEvents="none"
      />
      {showHandles &&
        HANDLES.map((h) => {
          const p = handlePosition(bounds, h);
          return (
            <rect
              key={h}
              x={p.x - size / 2}
              y={p.y - size / 2}
              width={size}
              height={size}
              rx={2 / zoom}
              fill="white"
              stroke="#4f46e5"
              strokeWidth={1.5 / zoom}
              style={{ cursor: HANDLE_CURSORS[h] }}
              onPointerDown={(e) => onHandlePointerDown(e, h)}
            />
          );
        })}
    </g>
  );
}

/** Outlines the layers other people have selected, in their color. */
export function OthersSelections({ zoom }: { zoom: number }) {
  const others = useOthersMapped(
    (o) => ({ selection: o.presence.selection, color: o.info.color }),
    shallow,
  );
  return (
    <>
      {others.flatMap(([connectionId, o]) =>
        o.selection.map((id) => (
          <LayerOutline key={`${connectionId}-${id}`} id={id} color={o.color} zoom={zoom} />
        )),
      )}
    </>
  );
}

const LayerOutline = memo(function LayerOutline({ id, color, zoom }: { id: string; color: string; zoom: number }) {
  const bounds = useStorage((root) => {
    const l = root.layers[id];
    return l ? { x: l.x, y: l.y, width: l.width, height: l.height } : null;
  }, shallow);
  if (!bounds) return null;
  const pad = 3 / zoom;
  return (
    <rect
      x={bounds.x - pad}
      y={bounds.y - pad}
      width={bounds.width + pad * 2}
      height={bounds.height + pad * 2}
      fill="none"
      stroke={color}
      strokeWidth={2 / zoom}
      pointerEvents="none"
    />
  );
});

/** Strokes other people are drawing right now. */
export function OthersDrafts() {
  const others = useOthersMapped(
    (o) => ({ draft: o.presence.pencilDraft, color: o.presence.pencilColor, width: o.presence.pencilWidth }),
    shallow,
  );
  return (
    <>
      {others.map(([connectionId, o]) =>
        o.draft ? <DraftPath key={connectionId} points={o.draft} color={o.color} width={o.width} /> : null,
      )}
    </>
  );
}

export function DraftPath({
  points,
  color,
  width,
}: {
  points: ReadonlyArray<ReadonlyArray<number>>;
  color: string;
  width: number;
}) {
  return (
    <path
      d={smoothPath(points)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

/** Other people's cursors with their usernames, kept the same size at any zoom. */
export function Cursors({ zoom }: { zoom: number }) {
  const others = useOthersMapped((o) => ({ cursor: o.presence.cursor, info: o.info }), shallow);
  return (
    <>
      {others.map(([connectionId, { cursor, info }]) => {
        if (!cursor) return null;
        const labelWidth = info.name.length * 7.5 + 16;
        return (
          <g
            key={connectionId}
            transform={`translate(${cursor.x} ${cursor.y}) scale(${1 / zoom})`}
            pointerEvents="none"
            style={{ transition: "transform 80ms linear" }}
          >
            <path
              d="M0 0 L0 17 L4.5 12.5 L8 20 L11 18.7 L7.6 11.5 L13.5 11.5 Z"
              fill={info.color}
              stroke="white"
              strokeWidth={1.5}
            />
            <rect x={12} y={18} width={labelWidth} height={22} rx={6} fill={info.color} />
            <text x={20} y={33} fill="white" fontSize={12.5} fontWeight={600} fontFamily="var(--font-geist-sans)">
              {info.name}
            </text>
          </g>
        );
      })}
    </>
  );
}
