export type Point = { x: number; y: number };
export type XYWH = { x: number; y: number; width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };

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

export type ImageLayer = {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};

export type Layer = ShapeLayer | StrokeLayer | TextLayer | ImageLayer;
export type LayerType = Layer["type"];

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
