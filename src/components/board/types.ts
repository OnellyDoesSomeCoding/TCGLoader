export type Point = { x: number; y: number };
export type XYWH = { x: number; y: number; width: number; height: number };
// `flipped` is Player 2's seat: the board is turned 180° so their side of the table is at the bottom.
export type Camera = { x: number; y: number; zoom: number; flipped: boolean };

export type ShapeLayer = {
  type: "rectangle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

// Freehand paths, lines and arrows. `points` are [x, y] pairs relative to (x, y).
export type StrokeLayer = {
  type: "path" | "line" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  points: number[][];
  stroke: string;
  strokeWidth: number;
};

export type TextLayer = {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  color: string;
};

/** Part of a source image to show, as fractions (0–1) of its full width and height. */
export type Crop = { x: number; y: number; width: number; height: number };

export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };

export type ImageLayer = {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  // Set on cards cut from a sheet; missing means the whole image.
  crop?: Crop;
  // Face-down cards show the shared card back to everyone.
  faceDown?: boolean;
  // Clockwise turn in degrees: 0, 90, 180 or 270. Missing means 0. x/y/width/height
  // are always the turned footprint, so a sideways card's width and height are swapped.
  rotation?: number;
};

/** A stack of cards on the board. Its cards live in storage `piles[id]`, last = top. */
export type PileLayer = {
  type: "pile";
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  faceDown: boolean;
};

/** A named number with − and + buttons, for life, damage, mana and the like. */
export type CounterLayer = {
  type: "counter";
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  color: string;
};

// Board game kit pieces. `rolls` and `tosses` count up on every roll or toss, so everyone's
// screen can play the animation, even when the result is the same as before.

/** A die with 4, 6, 8, 10, 12 or 20 sides. */
export type DieLayer = {
  type: "die";
  x: number;
  y: number;
  width: number;
  height: number;
  sides: number;
  value: number;
  rolls: number;
  color: string;
};

export type CoinLayer = {
  type: "coin";
  x: number;
  y: number;
  width: number;
  height: number;
  heads: boolean;
  tosses: number;
  color: string;
};

/** A playing piece to move around. */
export type PawnLayer = {
  type: "pawn";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

/** A round marker with a short label, for damage, status effects, turn order and the like. */
export type ChipLayer = {
  type: "chip";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
};

/** A countdown everyone sees. `endsAt` is when it runs out (ms since epoch), or null when stopped. */
export type TimerLayer = {
  type: "timer";
  x: number;
  y: number;
  width: number;
  height: number;
  seconds: number;
  endsAt: number | null;
  color: string;
};

/** A card while it's off the board, in a pile or a hand. Width/height are its board size. */
export type Card = {
  url: string;
  width: number;
  height: number;
  crop?: Crop;
};

/** Layers grouped together share a `groupId`, so they're selected and moved as one. */
type Grouping = { groupId?: string };

export type Layer = (
  | ShapeLayer
  | StrokeLayer
  | TextLayer
  | ImageLayer
  | PileLayer
  | CounterLayer
  | DieLayer
  | CoinLayer
  | PawnLayer
  | ChipLayer
  | TimerLayer
) &
  Grouping;
export type LayerType = Layer["type"];

/** Where dragged cards will land when released. */
export type DropTarget = { kind: "hand" } | { kind: "pile"; id: string };

/** Read-only point list, as returned by Liveblocks' immutable storage snapshots. */
export type Points = ReadonlyArray<ReadonlyArray<number>>;

export type Tool = "select" | "hand" | "pen" | "text" | "rectangle" | "ellipse" | "line" | "arrow";
export type InsertTool = "rectangle" | "ellipse" | "line" | "arrow";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type Style = {
  color: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
};
