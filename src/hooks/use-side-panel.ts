import { useEffect, useState } from "react";

export const SIDE_PANEL_CLASS = "w-[420px] max-w-none sm:max-w-none";

/** While active, the editor makes room on the right so a docked panel sits beside the song instead of over it. */
export function useSidePanel(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.style.setProperty("--side-panel-w", "420px");
    return () => {
      root.style.removeProperty("--side-panel-w");
    };
  }, [active]);
}

/** Below this the song column gets too narrow beside a panel, so panels stay as sheets. */
export function useCanDockPanel() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return wide;
}
