"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PieceKind } from "./GamePieces";
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
// On small screens, text and the shapes share one toolbar button.
const SHAPE_TOOLS = TOOLS.slice(3);

export function ToolButton({
  icon,
  label,
  active,
  disabled,
  compact,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
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
      className={`grid shrink-0 place-items-center rounded-lg transition ${compact ? "size-9" : "size-10"} ${
        active ? "bg-brand text-white" : "text-zinc-700 hover:bg-zinc-100"
      } disabled:pointer-events-none disabled:opacity-35`}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * The tools. A column on the left, or with `row` a row for the bottom of a phone screen.
 * `compact` keeps it short: smaller buttons, and text and shapes in one menu.
 */
export function Toolbar({
  compact,
  row,
  tool,
  onToolChange,
  onUploadClick,
  onSheetUploadClick,
  onLoadClick,
  onNewPileClick,
  onNewCounterClick,
  onAddPiece,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  compact: boolean;
  row: boolean;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUploadClick: () => void;
  onSheetUploadClick: () => void;
  onLoadClick: () => void;
  onNewPileClick: () => void;
  onNewCounterClick: () => void;
  onAddPiece: (kind: PieceKind) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const menuSide = row ? "top" : "right";
  const shape = SHAPE_TOOLS.find((t) => t.tool === tool);
  const groupClass = `flex rounded-xl border border-zinc-200 bg-white p-1 shadow-md ${row ? "gap-0.5" : "flex-col gap-1"}`;
  const divider = <div className={`shrink-0 bg-zinc-200 ${row ? "mx-0.5 my-2 w-px" : "mx-2 my-0.5 h-px"}`} />;

  const tools = (
    <>
      {(compact ? TOOLS.slice(0, 3) : TOOLS).map((t) => (
        <ToolButton
          key={t.tool}
          icon={t.icon}
          label={`${t.label} (${t.key})`}
          active={tool === t.tool}
          compact={compact}
          onClick={() => onToolChange(t.tool)}
        />
      ))}
      {compact && (
        <MenuButton
          icon={shape?.icon ?? "rectangle"}
          label="Text and shapes"
          active={shape !== undefined}
          compact
          side={menuSide}
          items={SHAPE_TOOLS.map((t) => ({ icon: t.icon, label: t.label, onClick: () => onToolChange(t.tool) }))}
        />
      )}
    </>
  );
  const undoRedo = (
    <>
      <ToolButton icon="undo" label="Undo (Ctrl+Z)" disabled={!canUndo} compact={compact} onClick={onUndo} />
      <ToolButton icon="redo" label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} compact={compact} onClick={onRedo} />
    </>
  );

  const menus = (
    <>
      <MenuButton
        icon="cards"
        label="Cards"
        compact={compact}
        side={menuSide}
        items={[
          { icon: "image", label: "Upload image", onClick: onUploadClick },
          { icon: "sheet", label: "Upload card sheet and cut it", onClick: onSheetUploadClick },
          { icon: "load", label: "Load images into a pile", onClick: onLoadClick },
          { icon: "pile", label: "New pile", onClick: onNewPileClick },
          { icon: "counter", label: "New counter", onClick: onNewCounterClick },
        ]}
      />
      <MenuButton
        icon="die"
        label="Board game kit"
        compact={compact}
        side={menuSide}
        items={[
          { icon: "die", label: "Die (d4 to d20)", onClick: () => onAddPiece("die") },
          { icon: "coin", label: "Coin", onClick: () => onAddPiece("coin") },
          { icon: "pawn", label: "Pawn", onClick: () => onAddPiece("pawn") },
          { icon: "chip", label: "Marker chip", onClick: () => onAddPiece("chip") },
          { icon: "timer", label: "Sand timer", onClick: () => onAddPiece("timer") },
        ]}
      />
    </>
  );

  if (row) {
    // One bar, so it fits across a phone. Wraps on the narrowest screens.
    return (
      <div className={`pointer-events-auto max-w-full flex-wrap justify-center ${groupClass}`}>
        {tools}
        {divider}
        {menus}
        {divider}
        {undoRedo}
      </div>
    );
  }

  return (
    // Leaves room for the header, and scrolls when the window is too short for it.
    <div className="pointer-events-none absolute bottom-3 left-3 top-16 flex flex-col justify-center">
      <div className="pointer-events-auto -m-2 flex max-h-full flex-col gap-2 overflow-y-auto p-2">
        <div className={groupClass}>
          {tools}
          {divider}
          {menus}
        </div>
        <div className={groupClass}>{undoRedo}</div>
      </div>
    </div>
  );
}

type MenuItem = { icon: IconName; label: string; onClick: () => void };

const MENU_GAP = 12;

/**
 * One toolbar button that opens a menu of tools beside the toolbar (`side` "right") or above it
 * ("top"). The menu is fixed to the window so a scrolling toolbar doesn't cut it off.
 */
function MenuButton({
  icon,
  label,
  items,
  active,
  compact,
  side,
}: {
  icon: IconName;
  label: string;
  items: MenuItem[];
  active?: boolean;
  compact?: boolean;
  side: "right" | "top";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Places the menu next to its button, inside the window, before it's painted.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current?.getBoundingClientRect();
    if (!open || !menu || !button) return;
    const { width, height } = menu.getBoundingClientRect();
    const fit = (v: number, size: number, room: number) => Math.max(MENU_GAP, Math.min(v, room - size - MENU_GAP));
    if (side === "right") {
      menu.style.left = `${button.right + MENU_GAP}px`;
      menu.style.top = `${fit(button.top, height, window.innerHeight)}px`;
    } else {
      menu.style.left = `${fit(button.left, width, window.innerWidth)}px`;
      menu.style.top = `${button.top - height - 8}px`;
    }
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative grid place-items-center rounded-lg transition ${compact ? "size-9" : "size-10"} ${
          open || active ? "bg-brand text-white" : "text-zinc-700 hover:bg-zinc-100"
        }`}
      >
        <Icon name={icon} />
        {/* Corner mark showing the button opens a menu. */}
        <svg viewBox="0 0 6 6" className="absolute bottom-1 right-1 size-1.5" aria-hidden>
          <path d="M6 0v6H0z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed left-0 top-0 z-30 flex w-64 max-w-[calc(100vw-1.5rem)] flex-col gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 pointer-coarse:h-11"
            >
              <Icon name={item.icon} className="size-[18px] shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      )}
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
  narrow,
  style,
  controls,
  onChange,
  multiSelect,
  selectionActions,
  contextActions = [],
}: {
  // Phones held upright: the full width under the header instead of centered at the top.
  narrow: boolean;
  style: Style;
  controls: StyleControls;
  onChange: (patch: Partial<Style>) => void;
  // A touch stand-in for Shift + click, shown with the selection actions.
  multiSelect?: { on: boolean; onToggle: () => void };
  selectionActions?: {
    onBringToFront: () => void;
    onSendToBack: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    // Left out when there's nothing to group or ungroup.
    onGroup?: () => void;
    onUngroup?: () => void;
  };
  // Actions that depend on what is selected, e.g. "Cut into cards" or pile actions.
  contextActions?: ContextAction[];
}) {
  const hasStyle = controls.color || controls.fill || controls.strokeWidth || controls.fontSize;
  if (!hasStyle && !selectionActions) return null;

  return (
    <div
      className={`absolute flex items-center gap-3 overflow-x-auto overscroll-x-contain rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-md touch-pan-x ${
        narrow ? "inset-x-3 top-15" : "left-1/2 top-3 max-w-[calc(100vw-2rem)] -translate-x-1/2"
      }`}
    >
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
            {multiSelect && (
              <>
                <button
                  type="button"
                  aria-pressed={multiSelect.on}
                  title="Tap layers to add them to the selection or take them out"
                  onClick={multiSelect.onToggle}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium ${
                    multiSelect.on ? "bg-brand text-white" : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <Icon name="select" className="size-4" />
                  Select more
                </button>
                <div className="mx-1 h-6 w-px shrink-0 bg-zinc-200" />
              </>
            )}
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
            {selectionActions.onGroup && (
              <SmallButton icon="group" label="Group (Ctrl+G)" onClick={selectionActions.onGroup} />
            )}
            {selectionActions.onUngroup && (
              <SmallButton icon="ungroup" label="Ungroup (Ctrl+Shift+G)" onClick={selectionActions.onUngroup} />
            )}
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
          className={`size-6 shrink-0 rounded-full border pointer-coarse:size-7 ${value === c ? "ring-2 ring-brand ring-offset-1" : ""} ${
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
