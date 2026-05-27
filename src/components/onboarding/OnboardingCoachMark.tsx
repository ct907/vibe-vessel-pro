import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

interface Props {
  step: string;
  message: string;
  arrowSide?: "top" | "bottom" | "left" | "right";
  actionLabel?: string;
  onAction?: () => void;
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

export function OnboardingCoachMark({ step, message, arrowSide = "top", actionLabel, onAction }: Props) {
  const interactive = !!actionLabel && !!onAction;
  return (
    <div
      className={interactive ? "pointer-events-auto" : "pointer-events-none"}
      style={{ position: "relative", width: "max-content", maxWidth: 360, boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 10 }}
    >
      {/* Arrow */}
      <div style={arrowStyle(arrowSide)} />
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

  useEffect(() => {
    let raf: number;
    const measure = () => {
      if (viewportBottom !== undefined) {
        setPos({ top: window.innerHeight - viewportBottom, left: window.innerWidth / 2 });
        return;
      }
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const top = anchorEdge === "top" ? r.top + gap : r.bottom + gap;
      setPos({ top, left: r.left + r.width / 2 });
    };
    raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef, gap, anchorEdge, viewportBottom]);

  if (!pos) return null;
  const interactive = !!markProps.actionLabel && !!markProps.onAction;
  return createPortal(
    <div
      className={interactive ? "pointer-events-auto" : "pointer-events-none"}
      style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 9999 }}
    >
      <OnboardingCoachMark {...markProps} />
    </div>,
    document.body,
  );
}
