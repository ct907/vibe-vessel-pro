import { useCallback, useEffect, useRef } from "react";
import type {
  SensorAPI,
  PreDragActions,
  FluidDragActions,
} from "@hello-pangea/dnd";
import { isLikelySyntheticMouse } from "./touch-recency";

/**
 * Custom mouse sensor for @hello-pangea/dnd.
 *
 * Why we don't use the bundled `useMouseSensor`:
 *
 * On touch devices, after a real `touchend` the browser dispatches a
 * synthetic `mousedown` → `mouseup` → `click` chain. Pangea's stock mouse
 * sensor catches that synthetic mousedown, claims a drag lock, and calls
 * `event.preventDefault()`. preventDefault on mousedown suppresses the
 * trailing `click` event — which is what we use for tap-to-select on the
 * basket and chord chips. The visible symptom is "tap on a chord does
 * nothing on mobile, you have to long-press first".
 *
 * This sensor is a near-clone of pangea's mouse sensor with two changes:
 *  1. Skips mousedown if a real touchstart fired in the last
 *     `syntheticMouseWindowMs` (set by the companion touch sensor).
 *  2. Defers `event.preventDefault()` to the first mousemove past the
 *     drag threshold, so a plain click (mousedown → mouseup with no move)
 *     never has its synthetic events suppressed.
 */

const PRIMARY_BUTTON = 0;
const MOVE_THRESHOLD_PX = 5;

type Phase =
  | { type: "IDLE" }
  | {
      type: "PENDING";
      preDrag: PreDragActions;
      start: { x: number; y: number };
    }
  | { type: "DRAGGING"; actions: FluidDragActions };

const idle: Phase = { type: "IDLE" };

export function useInstantMouseSensor(api: SensorAPI) {
  const phaseRef = useRef<Phase>(idle);
  const unbindRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
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
    const actions = cur.preDrag.fluidLift(point);
    phaseRef.current = { type: "DRAGGING", actions };
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const point = { x: e.clientX, y: e.clientY };
      const cur = phaseRef.current;
      if (cur.type === "PENDING") {
        const dx = point.x - cur.start.x;
        const dy = point.y - cur.start.y;
        if (dx * dx + dy * dy < MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
          return;
        }
        // We're committing to a drag — now suppress text selection etc.
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

  const onMouseUp = useCallback(
    (e: MouseEvent) => {
      const cur = phaseRef.current;
      if (cur.type === "PENDING") {
        cur.preDrag.abort();
        reset();
        return;
      }
      if (cur.type === "DRAGGING") {
        e.preventDefault();
        cur.actions.drop({ shouldBlockNextClick: true });
        reset();
      }
    },
    [reset],
  );

  const onMouseDownExtra = useCallback(
    (e: MouseEvent) => {
      // A second mousedown while we're mid-gesture — abort.
      if (phaseRef.current.type === "DRAGGING") {
        e.preventDefault();
      }
      forceStop();
    },
    [forceStop],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const cur = phaseRef.current;
        if (cur.type === "DRAGGING") {
          e.preventDefault();
          cur.actions.cancel();
        } else if (cur.type === "PENDING") {
          cur.preDrag.abort();
        }
        reset();
      }
    },
    [reset],
  );

  const onResizeOrScroll = useCallback(() => {
    forceStop();
  }, [forceStop]);

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      // Ignore the synthetic mousedown that follows a real touchend.
      if (isLikelySyntheticMouse()) return;
      if (e.defaultPrevented) return;
      if (e.button !== PRIMARY_BUTTON) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (phaseRef.current.type !== "IDLE") return;
      const id = api.findClosestDraggableId(e);
      if (!id) return;
      const preDrag = api.tryGetLock(id, forceStop, { sourceEvent: e });
      if (!preDrag) return;
      // NOTE: intentionally NOT calling e.preventDefault() here — that would
      // suppress the trailing click event for a plain mouse click without
      // movement. We only preventDefault once movement crosses the threshold.
      phaseRef.current = {
        type: "PENDING",
        preDrag,
        start: { x: e.clientX, y: e.clientY },
      };

      const moveOpts: AddEventListenerOptions = { passive: false, capture: true };
      const upOpts: AddEventListenerOptions = { passive: false, capture: true };
      const otherOpts: AddEventListenerOptions = { capture: true };
      window.addEventListener("mousemove", onMouseMove, moveOpts);
      window.addEventListener("mouseup", onMouseUp, upOpts);
      window.addEventListener("mousedown", onMouseDownExtra, otherOpts);
      window.addEventListener("keydown", onKeyDown, otherOpts);
      window.addEventListener("resize", onResizeOrScroll, otherOpts);
      window.addEventListener("scroll", onResizeOrScroll, { capture: true, passive: true });
      unbindRef.current = () => {
        window.removeEventListener("mousemove", onMouseMove, moveOpts);
        window.removeEventListener("mouseup", onMouseUp, upOpts);
        window.removeEventListener("mousedown", onMouseDownExtra, otherOpts);
        window.removeEventListener("keydown", onKeyDown, otherOpts);
        window.removeEventListener("resize", onResizeOrScroll, otherOpts);
        window.removeEventListener("scroll", onResizeOrScroll, { capture: true } as EventListenerOptions);
      };
    },
    [api, forceStop, onMouseMove, onMouseUp, onMouseDownExtra, onKeyDown, onResizeOrScroll],
  );

  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: false, capture: true };
    window.addEventListener("mousedown", onMouseDown, opts);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, opts);
      forceStop();
    };
  }, [onMouseDown, forceStop]);
}
