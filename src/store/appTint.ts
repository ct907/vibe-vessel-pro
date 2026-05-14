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

function applyTint(tint: SectionColor | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (tint) {
    root.style.setProperty("--app-tint-raw", `var(--section-tint-${tint})`);
  } else {
    root.style.removeProperty("--app-tint-raw");
  }
}

useAppTintStore.subscribe((s) => {
  applyTint(s.tint);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tint: s.tint }));
  } catch {
    /* ignore quota */
  }
});

applyTint(useAppTintStore.getState().tint);
