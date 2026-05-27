import { create } from "zustand";
import { SECTION_COLOR_KEYS, type SectionColor } from "@/components/section/SectionColorPicker";

const STORAGE_KEY = "songwriters-notebook:app-tint:v1";

interface Persist {
  tint: SectionColor | null;
}

const FALLBACK: Persist = { tint: null };

function load(): Persist {
  if (typeof localStorage === "undefined") return FALLBACK;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const p = JSON.parse(raw);
    if (p.tint == null) return { tint: null };
    return SECTION_COLOR_KEYS.includes(p.tint) ? { tint: p.tint } : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

interface State extends Persist {
  setTint: (t: SectionColor | null) => void;
}

export const useAppTintStore = create<State>((set) => ({
  ...load(),
  setTint: (t) => set({ tint: t }),
}));

// [surface CSS variable, lightness, tint-chroma multiplier]
type Surface = readonly [string, number, number];

const LIGHT_SURFACES: ReadonlyArray<Surface> = [
  ["--paper",            0.9613, 0.5],
  ["--paper-shade",      0.883,  0.55],
  ["--paper-shade-soft", 0.9234, 0.5],
  ["--paper-card",       0.974,  0.4],
  ["--popover",          0.9803, 0.35],
  ["--muted",            0.915,  0.5],
  ["--accent",           0.9287, 0.5],
  ["--border",           0.819,  0.6],
];

const DARK_SURFACES: ReadonlyArray<Surface> = [
  ["--paper",            0.2179, 0.4],
  ["--paper-shade",      0.175,  0.45],
  ["--paper-shade-soft", 0.2499, 0.4],
  ["--paper-card",       0.2499, 0.35],
  ["--popover",          0.2499, 0.35],
  ["--secondary",        0.3229, 0.4],
  ["--muted",            0.3019, 0.4],
  ["--accent",           0.3589, 0.4],
  ["--border",           0.3432, 0.5],
  ["--pill-hover-bg",    0.3,    0.4],
];

const ALL_VARS = Array.from(
  new Set([...LIGHT_SURFACES, ...DARK_SURFACES].map(([v]) => v)),
);

function parseOklch(s: string): { L: number; C: number; H: number } | null {
  const m = s.trim().match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return null;
  return { L: +m[1], C: +m[2], H: +m[3] };
}

function clearOverrides(root: HTMLElement) {
  root.style.removeProperty("--app-tint-raw");
  ALL_VARS.forEach((v) => root.style.removeProperty(v));
}

function applyTint(tint: SectionColor | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!tint) {
    clearOverrides(root);
    return;
  }
  const raw = getComputedStyle(root)
    .getPropertyValue(`--section-tint-${tint}`)
    .trim();
  const parsed = parseOklch(raw);
  if (!parsed) {
    clearOverrides(root);
    return;
  }
  // Set --app-tint-raw to a concrete oklch() literal (not a var() chain) so
  // pattern styles in appBackground.ts and any CSS reading it can resolve
  // without nested-var() pitfalls.
  root.style.setProperty("--app-tint-raw", raw);
  const isDark = root.classList.contains("dark");
  const surfaces = isDark ? DARK_SURFACES : LIGHT_SURFACES;
  const active = new Set(surfaces.map(([v]) => v));
  ALL_VARS.forEach((v) => {
    if (!active.has(v)) root.style.removeProperty(v);
  });
  surfaces.forEach(([cssVar, L, cFactor]) => {
    const c = (parsed.C * cFactor).toFixed(4);
    root.style.setProperty(cssVar, `oklch(${L} ${c} ${parsed.H})`);
  });
}

useAppTintStore.subscribe((s) => {
  applyTint(s.tint);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tint: s.tint }));
  } catch {
    /* ignore quota */
  }
});

// Re-apply when the dark/light class toggles — dark mode uses different
// surface lightnesses and different --section-tint-* base values.
if (typeof document !== "undefined") {
  const observer = new MutationObserver(() => {
    applyTint(useAppTintStore.getState().tint);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

applyTint(useAppTintStore.getState().tint);
