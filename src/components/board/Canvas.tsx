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
  ensureCardStorage,
  handCards,
  imageFromCard,
  pileCards,
  popTop,
  removeLayer,
  shuffled,
} from "./cards";
import { CutDialog, type CutOptions } from "./CutDialog";
import {
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
import { Cursors, DraftPath, OthersDrafts, OthersSelections, SelectionBox } from "./Overlays";
import { PileBrowser } from "./PileBrowser";
import { ShareDialog, type BoardInfo } from "./ShareDialog";
import { StyleBar, Toolbar, type ContextAction, type StyleControls } from "./Toolbar";
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

// Layers that have a stroke color and width.
const STROKED_TYPES: LayerType[] = ["rectangle", "ellipse", "path", "line", "arrow"];

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
  | { mode: "pressing"; origin: Point; additive: readonly string[] }
  | { mode: "marquee"; origin: Point; additive: readonly string[] }
  // `cards`: the selection has cards that can be dropped into a hand or onto a pile.
  | { mode: "translating"; last: Point; cards: boolean; drop: DropTarget | null }
  // Pressed on a pile: a drag pulls its top card off, a click selects the pile.
  | { mode: "pilePress"; pileId: string; origin: Point; shift: boolean }
  | { mode: "resizing"; handle: Handle; bounds: XYWH; layers: Record<string, Layer>; keepAspect: boolean }
  | { mode: "inserting"; id: string; tool: InsertTool; origin: Point }
  | { mode: "drawing"; points: number[][] };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const handTrayRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ mode: "idle" });
  // Latest pointer position on the board, for "F flips the card under the cursor".
  const cursorRef = useRef<Point | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
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
  const [browsePileId, setBrowsePileId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [handDrag, setHandDrag] = useState<{
    index: number;
    card: Card;
    x: number;
    y: number;
    faceDown: boolean;
  } | null>(null);

  const layerIds = useStorage((root) => root.layerIds);
  const selection = useSelf((me) => me.presence.selection);
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

  // The first selected layer's style, so the style bar reflects what is selected.
  const selectedStyle = useStorage(
    useCallback(
      (root) => {
        const l = selection.length > 0 ? root.layers[selection[0]] : undefined;
        if (!l || l.type === "image" || l.type === "pile") return null;
        if (l.type === "text") return { color: l.color, fontSize: l.fontSize };
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
    for (const id of storage.get("layerIds").toJSON()) {
      const l = storage.get("layers").get(id);
      if (l && !ids.includes(id) && rectsIntersect(rect, l.toJSON())) ids.push(id);
    }
    setMyPresence({ selection: ids });
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
    for (const id of order.toJSON()) {
      if (!self.presence.selection.includes(id)) continue;
      const l = layers.get(id);
      if (!l) continue;
      const copy = { ...l.toJSON() };
      copy.x += 20;
      copy.y += 20;
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
      if (patch.color !== undefined && type === "text") update.color = patch.color;
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

  const selectionHasCards = useMutation(
    ({ storage, self }) => self.presence.selection.some((id) => storage.get("layers").get(id)?.get("type") === "image"),
    [],
  );

  /** How many cards are inside the selected piles, to warn before deleting them. */
  const cardsInSelectedPiles = useMutation(
    ({ storage, self }) =>
      self.presence.selection.reduce((n, id) => n + (storage.get("piles")?.get(id)?.length ?? 0), 0),
    [],
  );

  /** Moves the selected cards into your hand or onto a pile, keeping their stacking order. */
  const moveSelectionTo = useMutation(({ storage, self, setMyPresence }, target: DropTarget) => {
    const layers = storage.get("layers");
    const dest = target.kind === "hand" ? handCards(storage, self.id) : pileCards(storage, target.id);
    const moved: string[] = [];
    for (const id of storage.get("layerIds").toJSON()) {
      if (!self.presence.selection.includes(id)) continue;
      const l = layers.get(id)?.toJSON();
      if (l?.type !== "image") continue;
      dest.push(cardFromImage(l));
      removeLayer(storage, id);
      moved.push(id);
    }
    setMyPresence({ selection: self.presence.selection.filter((id) => !moved.includes(id)) }, { addToHistory: true });
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
      cards.push(cardFromImage(l));
      top = { x: l.x, y: l.y, width: l.width, height: l.height };
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

  const pileName = useMutation(({ storage }, id: string) => {
    const l = storage.get("layers").get(id)?.toJSON();
    return l?.type === "pile" ? l.name : null;
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
    // Keeping the sheet puts the cards to its right instead of on top of it.
    const originX = options.keepOriginal ? sheet.x + sheet.width + CARD_SPACING * 3 : sheet.x;
    const insertAt = order.indexOf(id) + 1;
    const ids: string[] = [];

    options.cells.forEach((cell, i) => {
      const width = sheet.width * cell.width;
      const height = sheet.height * cell.height;
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

  function setSelection(ids: string[]) {
    if (ids.length === 0 && selection.length === 0) return;
    updateMyPresence({ selection: ids }, { addToHistory: true });
  }

  function zoomAt(screenX: number, screenY: number, factor: number) {
    setCamera((c) => {
      const zoom = clamp(c.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const wx = (screenX - c.x) / c.zoom;
      const wy = (screenY - c.y) / c.zoom;
      return { zoom, x: screenX - wx * zoom, y: screenY - wy * zoom };
    });
  }

  function zoomFromCenter(factor: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
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

  function renamePile(id: string) {
    const current = pileName(id);
    if (current === null) return;
    const name = window.prompt("Pile name", current)?.trim();
    if (name) updateLayer(id, { name: name.slice(0, 40) });
  }

  /** F flips the card or pile under the cursor, or the selection if nothing is under it. */
  function flipAtCursor() {
    const p = cursorRef.current;
    const id = p ? layerAt(p, ["image", "pile"], []) : null;
    if (id) flipLayers([id]);
    else if (selection.length > 0) flipLayers(selection);
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

  /** Uploads an image and places it centered on `at`. Returns the new layer's id. */
  async function addImage(file: File, at: Point, maxSide = MAX_IMAGE_SIDE): Promise<string | null> {
    if (!file.type.startsWith("image/")) return null;
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice(`${file.name} is larger than 10 MB.`);
      return null;
    }
    setUploads((n) => n + 1);
    try {
      const [size, blob] = await Promise.all([
        imageSize(file),
        upload(`boards/${board.id}/${file.name.replace(/[^\w.-]+/g, "_")}`, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          clientPayload: board.id,
        }),
      ]);
      const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
      const width = size.width * scale;
      const height = size.height * scale;
      const id = nanoid();
      insertLayer(
        id,
        { type: "image", x: at.x - width / 2, y: at.y - height / 2, width, height, url: blob.url },
        true,
      );
      setTool("select");
      return id;
    } catch (error) {
      setNotice(`Couldn't upload ${file.name}: ${(error as Error).message}`);
      return null;
    } finally {
      setUploads((n) => n - 1);
    }
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

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (editingId) return; // This click just ends text editing.

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
      case "select":
        if (!e.shiftKey) setSelection([]);
        gesture.current = { mode: "pressing", origin: p, additive: e.shiftKey ? selection : [] };
        break;
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

    let next = selection;
    if (e.shiftKey) {
      next = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
    } else if (!selection.includes(id)) {
      next = [id];
    }
    if (next !== selection) updateMyPresence({ selection: next }, { addToHistory: true });

    history.pause();
    gesture.current = { mode: "translating", last: toWorld(e), cards: selectionHasCards(), drop: null };
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
    let dragging = false;
    let drop: DropTarget | null = null;

    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      dragging = true;
      const p = toWorld(ev);
      cursorRef.current = p;
      updateMyPresence({ cursor: p });
      setHandDrag({ index, card, x: ev.clientX, y: ev.clientY, faceDown: ev.shiftKey });
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
      else playFromHand(index, toWorld(ev), ev.shiftKey);
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
      keepAspect: Object.values(layers).some((l) => l.type === "image" || l.type === "pile"),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toWorld(e);
    cursorRef.current = p;
    updateMyPresence({ cursor: p });

    const g = gesture.current;
    switch (g.mode) {
      case "panning":
        setCamera({
          ...g.startCamera,
          x: g.startCamera.x + e.clientX - g.startX,
          y: g.startCamera.y + e.clientY - g.startY,
        });
        break;
      case "pressing":
        if (Math.hypot(p.x - g.origin.x, p.y - g.origin.y) * camera.zoom > 4) {
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
        if (g.cards) {
          const drop = dropTargetAt(e.clientX, e.clientY, p, currentSelection());
          if (!sameDrop(drop, g.drop)) {
            g.drop = drop;
            setDropTarget(drop);
          }
        }
        break;
      case "pilePress":
        if (Math.hypot(p.x - g.origin.x, p.y - g.origin.y) * camera.zoom > 4) {
          if (takeTopToBoard(g.pileId, p, g.shift)) {
            gesture.current = { mode: "translating", last: p, cards: true, drop: null };
          } else {
            // Empty pile: drag the pile itself.
            updateMyPresence({ selection: [g.pileId] }, { addToHistory: true });
            translateSelection(p.x - g.origin.x, p.y - g.origin.y);
            gesture.current = { mode: "translating", last: p, cards: false, drop: null };
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

  function onPointerUp() {
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
        if (g.drop) {
          moveSelectionTo(g.drop);
          setDropTarget(null);
        }
        history.resume();
        break;
      case "resizing":
        history.resume();
        break;
      case "pilePress": {
        // A click without dragging selects the pile, which shows its actions.
        let next = [g.pileId];
        if (g.shift) {
          next = selection.includes(g.pileId) ? selection.filter((s) => s !== g.pileId) : [...selection, g.pileId];
        }
        updateMyPresence({ selection: next }, { addToHistory: true });
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
    onPileRename: renamePile,
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
        const rect = svg!.getBoundingClientRect();
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * 0.01));
      } else if (e.shiftKey) {
        setCamera((c) => ({ ...c, x: c.x - dy }));
      } else {
        setCamera((c) => ({ ...c, x: c.x - dx, y: c.y - dy }));
      }
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const keyHandlersRef = useRef({
    selection,
    deleteSelection,
    flipAtCursor,
    selectAll,
    duplicateSelection,
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
      color: selectedTypes.some((t) => t === "text" || STROKED_TYPES.includes(t)),
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
      { label: "Rename", icon: "rename", onClick: () => renamePile(onePile) },
    );
  }
  if (selectedTypes.includes("image")) {
    contextActions.push(
      { label: "Add to hand", icon: "to_hand", onClick: () => moveSelectionTo({ kind: "hand" }) },
      { label: "Make pile", icon: "pile", onClick: makePile },
      { label: "Flip", icon: "flip", title: "Flip (F)", onClick: () => flipLayers(selection) },
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

  return (
    <div
      className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#f7f7f8]"
      style={{
        backgroundImage: "radial-gradient(#d4d4d8 1px, transparent 1px)",
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor }}
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
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {layerIds.map((id) => (
            <LayerView
              key={id}
              id={id}
              zoom={camera.zoom}
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
          <Cursors zoom={camera.zoom} />
        </g>
      </svg>

      <BoardHeader name={board.name} onShare={() => setShareOpen(true)} />

      <Toolbar
        tool={tool}
        onToolChange={changeTool}
        onUploadClick={() => fileInputRef.current?.click()}
        onSheetUploadClick={() => sheetInputRef.current?.click()}
        onNewPileClick={() => createPile(viewportCenter())}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
      />

      <StyleBar
        style={shownStyle}
        controls={controls}
        onChange={applyStyle}
        selectionActions={
          selection.length > 0
            ? {
                onBringToFront: bringToFront,
                onSendToBack: sendToBack,
                onDuplicate: duplicateSelection,
                onDelete: deleteSelection,
              }
            : undefined
        }
        contextActions={contextActions}
      />

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-md">
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

      <HandTray
        trayRef={handTrayRef}
        highlighted={dropTarget?.kind === "hand"}
        draggingIndex={handDrag?.index ?? null}
        onCardPointerDown={onHandCardPointerDown}
      />

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
        <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
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

      {shareOpen && <ShareDialog board={board} onClose={() => setShareOpen(false)} />}

      {browsePileId && (
        <PileBrowser
          pileId={browsePileId}
          onClose={() => setBrowsePileId(null)}
          onTake={(index, to) => takeFromPile(browsePileId, index, to)}
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
