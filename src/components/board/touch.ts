"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Phones either way up, and short windows: smaller controls and a shorter toolbar. */
export const COMPACT_QUERY = "(max-width: 639px), (max-height: 639px)";
/** Phones held upright: the toolbar moves to the bottom, under your hand. */
export const NARROW_QUERY = "(max-width: 639px)";
/** A finger is the main pointer. */
export const COARSE_QUERY = "(pointer: coarse)";

// A finger that moves less than this many pixels is a tap, not a drag.
export const TAP_SLOP = 10;
// Holding a finger still this long starts a selection box on the board, or previews a card in your hand.
export const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DISTANCE = 30;

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Mobile browsers don't reliably fire dblclick for a double tap, so two quick taps in one spot
 * inside `ref` become a dblclick, which reaches the same onDoubleClick handlers as a mouse.
 * The browser's own dblclick after a touch is dropped so a double tap never counts twice.
 */
export function useDoubleTap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!ref.current) return;
    const root: HTMLElement = ref.current;
    let down: { x: number; y: number; time: number; target: EventTarget | null } | null = null;
    let lastTap: { x: number; y: number; time: number } | null = null;
    let lastTouch = -Infinity;

    // On window, ahead of React, because the board stops a second finger's pointerdown from going further.
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch" || !root.contains(e.target as Node)) return;
      lastTouch = e.timeStamp;
      // A second finger makes this a pinch, not a tap.
      down = e.isPrimary ? { x: e.clientX, y: e.clientY, time: e.timeStamp, target: e.target } : null;
      if (!e.isPrimary) lastTap = null;
    }
    function onPointerCancel() {
      down = null;
      lastTap = null;
    }
    // On window, so it runs after React has handled the second tap's pointerup, the way a
    // mouse's dblclick comes after its mouseup. Still inside the touch, so a text box that
    // opens can bring up the on-screen keyboard.
    function onPointerUp(e: PointerEvent) {
      if (e.pointerType !== "touch" || !e.isPrimary || !down) return;
      const tap = down;
      down = null;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) {
        lastTap = null;
        return;
      }
      const second =
        lastTap !== null &&
        tap.time - lastTap.time < DOUBLE_TAP_MS &&
        Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < DOUBLE_TAP_DISTANCE;
      lastTap = second ? null : tap;
      if (second && tap.target instanceof Element && tap.target.isConnected) {
        tap.target.dispatchEvent(
          new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2, clientX: e.clientX, clientY: e.clientY }),
        );
      }
    }
    function onDoubleClick(e: MouseEvent) {
      if (e.isTrusted && e.timeStamp - lastTouch < 1000) e.stopPropagation();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    root.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      root.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [ref]);
}
