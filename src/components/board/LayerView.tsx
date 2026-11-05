"use client";

import { useStorage } from "@liveblocks/react/suspense";
import { memo, useEffect, useRef } from "react";
import { CardBack, CardFaceImage, PileView } from "./CardArt";
import { isSideways } from "./cards";
import { CounterView } from "./CounterView";
import { ChipView, CoinView, DieView, PawnView, TimerView } from "./GamePieces";
import { arrowHeadPath, smoothPath } from "./geometry";
import { PackView } from "./PackArt";
import type { Layer, LayerType, Point } from "./types";

// Turned back upright when the board is turned for Player 2, so they stay readable.
// Drawings turn with the board so arrows and circles still point at the right things.
const UPRIGHT_TYPES = new Set<LayerType>(["text", "image", "pile", "counter", "die", "coin", "pawn", "chip", "timer", "pack"]);

/** A card that just came out of a pack: it flies out from `from`, the pack's center, after `delay` ms. */
export type Pop = { from: Point; delay: number };

type LayerViewProps = {
  id: string;
  zoom: number;
  flipped: boolean;
  isEditing: boolean;
  isDropTarget: boolean;
  pop?: Pop;
  onLayerPointerDown: (e: React.PointerEvent, id: string) => void;
  onPileBodyPointerDown: (e: React.PointerEvent, id: string) => void;
  onPileRename: (id: string) => void;
  onCounterStep: (e: React.PointerEvent, id: string, delta: number) => void;
  onCounterEdit: (id: string) => void;
  onCardRotate: (id: string) => void;
  // Double-clicking a kit piece rolls a die, tosses a coin, labels a chip, starts a timer or opens a pack.
  onPieceDoubleClick: (id: string) => void;
  onLayerDoubleClick: (id: string) => void;
  onTextChange: (id: string, text: string, height: number) => void;
  onTextEditEnd: (id: string) => void;
};

export const LayerView = memo(function LayerView({ flipped, pop, ...props }: LayerViewProps) {
  const layer = useStorage((root) => root.layers[props.id]);
  if (!layer) return null;

  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  let content = <LayerContent layer={layer} {...props} />;
  // A half turn around its own center leaves the layer's footprint where it was.
  if (flipped && UPRIGHT_TYPES.has(layer.type)) content = <g transform={`rotate(180 ${cx} ${cy})`}>{content}</g>;
  if (!pop) return <g>{content}</g>;
  // Outside the half turn, so the card flies the right way on a turned board too. The wrapping <g> is
  // there either way, so the card isn't remounted when its animation ends.
  const style = {
    "--pop-x": `${pop.from.x - cx}px`,
    "--pop-y": `${pop.from.y - cy}px`,
    animationDelay: `${pop.delay}ms`,
    transformBox: "fill-box",
    transformOrigin: "center",
  } as React.CSSProperties;
  return (
    <g className="animate-pack-pop" style={style}>
      {content}
    </g>
  );
});

function LayerContent({
  layer,
  id,
  zoom,
  isEditing,
  isDropTarget,
  onLayerPointerDown,
  onPileBodyPointerDown,
  onPileRename,
  onCounterStep,
  onCounterEdit,
  onCardRotate,
  onPieceDoubleClick,
  onLayerDoubleClick,
  onTextChange,
  onTextEditEnd,
}: Omit<LayerViewProps, "flipped"> & { layer: Readonly<Layer> }) {

  const common = {
    onPointerDown: (e: React.PointerEvent) => onLayerPointerDown(e, id),
  };

  switch (layer.type) {
    case "rectangle":
      return (
        <rect
          {...common}
          x={layer.x}
          y={layer.y}
          width={layer.width}
          height={layer.height}
          rx={4}
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
        />
      );

    case "ellipse":
      return (
        <ellipse
          {...common}
          cx={layer.x + layer.width / 2}
          cy={layer.y + layer.height / 2}
          rx={layer.width / 2}
          ry={layer.height / 2}
          fill={layer.fill}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
        />
      );

    case "path":
    case "line":
    case "arrow": {
      const d =
        layer.type === "path"
          ? smoothPath(layer.points)
          : `M ${layer.points[0][0]} ${layer.points[0][1]} L ${layer.points[1][0]} ${layer.points[1][1]}`;
      const head =
        layer.type === "arrow" ? arrowHeadPath(layer.points[0], layer.points[1], layer.strokeWidth) : "";
      return (
        <g {...common} transform={`translate(${layer.x} ${layer.y})`}>
          {/* Wide invisible stroke so thin lines are easy to click. */}
          <path
            d={`${d} ${head}`}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(layer.strokeWidth, 14 / zoom)}
            strokeLinecap="round"
          />
          <path
            d={`${d} ${head}`}
            fill="none"
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    }

    case "text":
      return (
        <foreignObject
          {...common}
          onDoubleClick={() => onLayerDoubleClick(id)}
          x={layer.x}
          y={layer.y}
          width={Math.max(layer.width, 1)}
          height={Math.max(layer.height, 1)}
          overflow="visible"
        >
          {isEditing ? (
            <TextEditor
              text={layer.text}
              fontSize={layer.fontSize}
              color={layer.color}
              onChange={(text, height) => onTextChange(id, text, height)}
              onDone={() => onTextEditEnd(id)}
            />
          ) : (
            <div
              className="h-full w-full cursor-default whitespace-pre-wrap break-words p-1 leading-snug select-none"
              style={{ fontSize: layer.fontSize, color: layer.color }}
            >
              {layer.text}
            </div>
          )}
        </foreignObject>
      );

    case "image": {
      // The layer box is the turned footprint; draw the card upright in it, then turn it.
      const rotation = layer.rotation ?? 0;
      const sideways = isSideways(rotation);
      const width = Math.max(sideways ? layer.height : layer.width, 1);
      const height = Math.max(sideways ? layer.width : layer.height, 1);
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const box = { x: cx - width / 2, y: cy - height / 2, width, height };
      return (
        <g
          onDoubleClick={() => onCardRotate(id)}
          transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
        >
          {layer.faceDown ? (
            <CardBack {...common} {...box} />
          ) : (
            <CardFaceImage {...common} card={layer} {...box} />
          )}
        </g>
      );
    }

    case "pile":
      return (
        <PileView
          id={id}
          layer={layer}
          zoom={zoom}
          highlighted={isDropTarget}
          onTabPointerDown={common.onPointerDown}
          onBodyPointerDown={(e) => onPileBodyPointerDown(e, id)}
          onTabDoubleClick={() => onPileRename(id)}
        />
      );

    case "counter":
      return (
        <CounterView
          layer={layer}
          onBodyPointerDown={common.onPointerDown}
          onBodyDoubleClick={() => onCounterEdit(id)}
          onStep={(e, delta) => onCounterStep(e, id, delta)}
        />
      );

    case "die":
      return <DieView layer={layer} onPointerDown={common.onPointerDown} onDoubleClick={() => onPieceDoubleClick(id)} />;

    case "coin":
      return <CoinView layer={layer} onPointerDown={common.onPointerDown} onDoubleClick={() => onPieceDoubleClick(id)} />;

    case "pawn":
      return <PawnView layer={layer} onPointerDown={common.onPointerDown} />;

    case "chip":
      return <ChipView layer={layer} onPointerDown={common.onPointerDown} onDoubleClick={() => onPieceDoubleClick(id)} />;

    case "timer":
      return <TimerView layer={layer} onPointerDown={common.onPointerDown} onDoubleClick={() => onPieceDoubleClick(id)} />;

    case "pack":
      return (
        <PackView
          id={id}
          layer={layer}
          zoom={zoom}
          highlighted={isDropTarget}
          onPointerDown={common.onPointerDown}
          onDoubleClick={() => onPieceDoubleClick(id)}
        />
      );
  }
}


function TextEditor({
  text,
  fontSize,
  color,
  onChange,
  onDone,
}: {
  text: string;
  fontSize: number;
  color: string;
  onChange: (text: string, height: number) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      value={text}
      placeholder="Type something"
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const el = e.currentTarget;
        el.style.height = "auto";
        onChange(el.value, el.scrollHeight);
        el.style.height = "";
      }}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      className="block h-full w-full resize-none overflow-hidden bg-transparent p-1 leading-snug outline-none placeholder:text-zinc-400"
      style={{ fontSize, color }}
    />
  );
}
