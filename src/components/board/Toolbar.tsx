"use client";

import { Icon, type IconName } from "./Icon";
import type { Style, Tool } from "./types";

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: "select", icon: "select", label: "Select", key: "V" },
  { tool: "hand", icon: "hand", label: "Pan", key: "H" },
  { tool: "pen", icon: "pen", label: "Draw", key: "P" },
  { tool: "text", icon: "text", label: "Text", key: "T" },
  { tool: "rectangle", icon: "rectangle", label: "Rectangle", key: "R" },
  { tool: "ellipse", icon: "ellipse", label: "Ellipse", key: "O" },
  { tool: "line", icon: "line", label: "Line", key: "L" },
  { tool: "arrow", icon: "arrow", label: "Arrow", key: "A" },
];

export function ToolButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-lg transition ${
        active ? "bg-brand text-white" : "text-zinc-700 hover:bg-zinc-100"
      } disabled:pointer-events-none disabled:opacity-35`}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Toolbar({
  tool,
  onToolChange,
  onUploadClick,
  onSheetUploadClick,
  onNewPileClick,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUploadClick: () => void;
  onSheetUploadClick: () => void;
  onNewPileClick: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-md">
        {TOOLS.map((t) => (
          <ToolButton
            key={t.tool}
            icon={t.icon}
            label={`${t.label} (${t.key})`}
            active={tool === t.tool}
            onClick={() => onToolChange(t.tool)}
          />
        ))}
        <div className="mx-2 my-0.5 border-t border-zinc-200" />
        <ToolButton icon="image" label="Upload image" onClick={onUploadClick} />
        <ToolButton icon="sheet" label="Upload card sheet and cut it" onClick={onSheetUploadClick} />
        <ToolButton icon="pile" label="New pile" onClick={onNewPileClick} />
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-md">
        <ToolButton icon="undo" label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
        <ToolButton icon="redo" label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo} />
      </div>
    </div>
  );
}

export const COLORS = [
  "#1e1e1e",
  "#868e96",
  "#e03131",
  "#f08c00",
  "#ffd43b",
  "#2f9e44",
  "#1971c2",
  "#7048e8",
  "#d6336c",
  "#ffffff",
];

const FILLS = ["transparent", "#ffc9c9", "#ffec99", "#b2f2bb", "#a5d8ff", "#d0bfff", "#e9ecef", ...COLORS.slice(0, 1)];
const WIDTHS = [2, 4, 8];
const FONT_SIZES = [16, 24, 36, 56];

export type ContextAction = { label: string; icon: IconName; onClick: () => void; title?: string };

/** What the style bar should offer, based on the selection or the active tool. */
export type StyleControls = { color: boolean; fill: boolean; strokeWidth: boolean; fontSize: boolean };

export function StyleBar({
  style,
  controls,
  onChange,
  selectionActions,
  contextActions = [],
}: {
  style: Style;
  controls: StyleControls;
  onChange: (patch: Partial<Style>) => void;
  selectionActions?: {
    onBringToFront: () => void;
    onSendToBack: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  };
  // Actions that depend on what is selected, e.g. "Cut into cards" or pile actions.
  contextActions?: ContextAction[];
}) {
  const hasStyle = controls.color || controls.fill || controls.strokeWidth || controls.fontSize;
  if (!hasStyle && !selectionActions) return null;

  return (
    <div className="absolute left-1/2 top-3 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-md">
      {controls.color && (
        <Swatches label="Color" values={COLORS} value={style.color} onPick={(color) => onChange({ color })} />
      )}
      {controls.fill && (
        <>
          <Divider />
          <Swatches label="Fill" values={FILLS} value={style.fill} onPick={(fill) => onChange({ fill })} />
        </>
      )}
      {controls.strokeWidth && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5" role="group" aria-label="Stroke width">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                title={`Stroke ${w}px`}
                onClick={() => onChange({ strokeWidth: w })}
                className={`grid size-8 place-items-center rounded-md ${style.strokeWidth === w ? "bg-zinc-200" : "hover:bg-zinc-100"}`}
              >
                <span className="w-4 rounded-full bg-zinc-800" style={{ height: Math.max(2, w / 1.5) }} />
              </button>
            ))}
          </div>
        </>
      )}
      {controls.fontSize && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5" role="group" aria-label="Font size">
            {FONT_SIZES.map((s, i) => (
              <button
                key={s}
                type="button"
                title={`Font size ${s}`}
                onClick={() => onChange({ fontSize: s })}
                className={`h-8 rounded-md px-2 text-xs font-semibold ${style.fontSize === s ? "bg-zinc-200" : "hover:bg-zinc-100"}`}
              >
                {["S", "M", "L", "XL"][i]}
              </button>
            ))}
          </div>
        </>
      )}
      {selectionActions && (
        <>
          {hasStyle && <Divider />}
          <div className="flex items-center gap-0.5">
            {contextActions.map((a) => (
              <button
                key={a.label}
                type="button"
                title={a.title ?? a.label}
                onClick={a.onClick}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand hover:bg-brand/10"
              >
                <Icon name={a.icon} className="size-4" />
                {a.label}
              </button>
            ))}
            {contextActions.length > 0 && <div className="mx-1 h-6 w-px shrink-0 bg-zinc-200" />}
            <SmallButton icon="front" label="Bring to front" onClick={selectionActions.onBringToFront} />
            <SmallButton icon="back" label="Send to back" onClick={selectionActions.onSendToBack} />
            <SmallButton icon="duplicate" label="Duplicate (Ctrl+D)" onClick={selectionActions.onDuplicate} />
            <SmallButton icon="trash" label="Delete (Del)" onClick={selectionActions.onDelete} danger />
          </div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-6 w-px shrink-0 bg-zinc-200" />;
}

function SmallButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md text-zinc-700 hover:bg-zinc-100 ${danger ? "hover:text-red-600" : ""}`}
    >
      <Icon name={icon} className="size-[18px]" />
    </button>
  );
}

function Swatches({
  label,
  values,
  value,
  onPick,
}: {
  label: string;
  values: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-xs font-medium text-zinc-500">{label}</span>
      {values.map((c) => (
        <button
          key={c}
          type="button"
          title={c === "transparent" ? "No fill" : c}
          onClick={() => onPick(c)}
          className={`size-6 rounded-full border ${value === c ? "ring-2 ring-brand ring-offset-1" : ""} ${
            c === "transparent"
              ? "border-zinc-300 bg-[linear-gradient(135deg,transparent_45%,#e03131_45%,#e03131_55%,transparent_55%)]"
              : "border-black/10"
          }`}
          style={c === "transparent" ? undefined : { background: c }}
        />
      ))}
    </div>
  );
}
