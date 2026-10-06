import { useEffect, useRef, useState } from "react";

const POS_STORAGE_KEY = "vireon-log-drawer-pos";

const loadSavedPosition = () => {
  const fallback = { edge: "right", offset: typeof window === "undefined" ? 400 : Math.round(window.innerHeight / 2) };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_STORAGE_KEY) || "null");
    if (saved && (saved.edge === "right" || saved.edge === "left") && Number.isFinite(saved.offset)) return saved;
  } catch {
    /* ignore storage errors */
  }
  return fallback;
};

/**
 * Where the drawer is docked. It only ever sits on the right or left screen
 * edge - never floating mid-screen. `edge` is the side, `offset` the vertical
 * center along it in px. Dragging the handle moves it along the edge and
 * switches sides when the pointer crosses the middle; the spot is persisted.
 *
 * `wasDrag()` lets a click handler on the same element ignore the click that
 * ends a drag.
 */
export function useEdgeDock() {
  const [position, setPosition] = useState(loadSavedPosition);
  const dragRef = useRef(null); // { startX, startY, edge, moved } while dragging
  const lastDragMovedRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({ edge: position.edge, offset: Math.round(position.offset) }));
    } catch {
      /* ignore storage errors */
    }
  }, [position]);

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, edge: position.edge, moved: false };
    lastDragMovedRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) drag.moved = true;

    // Switch sides when the pointer crosses the screen's horizontal middle.
    let edge = drag.edge;
    if (edge === "right" && e.clientX < W / 2) edge = "left";
    else if (edge === "left" && e.clientX >= W / 2) edge = "right";
    drag.edge = edge;

    // Stay docked on the side edge, following the pointer vertically.
    setPosition({ edge, offset: Math.min(Math.max(e.clientY, 70), H - 70) });
  };

  const onPointerEnd = () => {
    lastDragMovedRef.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
  };

  return {
    edge: position.edge,
    offset: position.offset,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
    wasDrag: () => lastDragMovedRef.current,
  };
}
