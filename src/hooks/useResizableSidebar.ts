import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "saasmail.sidebarWidth";
const DEFAULT_WIDTH = 384; // matches the original w-96
const MIN_WIDTH = 56; // tighter than this and the avatars overflow
const MAX_WIDTH = 640;
/** Below this, the list collapses to "compact" mode (just avatars). */
export const COMPACT_THRESHOLD = 110;

/**
 * Resizable-sidebar state. Returns the current width (clamped), a
 * setter for programmatic updates, a boolean for "compact" mode (width
 * below COMPACT_THRESHOLD), and a `startDrag` handler to wire to a
 * resize handle's `onMouseDown` / `onTouchStart`.
 *
 * Persists to localStorage so the user's choice sticks across reloads.
 */
export function useResizableSidebar() {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_WIDTH;
    const n = Number(saved);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  });
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const startDrag = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      startXRef.current = x;
      startWidthRef.current = width;
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent | TouchEvent) {
      const x =
        "touches" in e
          ? (e as TouchEvent).touches[0].clientX
          : (e as MouseEvent).clientX;
      const delta = x - startXRef.current;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidthRef.current + delta),
      );
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    // Disable text selection during drag so the cursor feels right.
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.userSelect = prev;
      document.body.style.cursor = "";
    };
  }, [dragging]);

  return {
    width,
    setWidth,
    dragging,
    startDrag,
    isCompact: width < COMPACT_THRESHOLD,
  };
}
