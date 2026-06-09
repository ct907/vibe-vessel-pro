import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { X } from "lucide-react";

interface Props {
  step: string;
  message: string;
  arrowSide?: "top" | "bottom" | "left" | "right";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

function arrowStyle(side: NonNullable<Props["arrowSide"]>): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
  };
  switch (side) {
    case "top":
      return { ...base, borderWidth: "0 8px 8px 8px", borderColor: `transparent transparent var(--primary-strong) transparent`, top: -8, left: "50%", transform: "translateX(-50%)" };
    case "bottom":
      return { ...base, borderWidth: "8px 8px 0 8px", borderColor: `var(--primary-strong) transparent transparent transparent`, bottom: -8, left: "50%", transform: "translateX(-50%)" };
    case "left":
      return { ...base, borderWidth: "8px 8px 8px 0", borderColor: `transparent var(--primary-strong) transparent transparent`, left: -8, top: "50%", transform: "translateY(-50%)" };
    case "right":
      return { ...base, borderWidth: "8px 0 8px 8px", borderColor: `transparent transparent transparent var(--primary-strong)`, right: -8, top: "50%", transform: "translateY(-50%)" };
  }
}

export function OnboardingCoachMark({ step, message, arrowSide = "top", actionLabel, onAction, onDismiss }: Props) {
  const interactive = !!actionLabel && !!onAction;
  return (
    <div
      className={interactive ? "pointer-events-auto" : "pointer-events-none"}
      style={{ position: "relative", width: "max-content", maxWidth: 360, boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 10 }}
    >
      {/* Arrow */}
      <div style={arrowStyle(arrowSide)} />
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 1,
            pointerEvents: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 999,
            border: 0,
            cursor: "pointer",
            background: "color-mix(in oklch, var(--paper) 20%, transparent)",
            color: "var(--paper)",
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      )}
      {/* Background with paper-noise edge distortion */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--primary-strong)",
          borderRadius: 10,
          filter: "url(#onb-paper-noise)",
        }}
      />
      {/* Content */}
      <div style={{ position: "relative", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span
          className="font-mono-chord"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in oklch, var(--paper) 20%, transparent)",
            color: "var(--paper)",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            height: 24,
            padding: "0 8px",
            width: "max-content",
          }}
        >
          {step}
        </span>
        <p
          className="onb-squiggly"
          style={{ color: "var(--paper)", fontSize: 18, margin: 0, lineHeight: 1.3 }}
        >
          {message}
        </p>
        {interactive && (
          <button
            type="button"
            onClick={onAction}
            className="btn-sculpt-cream inline-flex items-center justify-center self-end rounded-lg px-3 h-7 text-xs font-semibold"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Renders an OnboardingCoachMark via a document.body portal with fixed
 *  positioning anchored to an element ref, escaping any overflow:hidden
 *  or stacking-context constraints in the parent tree. */
export function AnchoredCoachMark({
  anchorRef,
  gap = 8,
  anchorEdge = "bottom",
  viewportBottom,
  ...markProps
}: Props & {
  anchorRef: RefObject<HTMLElement | null>;
  gap?: number;
  anchorEdge?: "bottom" | "top";
  /** When set, position is pinned to the viewport bottom (top = innerHeight - viewportBottom),
   *  ignoring the anchor's geometry. Useful for content-area coach marks that would otherwise
   *  overlap dynamic affordances. */
  viewportBottom?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ready, setReady] = useState(false);
  const markSizeRef = useRef<{ w: number; h: number } | null>(null);
  const markWrapperRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = markWrapperRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w <= 0 || h <= 0) return;
      const prev = markSizeRef.current;
      if (prev && prev.w === w && prev.h === h) return;
      markSizeRef.current = { w, h };
      setReady(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf: number;
    const PAD = 8;
    const measure = () => {
      if (viewportBottom !== undefined) {
        const nextTop = Math.round(window.innerHeight - viewportBottom);
        const nextLeft = Math.round(window.innerWidth / 2);
        setPos((prev) => (prev && prev.top === nextTop && prev.left === nextLeft ? prev : { top: nextTop, left: nextLeft }));
        return;
      }
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const ms = markSizeRef.current;
      let top: number;
      if (anchorEdge === "top") {
        const h = ms?.h ?? 0;
        top = r.top - h - gap;
      } else {
        top = r.bottom + gap;
      }
      let left = r.left + r.width / 2;
      if (ms) {
        const half = ms.w / 2;
        const minLeft = half + PAD;
        const maxLeft = window.innerWidth - half - PAD;
        if (maxLeft >= minLeft) left = Math.min(Math.max(left, minLeft), maxLeft);
        top = Math.max(top, PAD);
      }
      const nextTop = Math.round(top);
      const nextLeft = Math.round(left);
      setPos((prev) => (prev && prev.top === nextTop && prev.left === nextLeft ? prev : { top: nextTop, left: nextLeft }));
    };
    const start = performance.now();
    const tick = () => {
      measure();
      if (performance.now() - start < 600) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef, gap, anchorEdge, viewportBottom]);

  const interactive = !!markProps.actionLabel && !!markProps.onAction;
  const visible = pos !== null && ready;
  return createPortal(
    <div
      ref={markWrapperRef}
      className={interactive ? "pointer-events-auto" : "pointer-events-none"}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        transform: "translateX(-50%)",
        zIndex: 9999,
        visibility: visible ? "visible" : "hidden",
      }}
    >
      <OnboardingCoachMark {...markProps} />
    </div>,
    document.body,
  );
}
