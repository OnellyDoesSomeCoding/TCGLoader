"use client";

import { LiveObject } from "@liveblocks/client";
import {
  shallow,
  useCanRedo,
  useCanUndo,
  useErrorListener,
  useHistory,
  useMutation,
  useSelf,
  useStorage,
  useUpdateMyPresence,
} from "@liveblocks/react/suspense";
import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BoardHeader } from "./BoardHeader";
import { CardBackDefs, CardImage } from "./CardArt";
import {
  DEFAULT_PILE_SIZE,
  besidePile,
  cardFromImage,
  cardSizeFor,
  ensureCardStorage,
  handCards,
  imageFromCard,
  pileCards,
  popTop,
  removeLayer,
  shuffled,
} from "./cards";
import { COUNTER_SIZE } from "./CounterView";
import { CutDialog, type CutOptions } from "./CutDialog";
import { DIE_SIDES, MAX_CHIP_LABEL, TIMER_LENGTHS, formatLength, newPiece, rollDie, type PieceKind } from "./GamePieces";
import {
  flipCamera,
  normalizePoints,
  rectFromPoints,
  rectsIntersect,
  resizeLayer,
  resizeTransform,
  screenToWorld,
  boundsOf,
} from "./geometry";
import { HandTray } from "./HandTray";
import { Icon } from "./Icon";
import { LayerView } from "./LayerView";
import { LoadDialog, type LoadOptions } from "./LoadDialog";
import { Cursors, DraftPath, OthersDrafts, OthersSelections, SelectionBox } from "./Overlays";
import { PileBrowser } from "./PileBrowser";
import { ShareDialog, type BoardInfo } from "./ShareDialog";
import { StyleBar, Toolbar, type ContextAction, type StyleControls } from "./Toolbar";
import {
  COARSE_QUERY,
  COMPACT_QUERY,
  LONG_PRESS_MS,
  NARROW_QUERY,
  TAP_SLOP,
  useDoubleTap,
  useMediaQuery,
} from "./touch";
import { FULL_CROP } from "./types";
import type {
  Camera,
  Card,
  DropTarget,
  Handle,
  InsertTool,
  Layer,
  LayerType,
  Point,
  Style,
  Tool,
  XYWH,
} from "./types";

const DEFAULT_STYLE: Style = { color: "#1e1e1e", fill: "transparent", strokeWidth: 4, fontSize: 24 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 480;
const MAX_SHEET_SIDE = 1200;
const CARD_SPACING = 16;
const COUNTER_COLOR = "#1971c2";
const MAX_COUNTER = 99999;

// Layers that have a stroke color and width.
const STROKED_TYPES: LayerType[] = ["rectangle", "ellipse", "path", "line", "arrow"];
// Layers with a single `color`.
const COLORED_TYPES: LayerType[] = ["text", "counter", "die", "coin", "pawn", "chip", "timer"];
// Layers that keep their shape when resized.
const KEEP_ASPECT_TYPES: LayerType[] = ["image", "pile", "counter", "die", "coin", "pawn", "chip", "timer"];

const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  p: "pen",
  t: "text",
  r: "rectangle",
  o: "ellipse",
  l: "line",
  a: "arrow",
};

// What the pointer is doing right now. Kept in a ref so rapid pointer events
// always see the latest value.
type Gesture =
  | { mode: "idle" }
  | { mode: "panning"; startX: number; startY: number; startCamera: Camera }
  // `touch`: where a finger went down. A finger on empty board pans instead of drawing a selection box.
  | { mode: "pressing"; origin: Point; additive: readonly string[]; touch: { x: number; y: number } | null }
  | { mode: "marquee"; origin: Point; additive: readonly string[] }
  // `drops`: what the selection can be dropped onto; see selectionDrops.
  // `deselectOnTap`: with "Select more" on, a tap on a selected layer deselects it, a drag moves the selection.
  | {
      mode: "translating";
      last: Point;
      drops: { cards: boolean; piles: boolean };
      drop: DropTarget | null;
      deselectOnTap?: { id: string; origin: Point };
    }
  // Two fingers on the board zoom and pan around the point between them, until every finger is lifted.
  | { mode: "pinching"; startMid: Point; startDistance: number; startCamera: Camera }
  // Pressed on a pile: a drag pulls its top card off, a click selects the pile.
  | { mode: "pilePress"; pileId: string; origin: Point; shift: boolean }
  | { mode: "resizing"; handle: Handle; bounds: XYWH; layers: Record<string, Layer>; keepAspect: boolean }
  | { mode: "inserting"; id: string; tool: InsertTool; origin: Point }
  | { mode: "drawing"; points: number[][] };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Which side of the table you sit on is remembered per board, in this browser only.
const seatKey = (boardId: string) => `tcg-seat:${boardId}`;

function initialCamera(boardId: string): Camera {
  const camera: Camera = { x: 0, y: 0, zoom: 1, flipped: false };
  try {
    // The board fills the window, so the window size is the viewport size.
    if (localStorage.getItem(seatKey(boardId)) === "2") return flipCamera(camera, window.innerWidth, window.innerHeight);
  } catch {}
  return camera;
}

/** `ids` plus every layer grouped with one of them, in paint order. */
function withGroups(layers: Liveblocks["Storage"]["layers"], order: readonly string[], ids: readonly string[]) {
  const groups = new Set(ids.map((id) => layers.get(id)?.get("groupId")).filter((g) => g !== undefined));
  if (groups.size === 0) return [...ids];
  return order.filter((id) => {
    const groupId = layers.get(id)?.get("groupId");
    return ids.includes(id) || (groupId !== undefined && groups.has(groupId));
  });
}

function sameDrop(a: DropTarget | null, b: DropTarget | null) {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && (a.kind === "hand" || (b.kind === "pile" && a.id === b.id));
}

/** True when canvas shortcuts should stay out of the way: typing, or a dialog is open. */
function isTypingTarget(target: EventTarget | null) {
  if (document.querySelector("[aria-modal]")) return true;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function newInsertLayer(tool: InsertTool, p: Point, style: Style): Layer {
  if (tool === "line" || tool === "arrow") {
    return {
      type: tool,
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [0, 0],
      ],
      stroke: style.color,
      strokeWidth: style.strokeWidth,
    };
  }
  return {
    type: tool,
    x: p.x,
    y: p.y,
    width: 0,
    height: 0,
    fill: style.fill,
    stroke: style.color,
    strokeWidth: style.strokeWidth,
  };
}

/** Geometry of a shape or line being dragged out from `origin` to `p`. Shift keeps it square or snaps to 45°. */
function insertGeometry(tool: InsertTool, origin: Point, p: Point, constrain: boolean): Partial<Layer> {
  if (tool === "line" || tool === "arrow") {
    let end = p;
    if (constrain) {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(p.y - origin.y, p.x - origin.x) / step) * step;
      const length = Math.hypot(p.x - origin.x, p.y - origin.y);
      end = { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
    }
    return normalizePoints([
      [origin.x, origin.y],
      [end.x, end.y],
    ]);
  }
  let w = p.x - origin.x;
  let h = p.y - origin.y;
  if (constrain) {
    const s = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * s;
    h = Math.sign(h || 1) * s;
  }
  return rectFromPoints(origin, { x: origin.x + w, y: origin.y + h });
}

async function imageSize(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth || 400, height: img.naturalHeight || 300 };
  } catch {
    return { width: 400, height: 300 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Canvas({ board }: { board: BoardInfo }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const handTrayRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ mode: "idle" });
  // Latest pointer position on the board, for "F flips the card under the cursor".
  const cursorRef = useRef<Point | null>(null);
  // Fingers on the board, in client pixels, by pointer id.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [camera, setCamera] = useState<Camera>(() => initialCamera(board.id));
  const [tool, setTool] = useState<Tool>("select");
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<XYWH | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [cutTargetId, setCutTargetId] = useState<string | null>(null);
  // Images picked for "Load", waiting in the load dialog.
  const [loadFiles, setLoadFiles] = useState<File[] | null>(null);
  const [browsePileId, setBrowsePileId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [handDrag, setHandDrag] = useState<{
    index: number;
    card: Card;
    x: number;
    y: number;
    faceDown: boolean;
  } | null>(null);
  // Touch stand-ins for Shift: add to the selection, and play cards from your hand or piles face down.
  const [multiSelect, setMultiSelect] = useState(false);
  const [playFaceDown, setPlayFaceDown] = useState(false);

  const compact = useMediaQuery(COMPACT_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const coarse = useMediaQuery(COARSE_QUERY);
  useDoubleTap(rootRef);

  const layerIds = useStorage((root) => root.layerIds);
  const selection = useSelf((me) => me.presence.selection);
  // "Select more" ends once nothing is selected.
  if (multiSelect && selection.length === 0) setMultiSelect(false);
  const myDraft = useSelf((me) => me.presence.pencilDraft);
  const updateMyPresence = useUpdateMyPresence();
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  useErrorListener((error) => {
    setNotice(`Connection problem: ${error.message}`);
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ---- Derived selection info -------------------------------------------

  const selectionBounds = useStorage(
    useCallback(
      (root) =>
        boundsOf(selection.map((id) => root.layers[id]).filter((l) => l !== undefined)),
      [selection],
    ),
    shallow,
  );

  const selectedTypes = useStorage(
    useCallback(
      (root) =>
        selection.map((id) => root.layers[id]?.type).filter((t): t is LayerType => t !== undefined),
      [selection],
    ),
    shallow,
  );

  // Each selected layer's group, or null if it isn't in one.
  const selectedGroups = useStorage(
    useCallback((root) => selection.map((id) => root.layers[id]?.groupId ?? null), [selection]),
    shallow,
  );
  const canUngroup = selectedGroups.some((g) => g !== null);
  // Grouping again is pointless when the selection is already exactly one group.
  const canGroup = selection.length > 1 && !(selectedGroups[0] && selectedGroups.every((g) => g === selectedGroups[0]));

  // A single selected die's or timer's settings, shown on their actions.
  const pieceSettings = useStorage(
    useCallback(
      (root) => {
        const l = selection.length === 1 ? root.layers[selection[0]] : undefined;
        if (l?.type === "die") return { sides: l.sides, seconds: 0, running: false };
        if (l?.type === "timer") return { sides: 0, seconds: l.seconds, running: l.endsAt !== null };
        return null;
      },
      [selection],
    ),
    shallow,
  );

  // The first selected layer's style, so the style bar reflects what is selected.
  const selectedStyle = useStorage(
    useCallback(
      (root) => {
        const l = selection.length > 0 ? root.layers[selection[0]] : undefined;
        if (!l || l.type === "image" || l.type === "pile") return null;
        if (l.type === "text") return { color: l.color, fontSize: l.fontSize };
        if ("color" in l) return { color: l.color };
        if (l.type === "rectangle" || l.type === "ellipse") {
          return { color: l.stroke, fill: l.fill, strokeWidth: l.strokeWidth };
        }
        return { color: l.stroke, strokeWidth: l.strokeWidth };
      },
      [selection],
    ),
    shallow,
  );

  // ---- Storage mutations ------------------------------------------------

  const insertLayer = useMutation(({ storage, setMyPresence }, id: string, layer: Layer, select: boolean) => {
    storage.get("layers").set(id, new LiveObject(layer));
    storage.get("layerIds").push(id);
    if (select) setMyPresence({ selection: [id] }, { addToHistory: true });
  }, []);

  const updateLayer = useMutation(({ storage }, id: string, patch: Partial<Layer>) => {
    storage.get("layers").get(id)?.update(patch);
  }, []);

  const deleteLayers = useMutation(({ storage, setMyPresence }, ids: readonly string[]) => {
    for (const id of ids) removeLayer(storage, id);
    setMyPresence({ selection: [] }, { addToHistory: true });
  }, []);

  const translateSelection = useMutation(({ storage, self }, dx: number, dy: number) => {
    const layers = storage.get("layers");
    for (const id of self.presence.selection) {
      const l = layers.get(id);
      if (l) l.update({ x: l.get("x") + dx, y: l.get("y") + dy });
    }
  }, []);

  const snapshotSelection = useMutation(({ storage, self }) => {
    const snapshot: Record<string, Layer> = {};
    for (const id of self.presence.selection) {
      const l = storage.get("layers").get(id);
      if (l) snapshot[id] = l.toJSON();
    }
    return snapshot;
  }, []);

  const resizeSelection = useMutation(
    ({ storage }, initial: Record<string, Layer>, bounds: XYWH, t: ReturnType<typeof resizeTransform>) => {
      for (const [id, layer] of Object.entries(initial)) {
        storage.get("layers").get(id)?.update(resizeLayer(layer, bounds, t));
      }
    },
    [],
  );

  const selectInRect = useMutation(({ storage, setMyPresence }, rect: XYWH, additive: readonly string[]) => {
    const ids = [...additive];
    const order = storage.get("layerIds").toJSON();
    for (const id of order) {
      const l = storage.get("layers").get(id);
      if (l && !ids.includes(id) && rectsIntersect(rect, l.toJSON())) ids.push(id);
    }
    setMyPresence({ selection: withGroups(storage.get("layers"), order, ids) });
  }, []);

  /** The layer and everything grouped with it. */
  const groupOf = useMutation(
    ({ storage }, id: string) => withGroups(storage.get("layers"), storage.get("layerIds").toJSON(), [id]),
    [],
  );

  /** Puts the selected layers in one new group, taking them out of any group they were in. */
  const groupSelection = useMutation(({ storage, self }) => {
    if (self.presence.selection.length < 2) return;
    const groupId = nanoid();
    for (const id of self.presence.selection) storage.get("layers").get(id)?.update({ groupId });
  }, []);

  const ungroupSelection = useMutation(({ storage, self }) => {
    for (const id of self.presence.selection) storage.get("layers").get(id)?.delete("groupId");
  }, []);

  const selectAll = useMutation(({ storage, setMyPresence }) => {
    setMyPresence({ selection: [...storage.get("layerIds").toJSON()] }, { addToHistory: true });
  }, []);

  const bringToFront = useMutation(({ storage, self }) => {
    const order = storage.get("layerIds");
    for (const id of order.toJSON().filter((id) => self.presence.selection.includes(id))) {
      order.move(order.indexOf(id), order.length - 1);
    }
  }, []);

  const sendToBack = useMutation(({ storage, self }) => {
    const order = storage.get("layerIds");
    const selected = order.toJSON().filter((id) => self.presence.selection.includes(id));
    for (const id of selected.reverse()) {
      order.move(order.indexOf(id), 0);
    }
  }, []);

  const duplicateSelection = useMutation(({ storage, self, setMyPresence }) => {
    const layers = storage.get("layers");
    const order = storage.get("layerIds");
    const copies: string[] = [];
    // Copies of a group form a new group of their own.
    const newGroupIds = new Map<string, string>();
    for (const id of order.toJSON()) {
      if (!self.presence.selection.includes(id)) continue;
      const l = layers.get(id);
      if (!l) continue;
      const copy = { ...l.toJSON() };
      copy.x += 20;
      copy.y += 20;
      if (copy.groupId) {
        if (!newGroupIds.has(copy.groupId)) newGroupIds.set(copy.groupId, nanoid());
        copy.groupId = newGroupIds.get(copy.groupId);
      }
      const copyId = nanoid();
      layers.set(copyId, new LiveObject(copy));
      order.push(copyId);
      copies.push(copyId);
      if (copy.type === "pile") {
        const cards = pileCards(storage, copyId);
        for (const card of storage.get("piles")?.get(id)?.toJSON() ?? []) cards.push(card as Card);
      }
    }
    if (copies.length) setMyPresence({ selection: copies }, { addToHistory: true });
  }, []);

  const styleSelection = useMutation(({ storage, self }, patch: Partial<Style>) => {
    for (const id of self.presence.selection) {
      const l = storage.get("layers").get(id);
      if (!l) continue;
      const type = l.get("type");
      const update: Record<string, string | number> = {};
      const stroked = STROKED_TYPES.includes(type);
      if (patch.color !== undefined && COLORED_TYPES.includes(type)) update.color = patch.color;
      if (patch.color !== undefined && stroked) update.stroke = patch.color;
      if (patch.fill !== undefined && (type === "rectangle" || type === "ellipse")) update.fill = patch.fill;
      if (patch.strokeWidth !== undefined && stroked) update.strokeWidth = patch.strokeWidth;
      if (patch.fontSize !== undefined && type === "text") update.fontSize = patch.fontSize;
      l.update(update as Partial<Layer>);
    }
  }, []);

  /** Gives tiny shapes a default size and drops lines that were just a click. */
  const finishInsert = useMutation(({ storage, setMyPresence }, id: string, origin: Point, minSize: number) => {
    const l = storage.get("layers").get(id);
    if (!l) return;
    const layer = l.toJSON();
    if (layer.width >= minSize || layer.height >= minSize) return;
    if (layer.type === "line" || layer.type === "arrow") {
      storage.get("layers").delete(id);
      const order = storage.get("layerIds");
      const index = order.indexOf(id);
      if (index !== -1) order.delete(index);
      setMyPresence({ selection: [] });
    } else {
      l.update({ x: origin.x - 60, y: origin.y - 40, width: 120, height: 80 });
    }
  }, []);

  // ---- Cards, hands and piles ------------------------------------------

  const ensureStorage = useMutation(({ storage }) => ensureCardStorage(storage), []);

  const currentSelection = useMutation(({ self }) => self.presence.selection, []);

  /** Topmost layer of one of `types` under a board point, skipping `exclude`. */
  const layerAt = useMutation(
    ({ storage }, p: Point, types: readonly LayerType[], exclude: readonly string[]) => {
      const order = storage.get("layerIds").toJSON();
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i];
        if (exclude.includes(id)) continue;
        const l = storage.get("layers").get(id)?.toJSON();
        if (l && types.includes(l.type) && p.x >= l.x && p.x <= l.x + l.width && p.y >= l.y && p.y <= l.y + l.height) {
          return id;
        }
      }
      return null;
    },
    [],
  );

  /** What a drag of the selection can drop: `cards` go to a hand or pile, `piles` merge into another pile. */
  const selectionDrops = useMutation(({ storage, self }) => {
    const types = self.presence.selection.map((id) => storage.get("layers").get(id)?.get("type"));
    return { cards: types.includes("image"), piles: types.includes("pile") };
  }, []);

  /** How many cards are inside the selected piles, to warn before deleting them. */
  const cardsInSelectedPiles = useMutation(
    ({ storage, self }) =>
      self.presence.selection.reduce((n, id) => n + (storage.get("piles")?.get(id)?.length ?? 0), 0),
    [],
  );

  /**
   * Moves the selected cards into your hand or onto a pile, keeping their stacking order.
   * Selected piles dropped onto another pile are merged into it, their cards going on top.
   */
  const moveSelectionTo = useMutation(({ storage, self, setMyPresence }, target: DropTarget) => {
    const layers = storage.get("layers");
    const dest = target.kind === "hand" ? handCards(storage, self.id) : pileCards(storage, target.id);
    const moved: string[] = [];
    for (const id of storage.get("layerIds").toJSON()) {
      if (!self.presence.selection.includes(id)) continue;
      const l = layers.get(id)?.toJSON();
      if (l?.type === "image") {
        dest.push(cardFromImage(l));
      } else if (l?.type === "pile" && target.kind === "pile" && id !== target.id) {
        for (const card of storage.get("piles")?.get(id)?.toJSON() ?? []) dest.push(card as Card);
      } else {
        continue;
      }
      removeLayer(storage, id);
      moved.push(id);
    }
    setMyPresence({ selection: self.presence.selection.filter((id) => !moved.includes(id)) }, { addToHistory: true });
  }, []);

  /** Turns cards a quarter turn clockwise about their centers. */
  const rotateCards = useMutation(({ storage }, ids: readonly string[]) => {
    for (const id of ids) {
      const l = storage.get("layers").get(id);
      const layer = l?.toJSON();
      if (layer?.type !== "image") continue;
      // The footprint turns too: swap width and height, keeping the center in place.
      l!.update({
        rotation: ((layer.rotation ?? 0) + 90) % 360,
        x: layer.x + (layer.width - layer.height) / 2,
        y: layer.y + (layer.height - layer.width) / 2,
        width: layer.height,
        height: layer.width,
      });
    }
  }, []);

  const flipLayers = useMutation(({ storage }, ids: readonly string[]) => {
    for (const id of ids) {
      const l = storage.get("layers").get(id);
      const layer = l?.toJSON();
      if (layer?.type === "image" || layer?.type === "pile") l!.update({ faceDown: !layer.faceDown });
    }
  }, []);

  const createPile = useMutation(({ storage, setMyPresence }, center: Point) => {
    const id = nanoid();
    const { width, height } = DEFAULT_PILE_SIZE;
    storage.get("layers").set(
      id,
      new LiveObject<Layer>({
        type: "pile",
        name: "Pile",
        faceDown: false,
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      }),
    );
    storage.get("layerIds").push(id);
    pileCards(storage, id);
    setMyPresence({ selection: [id] }, { addToHistory: true });
  }, []);

  /** Makes a pile holding `cards` (last = top), centered on `center` and sized like its top card. */
  const createPileOf = useMutation(
    ({ storage, setMyPresence }, cards: Card[], center: Point, name: string, faceDown: boolean) => {
      const top = cards[cards.length - 1];
      if (!top) return;
      const id = nanoid();
      storage.get("layers").set(
        id,
        new LiveObject<Layer>({
          type: "pile",
          name,
          faceDown,
          x: center.x - top.width / 2,
          y: center.y - top.height / 2,
          width: top.width,
          height: top.height,
        }),
      );
      storage.get("layerIds").push(id);
      const pile = pileCards(storage, id);
      for (const card of cards) pile.push(card);
      setMyPresence({ selection: [id] }, { addToHistory: true });
    },
    [],
  );

  /** Stacks the selected cards into a new pile where the topmost one was. */
  const makePile = useMutation(({ storage, self, setMyPresence }) => {
    const layers = storage.get("layers");
    const ids: string[] = [];
    const cards: Card[] = [];
    let top: XYWH | null = null;
    let allFaceDown = true;
    for (const id of storage.get("layerIds").toJSON()) {
      if (!self.presence.selection.includes(id)) continue;
      const l = layers.get(id)?.toJSON();
      if (l?.type !== "image") continue;
      ids.push(id);
      const card = cardFromImage(l);
      cards.push(card);
      // Upright, even if the card was turned, centered where it was.
      top = {
        x: l.x + (l.width - card.width) / 2,
        y: l.y + (l.height - card.height) / 2,
        width: card.width,
        height: card.height,
      };
      allFaceDown &&= !!l.faceDown;
    }
    if (!top) return;

    const pileId = nanoid();
    layers.set(pileId, new LiveObject<Layer>({ type: "pile", name: "Pile", faceDown: allFaceDown, ...top }));
    storage.get("layerIds").push(pileId);
    const pile = pileCards(storage, pileId);
    for (const card of cards) pile.push(card);
    for (const id of ids) removeLayer(storage, id);
    setMyPresence({ selection: [pileId] }, { addToHistory: true });
  }, []);

  /** A pile's or counter's name and type, or null for other layers. */
  const namedLayer = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id)?.toJSON();
    return l?.type === "pile" || l?.type === "counter" ? { type: l.type, name: l.name } : null;
  }, []);

  const counterValue = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id)?.toJSON();
    return l?.type === "counter" ? l.value : null;
  }, []);

  /** Sets a counter to `change(current value)`, kept to a whole number within range. */
  const changeCounter = useMutation(({ storage }, id: string, change: (value: number) => number) => {
    const l = storage.get("layers").get(id);
    const layer = l?.toJSON();
    if (layer?.type !== "counter") return;
    l!.update({ value: clamp(Math.round(change(layer.value)), -MAX_COUNTER, MAX_COUNTER) });
  }, []);

  /** Moves up to `n` cards from the top of a pile into your hand. Returns how many moved. */
  const drawCards = useMutation(({ storage, self }, pileId: string, n: number) => {
    const pile = pileCards(storage, pileId);
    const hand = handCards(storage, self.id);
    let drawn = 0;
    for (; drawn < n; drawn++) {
      const card = popTop(pile);
      if (!card) break;
      hand.push(card);
    }
    return drawn;
  }, []);

  /** Puts a pile's top card on the board (centered on `at`, or beside the pile). Returns its id. */
  const takeTopToBoard = useMutation(
    ({ storage, setMyPresence }, pileId: string, at: Point | null, faceDown: boolean) => {
      const card = popTop(pileCards(storage, pileId));
      if (!card) return null;
      const center = at ?? besidePile(storage, pileId, card);
      const id = nanoid();
      storage.get("layers").set(id, new LiveObject<Layer>(imageFromCard(card, center.x, center.y, faceDown)));
      storage.get("layerIds").push(id);
      setMyPresence({ selection: [id] }, { addToHistory: true });
      return id;
    },
    [],
  );

  const takeFromPile = useMutation(
    ({ storage, self, setMyPresence }, pileId: string, index: number, to: "hand" | "board") => {
      const pile = pileCards(storage, pileId);
      const card = pile.get(index);
      if (!card) return;
      pile.delete(index);
      if (to === "hand") {
        handCards(storage, self.id).push(card);
        return;
      }
      const center = besidePile(storage, pileId, card);
      const id = nanoid();
      storage.get("layers").set(id, new LiveObject<Layer>(imageFromCard(card, center.x, center.y, false)));
      storage.get("layerIds").push(id);
      setMyPresence({ selection: [id] }, { addToHistory: true });
    },
    [],
  );

  const shufflePile = useMutation(({ storage }, pileId: string) => {
    const pile = pileCards(storage, pileId);
    const cards = shuffled(pile.toJSON());
    pile.clear();
    for (const card of cards) pile.push(card as Card);
  }, []);

  // ---- Board game kit ---------------------------------------------------

  const layerTypeOf = useMutation(({ storage }, id: string) => storage.get("layers").get(id)?.get("type"), []);

  /** Rolls the dice among `ids`. Returns what each one rolled. */
  const rollDice = useMutation(({ storage }, ids: readonly string[]) => {
    const values: number[] = [];
    for (const id of ids) {
      const l = storage.get("layers").get(id);
      const layer = l?.toJSON();
      if (layer?.type !== "die") continue;
      const value = rollDie(layer.sides);
      l!.update({ value, rolls: layer.rolls + 1 });
      values.push(value);
    }
    return values;
  }, []);

  const tossCoins = useMutation(({ storage }, ids: readonly string[]) => {
    for (const id of ids) {
      const l = storage.get("layers").get(id);
      const layer = l?.toJSON();
      if (layer?.type === "coin") l!.update({ heads: Math.random() < 0.5, tosses: layer.tosses + 1 });
    }
  }, []);

  /** Switches a die to the next kind (d4 → d6 → … → d20 → d4), keeping its value if it still fits. */
  const nextDieSides = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id);
    const layer = l?.toJSON();
    if (layer?.type !== "die") return;
    const sides = DIE_SIDES[(DIE_SIDES.indexOf(layer.sides) + 1) % DIE_SIDES.length];
    l!.update({ sides, value: Math.min(layer.value, sides) });
  }, []);

  /** Switches a stopped timer to the next length (30 s → 1 min → 2 min → 5 min → 30 s). */
  const nextTimerLength = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id);
    const layer = l?.toJSON();
    if (layer?.type !== "timer") return;
    const index = TIMER_LENGTHS.indexOf(layer.seconds);
    l!.update({ seconds: TIMER_LENGTHS[(index + 1) % TIMER_LENGTHS.length], endsAt: null });
  }, []);

  /** Starts a stopped timer, or stops and resets a running one. */
  const toggleTimer = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id);
    const layer = l?.toJSON();
    if (layer?.type !== "timer") return;
    l!.update({ endsAt: layer.endsAt === null ? Date.now() + layer.seconds * 1000 : null });
  }, []);

  const chipLabel = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id)?.toJSON();
    return l?.type === "chip" ? l.label : null;
  }, []);

  const playFromHand = useMutation(
    ({ storage, self, setMyPresence }, index: number, at: Point, faceDown: boolean) => {
      const hand = handCards(storage, self.id);
      const card = hand.get(index);
      if (!card) return;
      hand.delete(index);
      const id = nanoid();
      storage.get("layers").set(id, new LiveObject<Layer>(imageFromCard(card, at.x, at.y, faceDown)));
      storage.get("layerIds").push(id);
      setMyPresence({ selection: [id] }, { addToHistory: true });
    },
    [],
  );

  const handToPile = useMutation(({ storage, self }, index: number, pileId: string) => {
    const hand = handCards(storage, self.id);
    const card = hand.get(index);
    if (!card) return;
    hand.delete(index);
    pileCards(storage, pileId).push(card);
  }, []);

  // Boards created before hands and piles need their card storage added once.
  const storageChecked = useRef(false);
  useEffect(() => {
    if (storageChecked.current) return;
    storageChecked.current = true;
    if (ensureStorage()) history.clear();
  }, [ensureStorage, history]);

  /**
   * Replaces an image (a sheet of cards) with one image layer per grid cell.
   * Each card reuses the sheet's URL with a crop, so nothing is re-uploaded.
   */
  const cutImage = useMutation(({ storage, setMyPresence }, id: string, options: CutOptions) => {
    const layers = storage.get("layers");
    const order = storage.get("layerIds");
    const sheet = layers.get(id)?.toJSON();
    if (!sheet || sheet.type !== "image") return;

    const base = sheet.crop ?? FULL_CROP;
    // Cells are fractions of the upright sheet, even if it was turned on the board.
    const upright = cardFromImage(sheet);
    // Keeping the sheet puts the cards to its right instead of on top of it.
    const originX = options.keepOriginal ? sheet.x + sheet.width + CARD_SPACING * 3 : sheet.x;
    const insertAt = order.indexOf(id) + 1;
    const ids: string[] = [];

    options.cells.forEach((cell, i) => {
      const { width, height } = cardSizeFor(upright.width * cell.width, upright.height * cell.height);
      const col = i % options.columns;
      const row = Math.floor(i / options.columns);
      const cardId = nanoid();
      layers.set(
        cardId,
        new LiveObject<Layer>({
          type: "image",
          url: sheet.url,
          x: originX + col * (width + CARD_SPACING),
          y: sheet.y + row * (height + CARD_SPACING),
          width,
          height,
          crop: {
            x: base.x + cell.x * base.width,
            y: base.y + cell.y * base.height,
            width: cell.width * base.width,
            height: cell.height * base.height,
          },
        }),
      );
      order.insert(cardId, insertAt + i);
      ids.push(cardId);
    });

    if (!options.keepOriginal) {
      layers.delete(id);
      order.delete(order.indexOf(id));
    }
    setMyPresence({ selection: ids }, { addToHistory: true });
  }, []);

  /** Removes a text box that was left empty. */
  const finishText = useMutation(({ storage, setMyPresence }, id: string) => {
    const l = storage.get("layers").get(id);
    if (!l) return;
    const layer = l.toJSON();
    if (layer.type === "text" && layer.text.trim() === "") {
      storage.get("layers").delete(id);
      const order = storage.get("layerIds");
      const index = order.indexOf(id);
      if (index !== -1) order.delete(index);
      setMyPresence({ selection: [] });
    }
  }, []);

  // ---- Helpers ----------------------------------------------------------

  function toWorld(e: { clientX: number; clientY: number }) {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX, e.clientY, rect, camera);
  }

  function viewportCenter() {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, camera);
  }

  function capture(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  /**
   * The selection after clicking a layer, which brings its whole group along. Shift adds or
   * removes the group; a plain click keeps the selection if the layer is already in it, so
   * the selection can be dragged, unless `replace` is set.
   */
  function clickSelection(id: string, shift: boolean, replace = false) {
    const group = groupOf(id);
    if (shift) {
      return selection.includes(id)
        ? selection.filter((s) => !group.includes(s))
        : [...selection, ...group.filter((s) => !selection.includes(s))];
    }
    return selection.includes(id) && !replace ? selection : group;
  }

  function setSelection(ids: string[]) {
    if (ids.length === 0 && selection.length === 0) return;
    updateMyPresence({ selection: ids }, { addToHistory: true });
  }

  /** Zooms keeping the point under (screenX, screenY) still, whichever way the board is turned. */
  function zoomAt(screenX: number, screenY: number, factor: number) {
    zoomTo(screenX, screenY, (zoom) => zoom * factor);
  }

  function zoomTo(screenX: number, screenY: number, next: (zoom: number) => number) {
    setCamera((c) => {
      const zoom = clamp(next(c.zoom), MIN_ZOOM, MAX_ZOOM);
      const k = zoom / c.zoom;
      return { ...c, zoom, x: screenX - (screenX - c.x) * k, y: screenY - (screenY - c.y) * k };
    });
  }

  function zoomFromCenter(factor: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  function changeSeat(flipped: boolean) {
    const rect = svgRef.current!.getBoundingClientRect();
    setCamera((c) => (c.flipped === flipped ? c : flipCamera(c, rect.width, rect.height)));
    try {
      localStorage.setItem(seatKey(board.id), flipped ? "2" : "1");
    } catch {}
  }

  function isOverHand(clientX: number, clientY: number) {
    const r = handTrayRef.current?.getBoundingClientRect();
    return !!r && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  /** Where cards dragged to this spot would go: your hand tray, a pile, or nowhere. */
  function dropTargetAt(clientX: number, clientY: number, p: Point, exclude: readonly string[]): DropTarget | null {
    if (isOverHand(clientX, clientY)) return { kind: "hand" };
    const pileId = layerAt(p, ["pile"], exclude);
    return pileId ? { kind: "pile", id: pileId } : null;
  }

  function draw(pileId: string, n: number) {
    const drawn = drawCards(pileId, n);
    if (drawn === 0) setNotice("That pile is empty.");
    else if (drawn < n) setNotice(`Only ${drawn} card${drawn === 1 ? " was" : "s were"} left.`);
  }

  function drawSeveral(pileId: string) {
    const answer = window.prompt("How many cards do you want to draw?", "2");
    const n = Number(answer);
    if (answer !== null && Number.isInteger(n) && n > 0) draw(pileId, n);
  }

  function renameLayer(id: string) {
    const current = namedLayer(id);
    if (current === null) return;
    const counter = current.type === "counter";
    const name = window.prompt(counter ? "Counter name" : "Pile name", current.name)?.trim();
    // Counter names must fit on the counter.
    if (name) updateLayer(id, { name: name.slice(0, counter ? 20 : 40) });
  }

  function addCounter(center: Point) {
    const { width, height } = COUNTER_SIZE;
    insertLayer(
      nanoid(),
      {
        type: "counter",
        name: "Counter",
        value: 0,
        color: COUNTER_COLOR,
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
      },
      true,
    );
    setTool("select");
  }

  /** Asks for an amount: "+3" or "-3" adds or subtracts, a plain number sets the counter. */
  function editCounter(id: string) {
    const current = counterValue(id);
    if (current === null) return;
    const answer = window.prompt(`Now ${current}. Type +3 or -3 to add or subtract, or a number to set it.`, "")?.trim();
    if (!answer) return;
    // Accepts the typographic minus (−) as well as "-".
    const match = answer.match(/^([+\-−])?\s*(\d+)$/);
    if (!match) {
      setNotice("Type a whole number, like 20, +3 or -3.");
      return;
    }
    const n = Number(match[2]);
    changeCounter(id, (value) => (match[1] === "+" ? value + n : match[1] ? value - n : n));
  }

  /** The − and + buttons on a counter. Shift steps by 5. */
  function onCounterStep(e: React.PointerEvent, id: string, delta: number) {
    // Other tools treat the press as being on the canvas.
    if (tool !== "select" || e.button !== 0 || spaceHeld || editingId) return;
    e.stopPropagation();
    changeCounter(id, (value) => value + delta * (e.shiftKey ? 5 : 1));
  }

  /** F flips the card or pile (or tosses the coin) under the cursor, or the selection if nothing is under it. */
  function flipAtCursor() {
    const p = cursorRef.current;
    const id = p ? layerAt(p, ["image", "pile", "coin"], []) : null;
    const ids = id ? [id] : selection;
    flipLayers(ids);
    tossCoins(ids);
  }

  /** Rolls the dice among `ids`, and adds them up when there's more than one. */
  function roll(ids: readonly string[]) {
    const values = rollDice(ids);
    if (values.length > 1) {
      const total = values.reduce((a, b) => a + b, 0);
      setNotice(`Rolled ${values.length} dice: ${values.join(" + ")} = ${total}`);
    }
  }

  function editChipLabel(id: string) {
    const current = chipLabel(id);
    if (current === null) return;
    const label = window.prompt(`Chip label (up to ${MAX_CHIP_LABEL} characters, empty for none)`, current);
    if (label !== null) updateLayer(id, { label: label.trim().slice(0, MAX_CHIP_LABEL) });
  }

  function onPieceDoubleClick(id: string) {
    if (tool !== "select") return;
    switch (layerTypeOf(id)) {
      case "die":
        roll([id]);
        break;
      case "coin":
        tossCoins([id]);
        break;
      case "chip":
        editChipLabel(id);
        break;
      case "timer":
        toggleTimer(id);
        break;
    }
  }

  function addPiece(kind: PieceKind) {
    insertLayer(nanoid(), newPiece(kind, viewportCenter()), true);
    setTool("select");
  }

  function deleteSelection() {
    if (selection.length === 0) return;
    const cards = cardsInSelectedPiles();
    if (cards > 0 && !window.confirm(`Delete the selected pile and the ${cards} card${cards === 1 ? "" : "s"} in it?`)) {
      return;
    }
    deleteLayers(selection);
  }

  function applyStyle(patch: Partial<Style>) {
    setStyle((s) => ({ ...s, ...patch }));
    if (selection.length > 0) styleSelection(patch);
  }

  function changeTool(next: Tool) {
    setTool(next);
    if (next !== "select") setSelection([]);
  }

  function createText(p: Point) {
    history.pause();
    const id = nanoid();
    insertLayer(
      id,
      {
        type: "text",
        x: p.x,
        y: p.y - style.fontSize * 0.75,
        width: 280,
        height: Math.ceil(style.fontSize * 1.4 + 8),
        text: "",
        fontSize: style.fontSize,
        color: style.color,
      },
      true,
    );
    setEditingId(id);
    setTool("select");
  }

  /** Uploads an image to blob storage. Returns its URL, or null after saying why it failed. */
  async function uploadImage(file: File): Promise<string | null> {
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice(`${file.name} is larger than 10 MB.`);
      return null;
    }
    setUploads((n) => n + 1);
    try {
      const blob = await upload(`boards/${board.id}/${file.name.replace(/[^\w.-]+/g, "_")}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: board.id,
      });
      return blob.url;
    } catch (error) {
      setNotice(`Couldn't upload ${file.name}: ${(error as Error).message}`);
      return null;
    } finally {
      setUploads((n) => n - 1);
    }
  }

  /** Uploads an image and places it centered on `at`. Returns the new layer's id. */
  async function addImage(file: File, at: Point, maxSide = MAX_IMAGE_SIDE): Promise<string | null> {
    if (!file.type.startsWith("image/")) return null;
    const [size, url] = await Promise.all([imageSize(file), uploadImage(file)]);
    if (!url) return null;
    const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
    const width = size.width * scale;
    const height = size.height * scale;
    const id = nanoid();
    insertLayer(id, { type: "image", x: at.x - width / 2, y: at.y - height / 2, width, height, url }, true);
    setTool("select");
    return id;
  }

  /** Uploads every sheet, cuts them and stacks all the cards in a new pile centered on `at`. */
  async function loadPile(options: LoadOptions, at: Point) {
    const urls = await Promise.all(options.sheets.map((sheet) => uploadImage(sheet.file)));
    const cards: Card[] = [];
    options.sheets.forEach((sheet, i) => {
      const url = urls[i];
      if (!url) return;
      for (const cell of sheet.cells) {
        const whole = cell.x === 0 && cell.y === 0 && cell.width === 1 && cell.height === 1;
        cards.push({
          url,
          ...cardSizeFor(sheet.width * cell.width, sheet.height * cell.height),
          ...(whole ? {} : { crop: cell }),
        });
      }
    });
    if (cards.length === 0) return;
    // A pile's top is its last card, so reverse to keep the first card loaded on top.
    createPileOf(options.shuffle ? shuffled(cards) : cards.reverse(), at, options.name, options.faceDown);
    setTool("select");
  }

  function addImages(files: Iterable<File>, at: Point) {
    let offset = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      addImage(file, { x: at.x + offset, y: at.y + offset });
      offset += 30;
    }
  }

  // ---- Pointer handling -------------------------------------------------

  /**
   * Runs before the board's and the layers' own handlers. Tracks fingers on the board: a second
   * finger drops whatever the first was doing and starts a pinch instead.
   */
  function onCanvasPointerDownCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch") return;
    // Keeps the browser from following the touch with emulated mouse events, which would take
    // focus away from a text box the touch just opened.
    if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size < 2) return;
    e.stopPropagation();
    // A third finger carries on with the pinch the first two started.
    if (touches.current.size > 2) return;
    cancelGesture();
    for (const id of touches.current.keys()) {
      try {
        svgRef.current?.setPointerCapture(id);
      } catch {} // That finger was already lifted.
    }
    const [a, b] = [...touches.current.values()];
    const rect = svgRef.current!.getBoundingClientRect();
    gesture.current = {
      mode: "pinching",
      startMid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
      startDistance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
      startCamera: camera,
    };
  }

  /** Drops what one finger was doing when a second one lands. Moves already made stay. */
  function cancelGesture() {
    clearTimeout(longPressTimer.current);
    const g = gesture.current;
    gesture.current = { mode: "idle" };
    switch (g.mode) {
      case "panning":
        setPanning(false);
        break;
      case "marquee":
        setMarquee(null);
        break;
      case "translating":
        setDropTarget(null);
        history.resume();
        break;
      case "resizing":
      case "pilePress":
        history.resume();
        break;
      case "inserting":
        deleteLayers([g.id]);
        history.resume();
        break;
      case "drawing":
        updateMyPresence({ pencilDraft: null });
        break;
    }
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (editingId) {
      // This click just ends text editing. A tap on a phone doesn't take focus from the text box, so blur it here.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }

    if (e.button === 1 || spaceHeld || tool === "hand") {
      e.preventDefault();
      capture(e);
      gesture.current = { mode: "panning", startX: e.clientX, startY: e.clientY, startCamera: camera };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;

    const p = toWorld(e);
    capture(e);

    switch (tool) {
      case "select": {
        const additive = e.shiftKey || multiSelect;
        if (e.pointerType === "touch") {
          // A finger pans the board, and a tap clears the selection when it's lifted. Holding
          // the finger still first draws a selection box instead.
          const pressing: Extract<Gesture, { mode: "pressing" }> = {
            mode: "pressing",
            origin: p,
            additive: additive ? selection : [],
            touch: { x: e.clientX, y: e.clientY },
          };
          gesture.current = pressing;
          clearTimeout(longPressTimer.current);
          longPressTimer.current = setTimeout(() => {
            if (gesture.current !== pressing) return;
            gesture.current = { mode: "marquee", origin: p, additive: pressing.additive };
            setMarquee({ x: p.x, y: p.y, width: 0, height: 0 });
            navigator.vibrate?.(10);
          }, LONG_PRESS_MS);
          break;
        }
        if (!additive) setSelection([]);
        gesture.current = { mode: "pressing", origin: p, additive: additive ? selection : [], touch: null };
        break;
      }
      case "pen":
        gesture.current = { mode: "drawing", points: [[p.x, p.y]] };
        updateMyPresence({ pencilDraft: [[p.x, p.y]], pencilColor: style.color, pencilWidth: style.strokeWidth });
        break;
      case "text":
        createText(p);
        break;
      case "rectangle":
      case "ellipse":
      case "line":
      case "arrow": {
        history.pause();
        const id = nanoid();
        insertLayer(id, newInsertLayer(tool, p, style), true);
        gesture.current = { mode: "inserting", id, tool, origin: p };
        break;
      }
    }
  }

  function onLayerPointerDown(e: React.PointerEvent, id: string) {
    // Let other tools (and panning) handle the press as if on empty canvas.
    if (tool !== "select" || e.button !== 0 || spaceHeld || editingId) return;
    e.stopPropagation();
    capture(e);

    const deselectOnTap = multiSelect && !e.shiftKey && selection.includes(id);
    const next = deselectOnTap ? selection : clickSelection(id, e.shiftKey || multiSelect);
    if (next !== selection) updateMyPresence({ selection: next }, { addToHistory: true });

    history.pause();
    const p = toWorld(e);
    gesture.current = {
      mode: "translating",
      last: p,
      drops: selectionDrops(),
      drop: null,
      deselectOnTap: deselectOnTap ? { id, origin: p } : undefined,
    };
  }

  function onPileBodyPointerDown(e: React.PointerEvent, id: string) {
    if (tool !== "select" || e.button !== 0 || spaceHeld || editingId) return;
    e.stopPropagation();
    capture(e);
    history.pause();
    gesture.current = { mode: "pilePress", pileId: id, origin: toWorld(e), shift: e.shiftKey };
  }

  /** Dragging a card out of your hand: onto the board (Shift = face down) or onto a pile. */
  function onHandCardPointerDown(e: React.PointerEvent, index: number, card: Card) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const touch = e.pointerType === "touch";
    let dragging = false;
    let drop: DropTarget | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) < (touch ? TAP_SLOP : 4)) return;
        // A finger moving sideways scrolls the hand; the browser cancels this drag when it does.
        if (touch && Math.abs(dx) > Math.abs(dy)) return;
      }
      dragging = true;
      const p = toWorld(ev);
      cursorRef.current = p;
      updateMyPresence({ cursor: p });
      setHandDrag({ index, card, x: ev.clientX, y: ev.clientY, faceDown: ev.shiftKey || playFaceDown });
      const next = isOverHand(ev.clientX, ev.clientY) ? null : dropTargetAt(ev.clientX, ev.clientY, p, []);
      if (!sameDrop(next, drop)) {
        drop = next;
        setDropTarget(next);
      }
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setHandDrag(null);
      setDropTarget(null);
      // Released back over the hand (or cancelled): nothing happens.
      if (!dragging || ev.type === "pointercancel" || isOverHand(ev.clientX, ev.clientY)) return;
      if (drop?.kind === "pile") handToPile(index, drop.id);
      else playFromHand(index, toWorld(ev), ev.shiftKey || playFaceDown);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function onHandlePointerDown(e: React.PointerEvent, handle: Handle) {
    if (e.button !== 0 || !selectionBounds) return;
    e.stopPropagation();
    capture(e);
    const layers = snapshotSelection();
    history.pause();
    gesture.current = {
      mode: "resizing",
      handle,
      bounds: selectionBounds,
      layers,
      keepAspect: Object.values(layers).some((l) => KEEP_ASPECT_TYPES.includes(l.type)),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.mode === "pinching") {
      // Once one finger is lifted, the other does nothing until it's lifted too.
      if (touches.current.size >= 2) pinch(g);
      return;
    }

    const p = toWorld(e);
    cursorRef.current = p;
    updateMyPresence({ cursor: p });

    switch (g.mode) {
      case "panning":
        setCamera({
          ...g.startCamera,
          x: g.startCamera.x + e.clientX - g.startX,
          y: g.startCamera.y + e.clientY - g.startY,
        });
        break;
      case "pressing":
        if (g.touch) {
          if (Math.hypot(e.clientX - g.touch.x, e.clientY - g.touch.y) > TAP_SLOP) {
            clearTimeout(longPressTimer.current);
            gesture.current = { mode: "panning", startX: g.touch.x, startY: g.touch.y, startCamera: camera };
            setPanning(true);
          }
        } else if (Math.hypot(p.x - g.origin.x, p.y - g.origin.y) * camera.zoom > 4) {
          gesture.current = { mode: "marquee", origin: g.origin, additive: g.additive };
        }
        break;
      case "marquee": {
        const rect = rectFromPoints(g.origin, p);
        setMarquee(rect);
        selectInRect(rect, g.additive);
        break;
      }
      case "translating":
        translateSelection(p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        if (g.drops.cards || g.drops.piles) {
          let drop = dropTargetAt(e.clientX, e.clientY, p, currentSelection());
          // Only loose cards go into a hand; piles only merge into piles.
          if (drop?.kind === "hand" && !g.drops.cards) drop = null;
          if (!sameDrop(drop, g.drop)) {
            g.drop = drop;
            setDropTarget(drop);
          }
        }
        break;
      case "pilePress":
        if (Math.hypot(p.x - g.origin.x, p.y - g.origin.y) * camera.zoom > 4) {
          if (takeTopToBoard(g.pileId, p, g.shift || playFaceDown)) {
            gesture.current = { mode: "translating", last: p, drops: { cards: true, piles: false }, drop: null };
          } else {
            // Empty pile: drag the pile itself.
            updateMyPresence({ selection: [g.pileId] }, { addToHistory: true });
            translateSelection(p.x - g.origin.x, p.y - g.origin.y);
            gesture.current = { mode: "translating", last: p, drops: { cards: false, piles: true }, drop: null };
          }
        }
        break;
      case "resizing":
        resizeSelection(g.layers, g.bounds, resizeTransform(g.bounds, g.handle, p, g.keepAspect || e.shiftKey));
        break;
      case "inserting":
        updateLayer(g.id, insertGeometry(g.tool, g.origin, p, e.shiftKey));
        break;
      case "drawing": {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) * camera.zoom < 1.5) break;
        g.points.push([p.x, p.y]);
        updateMyPresence({ pencilDraft: [...g.points] });
        break;
      }
    }
  }

  /** Zooms and pans so the board point that was between the two fingers stays between them. */
  function pinch(g: Extract<Gesture, { mode: "pinching" }>) {
    const [a, b] = [...touches.current.values()];
    const rect = svgRef.current!.getBoundingClientRect();
    const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
    const start = g.startCamera;
    const zoom = clamp((start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDistance, MIN_ZOOM, MAX_ZOOM);
    const k = zoom / start.zoom;
    setCamera({ ...start, zoom, x: mid.x - (g.startMid.x - start.x) * k, y: mid.y - (g.startMid.y - start.y) * k });
  }

  function onPointerUp(e: React.PointerEvent) {
    clearTimeout(longPressTimer.current);
    touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.mode === "pinching") {
      if (touches.current.size === 0) gesture.current = { mode: "idle" };
      return;
    }
    gesture.current = { mode: "idle" };
    // A cancelled touch (the browser took it over) isn't a tap.
    const lifted = e.type === "pointerup";

    switch (g.mode) {
      case "panning":
        setPanning(false);
        break;
      case "pressing":
        // A tap on empty board. The mouse already cleared the selection when pressed.
        if (g.touch && lifted && !multiSelect) setSelection([]);
        break;
      case "marquee":
        setMarquee(null);
        break;
      case "translating":
        if (g.drop) {
          moveSelectionTo(g.drop);
          setDropTarget(null);
        } else if (g.deselectOnTap && lifted) {
          const { id, origin } = g.deselectOnTap;
          const p = toWorld(e);
          if (Math.hypot(p.x - origin.x, p.y - origin.y) * camera.zoom < TAP_SLOP) {
            updateMyPresence({ selection: clickSelection(id, true) }, { addToHistory: true });
          }
        }
        history.resume();
        break;
      case "resizing":
        history.resume();
        break;
      case "pilePress": {
        // A click without dragging selects the pile, which shows its actions.
        updateMyPresence({ selection: clickSelection(g.pileId, g.shift || multiSelect, true) }, { addToHistory: true });
        history.resume();
        break;
      }
      case "inserting":
        finishInsert(g.id, g.origin, 4 / camera.zoom);
        history.resume();
        setTool("select");
        break;
      case "drawing": {
        updateMyPresence({ pencilDraft: null });
        const points = g.points.length === 1 ? [g.points[0], g.points[0]] : g.points;
        insertLayer(
          nanoid(),
          { type: "path", ...normalizePoints(points), stroke: style.color, strokeWidth: style.strokeWidth },
          false,
        );
        break;
      }
    }
  }

  // Text editing keeps all keystrokes in one undo step.
  function onLayerDoubleClick(id: string) {
    if (tool !== "select") return;
    history.pause();
    setEditingId(id);
  }

  function onTextChange(id: string, text: string, height: number) {
    updateLayer(id, { text, height });
  }

  function onTextEditEnd(id: string) {
    finishText(id);
    history.resume();
    setEditingId(null);
  }

  // LayerView is memoized, so give it stable callbacks that call the latest handlers.
  const handlers = {
    onLayerPointerDown,
    onPileBodyPointerDown,
    onPileRename: renameLayer,
    onCounterStep,
    onCounterEdit: editCounter,
    onCardRotate: (id: string) => {
      if (tool === "select") rotateCards([id]);
    },
    onPieceDoubleClick,
    onLayerDoubleClick,
    onTextChange,
    onTextEditEnd,
  };
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });
  const stableHandlers = useMemo(
    () => ({
      onLayerPointerDown: (e: React.PointerEvent, id: string) => handlersRef.current.onLayerPointerDown(e, id),
      onPileBodyPointerDown: (e: React.PointerEvent, id: string) => handlersRef.current.onPileBodyPointerDown(e, id),
      onPileRename: (id: string) => handlersRef.current.onPileRename(id),
      onCounterStep: (e: React.PointerEvent, id: string, delta: number) =>
        handlersRef.current.onCounterStep(e, id, delta),
      onCounterEdit: (id: string) => handlersRef.current.onCounterEdit(id),
      onCardRotate: (id: string) => handlersRef.current.onCardRotate(id),
      onPieceDoubleClick: (id: string) => handlersRef.current.onPieceDoubleClick(id),
      onLayerDoubleClick: (id: string) => handlersRef.current.onLayerDoubleClick(id),
      onTextChange: (id: string, text: string, height: number) => handlersRef.current.onTextChange(id, text, height),
      onTextEditEnd: (id: string) => handlersRef.current.onTextEditEnd(id),
    }),
    [],
  );

  // ---- Wheel, keyboard and paste ----------------------------------------

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : 1; // Some browsers scroll in lines.
      const dx = e.deltaX * scale;
      const dy = e.deltaY * scale;
      if (e.ctrlKey || e.metaKey) {
        if (dy === 0) return;
        // Each scroll step moves the zoom by one percentage point, landing on whole percentages.
        const rect = svg!.getBoundingClientRect();
        zoomTo(e.clientX - rect.left, e.clientY - rect.top, (zoom) => Math.round(zoom * 100 - Math.sign(dy)) / 100);
      } else if (e.shiftKey) {
        setCamera((c) => ({ ...c, x: c.x - dy }));
      } else {
        setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
      }
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    // A finger can be lifted where the board doesn't hear it, e.g. when the layer it pressed was removed.
    function forgetTouch(e: PointerEvent) {
      touches.current.delete(e.pointerId);
      if (touches.current.size === 0 && gesture.current.mode === "pinching") gesture.current = { mode: "idle" };
    }
    // Safari zooms the whole page on a pinch unless its own gesture events are cancelled.
    function preventPageZoom(e: Event) {
      e.preventDefault();
    }
    window.addEventListener("pointerup", forgetTouch);
    window.addEventListener("pointercancel", forgetTouch);
    document.addEventListener("gesturestart", preventPageZoom);
    return () => {
      window.removeEventListener("pointerup", forgetTouch);
      window.removeEventListener("pointercancel", forgetTouch);
      document.removeEventListener("gesturestart", preventPageZoom);
    };
  }, []);

  const keyHandlersRef = useRef({
    selection,
    deleteSelection,
    flipAtCursor,
    selectAll,
    duplicateSelection,
    groupSelection,
    ungroupSelection,
    history,
    setSelection,
    addImages,
    viewportCenter,
  });
  useLayoutEffect(() => {
    keyHandlersRef.current = {
    selection,
    deleteSelection,
    flipAtCursor,
    selectAll,
    duplicateSelection,
    groupSelection,
    ungroupSelection,
    history,
    setSelection,
    addImages,
    viewportCenter,
  };
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const h = keyHandlersRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) h.history.redo();
        else h.history.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        h.history.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        h.selectAll();
      } else if (mod && key === "d") {
        e.preventDefault();
        h.duplicateSelection();
      } else if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) h.ungroupSelection();
        else h.groupSelection();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (h.selection.length > 0) {
          e.preventDefault();
          h.deleteSelection();
        }
      } else if (e.key === "Escape") {
        h.setSelection([]);
        setTool("select");
      } else if (!mod && !e.altKey && key === "f") {
        h.flipAtCursor();
      } else if (!mod && !e.altKey && TOOL_SHORTCUTS[key]) {
        setTool(TOOL_SHORTCUTS[key]);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    function onBlur() {
      setSpaceHeld(false);
    }
    function onPaste(e: ClipboardEvent) {
      if (isTypingTarget(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      const h = keyHandlersRef.current;
      h.addImages(files, h.viewportCenter());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  // ---- Render -----------------------------------------------------------

  let controls: StyleControls;
  if (selectedTypes.length > 0) {
    controls = {
      color: selectedTypes.some((t) => COLORED_TYPES.includes(t) || STROKED_TYPES.includes(t)),
      fill: selectedTypes.some((t) => t === "rectangle" || t === "ellipse"),
      strokeWidth: selectedTypes.some((t) => STROKED_TYPES.includes(t)),
      fontSize: selectedTypes.includes("text"),
    };
  } else {
    controls = {
      color: ["pen", "text", "rectangle", "ellipse", "line", "arrow"].includes(tool),
      fill: tool === "rectangle" || tool === "ellipse",
      strokeWidth: ["pen", "rectangle", "ellipse", "line", "arrow"].includes(tool),
      fontSize: tool === "text",
    };
  }
  const shownStyle = { ...style, ...selectedStyle };

  const contextActions: ContextAction[] = [];
  const onePile = selection.length === 1 && selectedTypes[0] === "pile" ? selection[0] : null;
  if (onePile) {
    contextActions.push(
      { label: "Draw", icon: "draw", title: "Draw the top card into your hand", onClick: () => draw(onePile, 1) },
      { label: "Draw…", icon: "draw", title: "Draw several cards into your hand", onClick: () => drawSeveral(onePile) },
      {
        label: "Take top",
        icon: "take",
        title: "Put the top card on the board (or drag it off the pile)",
        onClick: () => {
          if (!takeTopToBoard(onePile, null, false)) setNotice("That pile is empty.");
        },
      },
      { label: "Shuffle", icon: "shuffle", onClick: () => shufflePile(onePile) },
      { label: "Flip", icon: "flip", title: "Flip the pile (F)", onClick: () => flipLayers([onePile]) },
      { label: "Look through", icon: "eye", onClick: () => setBrowsePileId(onePile) },
      { label: "Rename", icon: "rename", onClick: () => renameLayer(onePile) },
    );
  }
  const oneCounter = selection.length === 1 && selectedTypes[0] === "counter" ? selection[0] : null;
  if (oneCounter) {
    contextActions.push(
      {
        label: "Change…",
        icon: "counter",
        title: "Add, subtract or set a value (or double-click the counter)",
        onClick: () => editCounter(oneCounter),
      },
      { label: "Rename", icon: "rename", onClick: () => renameLayer(oneCounter) },
    );
  }
  if (selectedTypes.includes("die")) {
    const several = selectedTypes.filter((t) => t === "die").length > 1;
    contextActions.push({
      label: several ? "Roll all" : "Roll",
      icon: "die",
      title: several ? "Roll the selected dice and add them up" : "Roll (or double-click the die)",
      onClick: () => roll(selection),
    });
  }
  if (pieceSettings && pieceSettings.sides > 0) {
    contextActions.push({
      label: `d${pieceSettings.sides}`,
      icon: "die",
      title: "Change the number of sides (d4, d6, d8, d10, d12, d20)",
      onClick: () => nextDieSides(selection[0]),
    });
  }
  if (selectedTypes.includes("coin")) {
    contextActions.push({ label: "Toss", icon: "coin", title: "Toss (F, or double-click the coin)", onClick: () => tossCoins(selection) });
  }
  if (selection.length === 1 && selectedTypes[0] === "chip") {
    contextActions.push({ label: "Label…", icon: "rename", title: "Change the label (or double-click the chip)", onClick: () => editChipLabel(selection[0]) });
  }
  if (pieceSettings && pieceSettings.seconds > 0) {
    const timerId = selection[0];
    contextActions.push(
      pieceSettings.running
        ? { label: "Reset", icon: "rotate", title: "Stop and reset (or double-click the timer)", onClick: () => toggleTimer(timerId) }
        : { label: "Start", icon: "play", title: "Start (or double-click the timer)", onClick: () => toggleTimer(timerId) },
      {
        label: formatLength(pieceSettings.seconds),
        icon: "timer",
        title: "Change the length (30 s, 1 min, 2 min, 5 min). Resets the timer.",
        onClick: () => nextTimerLength(timerId),
      },
    );
  }
  if (selectedTypes.includes("image")) {
    contextActions.push(
      { label: "Add to hand", icon: "to_hand", onClick: () => moveSelectionTo({ kind: "hand" }) },
      { label: "Make pile", icon: "pile", onClick: makePile },
      { label: "Flip", icon: "flip", title: "Flip (F)", onClick: () => flipLayers(selection) },
      { label: "Rotate", icon: "rotate", title: "Turn 90° right (double-click a card)", onClick: () => rotateCards(selection) },
    );
  }
  if (selection.length === 1 && selectedTypes[0] === "image") {
    contextActions.push({ label: "Cut into cards", icon: "scissors", onClick: () => setCutTargetId(selection[0]) });
  }

  let cursor = "default";
  if (panning) cursor = "grabbing";
  else if (spaceHeld || tool === "hand") cursor = "grab";
  else if (tool === "text") cursor = "text";
  else if (tool !== "select") cursor = "crosshair";

  const gridSize = 24 * camera.zoom;

  const toolbar = (
    <Toolbar
      compact={compact}
      row={narrow}
      tool={tool}
      onToolChange={changeTool}
      onUploadClick={() => fileInputRef.current?.click()}
      onSheetUploadClick={() => sheetInputRef.current?.click()}
      onLoadClick={() => loadInputRef.current?.click()}
      onNewPileClick={() => createPile(viewportCenter())}
      onNewCounterClick={() => addCounter(viewportCenter())}
      onAddPiece={addPiece}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={history.undo}
      onRedo={history.redo}
    />
  );

  const handTray = (
    <HandTray
      trayRef={handTrayRef}
      compact={compact}
      docked={narrow}
      highlighted={dropTarget?.kind === "hand"}
      draggingIndex={handDrag?.index ?? null}
      onCardPointerDown={onHandCardPointerDown}
      flipped={camera.flipped}
      onFlippedChange={changeSeat}
      faceDown={playFaceDown}
      onFaceDownChange={setPlayFaceDown}
    />
  );

  return (
    <div
      ref={rootRef}
      className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#f7f7f8] [-webkit-touch-callout:none]"
      style={{
        backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      // A long press on a phone opens the browser's menu otherwise.
      onContextMenu={(e) => {
        if (!isTypingTarget(e.target)) e.preventDefault();
      }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor }}
        onPointerDownCapture={onCanvasPointerDownCapture}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => updateMyPresence({ cursor: null })}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          addImages(e.dataTransfer.files, toWorld(e));
        }}
      >
        <CardBackDefs />
        <g transform={`translate(${camera.x} ${camera.y})${camera.flipped ? " rotate(180)" : ""} scale(${camera.zoom})`}>
          {layerIds.map((id) => (
            <LayerView
              key={id}
              id={id}
              zoom={camera.zoom}
              flipped={camera.flipped}
              isEditing={editingId === id}
              isDropTarget={dropTarget?.kind === "pile" && dropTarget.id === id}
              {...stableHandlers}
            />
          ))}
          <OthersSelections zoom={camera.zoom} />
          {selectionBounds && !editingId && (
            <SelectionBox
              bounds={selectionBounds}
              zoom={camera.zoom}
              showHandles={tool === "select"}
              onHandlePointerDown={onHandlePointerDown}
            />
          )}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgb(79 70 229 / 0.08)"
              stroke="#4f46e5"
              strokeWidth={1 / camera.zoom}
              pointerEvents="none"
            />
          )}
          <OthersDrafts />
          {myDraft && <DraftPath points={myDraft} color={style.color} width={style.strokeWidth} />}
          <Cursors zoom={camera.zoom} flipped={camera.flipped} />
        </g>
      </svg>

      <BoardHeader name={board.name} compact={compact} onShare={() => setShareOpen(true)} />

      {!narrow && toolbar}

      <StyleBar
        narrow={narrow}
        style={shownStyle}
        controls={controls}
        onChange={applyStyle}
        multiSelect={coarse ? { on: multiSelect, onToggle: () => setMultiSelect((on) => !on) } : undefined}
        selectionActions={
          selection.length > 0
            ? {
                onBringToFront: bringToFront,
                onSendToBack: sendToBack,
                onDuplicate: duplicateSelection,
                onDelete: deleteSelection,
                onGroup: canGroup ? groupSelection : undefined,
                onUngroup: canUngroup ? ungroupSelection : undefined,
              }
            : undefined
        }
        contextActions={contextActions}
      />

      {/* Phones zoom with two fingers instead. */}
      <div
        className={`absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-md ${compact ? "hidden" : ""}`}
      >
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomFromCenter(1 / 1.2)}
          className="grid size-8 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100"
        >
          <Icon name="minus" className="size-4" />
        </button>
        <button
          type="button"
          title="Reset zoom · Scroll to pan, Ctrl + scroll to zoom, Space + drag to move, F to flip a card"
          onClick={() => zoomFromCenter(1 / camera.zoom)}
          className="h-8 w-14 rounded-lg text-xs font-semibold tabular-nums text-zinc-700 hover:bg-zinc-100"
        >
          {Math.round(camera.zoom * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomFromCenter(1.2)}
          className="grid size-8 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100"
        >
          <Icon name="plus" className="size-4" />
        </button>
      </div>

      {narrow ? (
        // Phones held upright: your hand sits on the toolbar at the bottom.
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2">
          {handTray}
          {toolbar}
        </div>
      ) : (
        handTray
      )}

      {handDrag && (
        <div
          className="pointer-events-none fixed z-40 opacity-90 drop-shadow-xl"
          style={{
            left: handDrag.x - (handDrag.card.width * camera.zoom) / 2,
            top: handDrag.y - (handDrag.card.height * camera.zoom) / 2,
          }}
        >
          <CardImage
            card={handDrag.card}
            width={Math.round(handDrag.card.width * camera.zoom)}
            height={Math.round(handDrag.card.height * camera.zoom)}
            faceDown={handDrag.faceDown}
          />
        </div>
      )}

      {(uploads > 0 || notice) && (
        <div
          className={`absolute left-1/2 z-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg ${narrow ? "top-28" : "top-16"}`}
        >
          {uploads > 0 ? `Uploading ${uploads} image${uploads > 1 ? "s" : ""}…` : notice}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addImages(Array.from(e.target.files), viewportCenter());
          e.target.value = "";
        }}
      />

      <input
        ref={sheetInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const id = await addImage(file, viewportCenter(), MAX_SHEET_SIDE);
          if (id) setCutTargetId(id);
        }}
      />

      <input
        ref={loadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) setLoadFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {shareOpen && <ShareDialog board={board} onClose={() => setShareOpen(false)} />}

      {browsePileId && (
        <PileBrowser
          pileId={browsePileId}
          onClose={() => setBrowsePileId(null)}
          onTake={(index, to) => takeFromPile(browsePileId, index, to)}
        />
      )}

      {loadFiles && (
        <LoadDialog
          files={loadFiles}
          onClose={() => setLoadFiles(null)}
          onLoad={(options) => {
            loadPile(options, viewportCenter());
            setLoadFiles(null);
          }}
        />
      )}

      {cutTargetId && (
        <CutDialog
          layerId={cutTargetId}
          onClose={() => setCutTargetId(null)}
          onCut={(options) => {
            cutImage(cutTargetId, options);
            setCutTargetId(null);
          }}
        />
      )}
    </div>
  );
}
