import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  SensorAPI,
  PreDragActions,
  FluidDragActions,
} from "@hello-pangea/dnd";
import { markTouch } from "./touch-recency";

/**
 * Custom touch sensor for @hello-pangea/dnd.
 *
 * Pangea's bundled touch sensor (`useTouchSensor`) gates drag-start behind a
 * 120ms long-press timer (`timeForLongPress = 120`). On mobile that makes
 * basket / chord chips feel "armed" — the user has to press-and-hold before a
 * drag will start, which conflicts with our intended UX:
 *
 *   1. quick tap   → focus / toggle selection (handled by onClick)
 *   2. drag finger → move the chord (should start instantly, no hold required)
 *
 * This sensor flips that: the lock is taken on touchstart, but we stay in
 * PENDING until the finger has travelled past a small movement threshold (or
 * a generous safety hold-timer fires). A release before any movement aborts
 * cleanly so the trailing click still fires for selection.
 */

const MOVEMENT_THRESHOLD_PX = 0;
// Safety net: if the user holds without moving for this long we promote to a
// drag anyway (matches the press-and-hold mental model). Larger than pangea's
// 120ms default so quick taps reliably stay as taps.
const HOLD_PROMOTION_MS = 120;

type Phase =
  | { type: "IDLE" }
  | {
      type: "PENDING";
      preDrag: PreDragActions;
      start: { x: number; y: number };
      promotionTimerId: number;
    }
  | { type: "DRAGGING"; actions: FluidDragActions };

const idle: Phase = { type: "IDLE" };

function getPoint(e: TouchEvent): { x: number; y: number } | null {
  const t = e.touches[0] ?? e.changedTouches[0];
  if (!t) return null;
  return { x: t.clientX, y: t.clientY };
}

export function useInstantTouchSensor(api: SensorAPI) {
  const phaseRef = useRef<Phase>(idle);
  // Holds the latest unbind function for the move/end/cancel listeners that
  // are bound while a touch interaction is active.
  const unbindRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.type === "PENDING") window.clearTimeout(cur.promotionTimerId);
    if (unbindRef.current) {
      unbindRef.current();
      unbindRef.current = null;
    }
    phaseRef.current = idle;
  }, []);

  const forceStop = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.type === "PENDING") cur.preDrag.abort();
    if (cur.type === "DRAGGING") cur.actions.cancel();
    reset();
  }, [reset]);

  const promote = useCallback((point: { x: number; y: number }) => {
    const cur = phaseRef.current;
    if (cur.type !== "PENDING") return;
    window.clearTimeout(cur.promotionTimerId);
    const actions = cur.preDrag.fluidLift(point);
    phaseRef.current = { type: "DRAGGING", actions };
  }, []);

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const point = getPoint(e);
      if (!point) return;
      const cur = phaseRef.current;
      if (cur.type === "PENDING") {
        const dx = point.x - cur.start.x;
        const dy = point.y - cur.start.y;
        if (dx * dx + dy * dy < MOVEMENT_THRESHOLD_PX * MOVEMENT_THRESHOLD_PX) {
          return;
        }
        e.preventDefault();
        promote(point);
        return;
      }
      if (cur.type === "DRAGGING") {
        e.preventDefault();
        cur.actions.move(point);
      }
    },
    [promote],
  );

  const onTouchEnd = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.type === "PENDING") {
      cur.preDrag.abort();
      reset();
      return;
    }
    if (cur.type === "DRAGGING") {
      cur.actions.drop();
      reset();
    }
  }, [reset]);

  const onTouchCancel = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.type === "PENDING") {
      cur.preDrag.abort();
      reset();
      return;
    }
    if (cur.type === "DRAGGING") {
      cur.actions.cancel();
      reset();
    }
  }, [reset]);

  // Scrolling during PENDING means the user actually wanted to scroll, not
  // drag. Releasing the lock lets the page scroll naturally.
  const onWindowScroll = useCallback(() => {
    const cur = phaseRef.current;
    if (cur.type === "PENDING") {
      cur.preDrag.abort();
      reset();
    }
  }, [reset]);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      // Mark every real touch so the companion mouse sensor can ignore the
      // synthetic mousedown iOS/Android dispatches a few hundred ms later.
      markTouch();
      if (e.defaultPrevented) return;
      if (phaseRef.current.type !== "IDLE") return;
      const id = api.findClosestDraggableId(e);
      if (!id) return;
      const preDrag = api.tryGetLock(id, forceStop, { sourceEvent: e });
      if (!preDrag) return;
      const start = getPoint(e);
      if (!start) {
        preDrag.abort();
        return;
      }
      const promotionTimerId = window.setTimeout(() => {
        const cur = phaseRef.current;
        if (cur.type === "PENDING") promote(cur.start);
      }, HOLD_PROMOTION_MS);
      phaseRef.current = {
        type: "PENDING",
        preDrag,
        start,
        promotionTimerId,
      };

      const moveOpts: AddEventListenerOptions = {
        passive: false,
        capture: false,
      };
      const endOpts: AddEventListenerOptions = {
        passive: true,
        capture: false,
      };
      const scrollOpts: AddEventListenerOptions = {
        passive: true,
        capture: true,
      };
      window.addEventListener("touchmove", onTouchMove, moveOpts);
      window.addEventListener("touchend", onTouchEnd, endOpts);
      window.addEventListener("touchcancel", onTouchCancel, endOpts);
      window.addEventListener("scroll", onWindowScroll, scrollOpts);
      unbindRef.current = () => {
        window.removeEventListener("touchmove", onTouchMove, moveOpts);
        window.removeEventListener("touchend", onTouchEnd, endOpts);
        window.removeEventListener("touchcancel", onTouchCancel, endOpts);
        window.removeEventListener("scroll", onWindowScroll, scrollOpts as EventListenerOptions);
      };
    },
    [api, forceStop, onTouchMove, onTouchEnd, onTouchCancel, onWindowScroll, promote],
  );

  const startBinding = useMemo(
    () => ({
      eventName: "touchstart" as const,
      fn: onTouchStart,
      options: { passive: false, capture: true } as AddEventListenerOptions,
    }),
    [onTouchStart],
  );

  useEffect(() => {
    window.addEventListener(startBinding.eventName, startBinding.fn as EventListener, startBinding.options);
    return () => {
      window.removeEventListener(startBinding.eventName, startBinding.fn as EventListener, startBinding.options);
      // Make sure any in-flight drag is cleaned up if the context unmounts.
      forceStop();
    };
  }, [startBinding, forceStop]);
}
