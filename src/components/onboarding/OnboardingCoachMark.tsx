import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

interface Props {
  step: string;
  message: string;
  arrowSide?: "top" | "bottom" | "left" | "right";
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

export function OnboardingCoachMark({ step, message, arrowSide = "top" }: Props) {
  return (
    <div
      className="pointer-events-none"
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
  ...markProps
}: Props & {
  anchorRef: RefObject<HTMLElement | null>;
  gap?: number;
  anchorEdge?: "bottom" | "top";
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = anchorEdge === "top" ? r.top + gap : r.bottom + gap;
      setPos({ top, left: r.left + r.width / 2 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, gap, anchorEdge]);

  if (!pos) return null;
  return createPortal(
    <div
      className="pointer-events-none"
      style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 9999 }}
    >
      <OnboardingCoachMark {...markProps} />
    </div>,
    document.body,
  );
}
