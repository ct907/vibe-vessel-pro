import React from "react";
import { create } from "zustand";

export type BackgroundPattern = "none" | "wavy" | "checkerboard" | "dot" | "lined" | "quarters";
export type MaskStyle = "none" | "top" | "bottom";

export const PATTERN_KEYS: BackgroundPattern[] = ["none", "wavy", "checkerboard", "dot", "lined", "quarters"];
export const MASK_KEYS: MaskStyle[] = ["none", "top", "bottom"];

interface Persist {
  pattern: BackgroundPattern;
  mask: MaskStyle;
}

interface State extends Persist {
  setPattern: (p: BackgroundPattern) => void;
  setMask: (m: MaskStyle) => void;
}

const STORAGE_KEY = "songwriters-notebook:app-background:v1";
const FALLBACK: Persist = { pattern: "none", mask: "none" };

function load(): Persist {
  if (typeof localStorage === "undefined") return FALLBACK;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const p = JSON.parse(raw);
    return {
      pattern: (PATTERN_KEYS as string[]).includes(p.pattern) ? p.pattern : "none",
      mask:    (MASK_KEYS as string[]).includes(p.mask)       ? p.mask    : "none",
    };
  } catch {
    return FALLBACK;
  }
}

export const useAppBackgroundStore = create<State>((set) => ({
  ...load(),
  setPattern: (p) => set({ pattern: p }),
  setMask:    (m) => set({ mask: m }),
}));

useAppBackgroundStore.subscribe((s) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pattern: s.pattern, mask: s.mask }));
  } catch { /* quota */ }
});

const T = "var(--app-tint-raw, var(--primary-soft))";

export function getPatternStyle(pattern: BackgroundPattern): React.CSSProperties {
  switch (pattern) {
    case "wavy":
      return {
        backgroundImage: [
          "repeating-radial-gradient(circle at 0 0, transparent 0, var(--paper) 22.5px)",
          `repeating-linear-gradient(color-mix(in oklch,${T} 33%,transparent),${T})`,
        ].join(","),
      };
    case "checkerboard":
      return {
        backgroundImage: [
          `linear-gradient(135deg,${T} 25%,transparent 25%)`,
          `linear-gradient(225deg,${T} 25%,transparent 25%)`,
          `linear-gradient(45deg,${T} 25%,transparent 25%)`,
          `linear-gradient(315deg,${T} 25%,transparent 25%)`,
        ].join(","),
        backgroundPosition: "15px 0, 15px 0, 0 0, 0 0",
        backgroundSize: "15px 15px",
        backgroundRepeat: "repeat",
      };
    case "dot":
      return {
        backgroundImage: `radial-gradient(${T} 1.125px,transparent 1.125px)`,
        backgroundSize: "22.5px 22.5px",
      };
    case "lined":
      return {
        backgroundImage: [
          `linear-gradient(${T} 1.5px,transparent 1.5px)`,
          `linear-gradient(to right,${T} 1.5px,transparent 1.5px)`,
        ].join(","),
        backgroundSize: "30px 30px",
      };
    case "quarters":
      return {
        backgroundImage: `radial-gradient(ellipse farthest-corner at 15px 15px,${T},${T} 50%,transparent 50%)`,
        backgroundSize: "15px 15px",
      };
    default:
      return {};
  }
}

export function getMaskStyle(mask: MaskStyle): React.CSSProperties {
  if (mask === "top") return {
    WebkitMaskImage: "radial-gradient(ellipse 140% 60% at 50% 0%,black 25%,transparent 75%)",
    maskImage:        "radial-gradient(ellipse 140% 60% at 50% 0%,black 25%,transparent 75%)",
  };
  if (mask === "bottom") return {
    WebkitMaskImage: "radial-gradient(ellipse 140% 60% at 50% 100%,black 25%,transparent 75%)",
    maskImage:        "radial-gradient(ellipse 140% 60% at 50% 100%,black 25%,transparent 75%)",
  };
  return {};
}
