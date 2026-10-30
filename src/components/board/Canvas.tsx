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
import {
  normalizePoints,
  rectFromPoints,
  rectsIntersect,
  resizeLayer,
  resizeTransform,
  screenToWorld,
  boundsOf,
} from "./geometry";
import { Icon } from "./Icon";
import { LayerView } from "./LayerView";
import { Cursors, DraftPath, OthersDrafts, OthersSelections, SelectionBox } from "./Overlays";
import { ShareDialog, type BoardInfo } from "./ShareDialog";
import { StyleBar, Toolbar, type StyleControls } from "./Toolbar";
import type { Camera, Handle, InsertTool, Layer, LayerType, Point, Style, Tool, XYWH } from "./types";

const DEFAULT_STYLE: Style = { color: "#1e1e1e", fill: "transparent", strokeWidth: 4, fontSize: 24 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 480;

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
  | { mode: "translating"; last: Point }
  | { mode: "resizing"; handle: Handle; bounds: XYWH; layers: Record<string, Layer>; keepAspect: boolean }
  | { mode: "inserting"; id: string; tool: InsertTool; origin: Point }
  | { mode: "drawing"; points: number[][] };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function isTypingTarget(target: EventTarget | null) {
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
  const gesture = useRef<Gesture>({ mode: "idle" });

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
        if (!l || l.type === "image") return null;
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
    const layers = storage.get("layers");
    const order = storage.get("layerIds");
    for (const id of ids) {
      layers.delete(id);
      const index = order.indexOf(id);
      if (index !== -1) order.delete(index);
    }
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
    }
    if (copies.length) setMyPresence({ selection: copies }, { addToHistory: true });
  }, []);

  const styleSelection = useMutation(({ storage, self }, patch: Partial<Style>) => {
    for (const id of self.presence.selection) {
      const l = storage.get("layers").get(id);
      if (!l) continue;
      const type = l.get("type");
      const update: Record<string, string | number> = {};
      if (patch.color !== undefined && type !== "image") update[type === "text" ? "color" : "stroke"] = patch.color;
      if (patch.fill !== undefined && (type === "rectangle" || type === "ellipse")) update.fill = patch.fill;
      if (patch.strokeWidth !== undefined && type !== "text" && type !== "image") update.strokeWidth = patch.strokeWidth;
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

  async function addImage(file: File, at: Point) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice(`${file.name} is larger than 10 MB.`);
      return;
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
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(size.width, size.height));
      const width = size.width * scale;
      const height = size.height * scale;
      insertLayer(
        nanoid(),
        { type: "image", x: at.x - width / 2, y: at.y - height / 2, width, height, url: blob.url },
        true,
      );
      setTool("select");
    } catch (error) {
      setNotice(`Couldn't upload ${file.name}: ${(error as Error).message}`);
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
    gesture.current = { mode: "translating", last: toWorld(e) };
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
      keepAspect: Object.values(layers).some((l) => l.type === "image"),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = toWorld(e);
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
      case "resizing":
        history.resume();
        break;
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
  const handlers = { onLayerPointerDown, onLayerDoubleClick, onTextChange, onTextEditEnd };
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });
  const stableHandlers = useMemo(
    () => ({
      onLayerPointerDown: (e: React.PointerEvent, id: string) => handlersRef.current.onLayerPointerDown(e, id),
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

  const keyHandlersRef = useRef({ selection, deleteLayers, selectAll, duplicateSelection, history, setSelection, addImages, viewportCenter });
  useLayoutEffect(() => {
    keyHandlersRef.current = { selection, deleteLayers, selectAll, duplicateSelection, history, setSelection, addImages, viewportCenter };
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
          h.deleteLayers(h.selection);
        }
      } else if (e.key === "Escape") {
        h.setSelection([]);
        setTool("select");
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
      color: selectedTypes.some((t) => t !== "image"),
      fill: selectedTypes.some((t) => t === "rectangle" || t === "ellipse"),
      strokeWidth: selectedTypes.some((t) => t !== "text" && t !== "image"),
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
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {layerIds.map((id) => (
            <LayerView key={id} id={id} zoom={camera.zoom} isEditing={editingId === id} {...stableHandlers} />
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
                onDelete: () => deleteLayers(selection),
              }
            : undefined
        }
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
          title="Reset zoom"
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

      <p className="pointer-events-none absolute bottom-4 left-3 hidden text-xs text-zinc-400 md:block">
        Scroll to pan · Ctrl + scroll to zoom · Space + drag to move around
      </p>

      {(uploads > 0 || notice) && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
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

      {shareOpen && <ShareDialog board={board} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
