import { useEffect, useState } from "react";

export const SIDE_PANEL_CLASS = "max-w-none sm:max-w-none";

/** Height of the Jam keypad when docked under the song on a portrait tablet. */
export const JAM_BOTTOM_DOCK_H = 660;

/**
 * While active, the editor makes room on the right so a docked panel sits beside the song instead of over it.
 */
export function useSidePanel(active: boolean, width: number) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.style.setProperty("--side-panel-w", `${width}px`);
    return () => {
      root.style.removeProperty("--side-panel-w");
    };
  }, [active, width]);
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Width of the right-hand panel, or 0 when the screen is too narrow to dock one (then panels are sheets). */
export function useDockedPanelWidth() {
  const wide = useMedia("(min-width: 1280px)");
  const tablet = useMedia("(min-width: 1024px)");
  return wide ? 420 : tablet ? 360 : 0;
}

/** Portrait tablets have height to spare but not width: Jam docks under the song instead. */
export function useBottomDock() {
  return useMedia("(min-width: 700px) and (max-width: 1023px) and (min-height: 900px)");
}
