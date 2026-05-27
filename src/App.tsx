import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { OnboardingFilters } from "@/components/onboarding/OnboardingFilters";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Defaults from "./pages/Defaults.tsx";
import Landing from "./pages/Landing.tsx";
import Help from "./pages/Help.tsx";
import { ThemeProvider } from "@/hooks/use-theme";
import { hydrateFromStorage, startAutosave, useSongStore } from "@/store/song";
import { pushRecent } from "@/lib/recent-projects";

const queryClient = new QueryClient();

function FullScreenOverlay({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-background overflow-y-auto">{children}</div>;
}

const App = () => {
  useEffect(() => {
    function makeUri(baseFreq: number, dpr: number): string {
      const f = (baseFreq / dpr).toFixed(4);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'> <filter id='noise'> <feTurbulence type='turbulence' baseFrequency='${f}' numOctaves='3' stitchTiles='stitch' seed='179' /> </filter> <rect width='100%' height='100%' filter='url(%23noise)'/> </svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    function injectStyle(dpr: number): void {
      let el = document.getElementById("noise-texture-dpr-override") as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement("style");
        el.id = "noise-texture-dpr-override";
        document.head.appendChild(el);
      }
      const u = (freq: number) => makeUri(freq, dpr);
      el.textContent = `
        .noise-texture::before { mask-image: ${u(0.90)}; -webkit-mask-image: ${u(0.90)}; }
        .noise-texture-surface::before { mask-image: ${u(1.50)}; -webkit-mask-image: ${u(1.50)}; }
        .noise-texture-nav::before { mask-image: ${u(0.90)}; -webkit-mask-image: ${u(0.90)}; }
        .noise-texture-chip::before { mask-image: ${u(0.90)}; -webkit-mask-image: ${u(0.90)}; }
      `;
    }
    let cleanup: (() => void) | null = null;
    function applyAndWatch(): void {
      const dpr = window.devicePixelRatio;
      injectStyle(dpr);
      const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
      function onChange() {
        mql.removeEventListener("change", onChange);
        applyAndWatch();
      }
      mql.addEventListener("change", onChange);
      cleanup = () => mql.removeEventListener("change", onChange);
    }
    applyAndWatch();
    return () => {
      cleanup?.();
      document.getElementById("noise-texture-dpr-override")?.remove();
    };
  }, []);

  useEffect(() => {
    hydrateFromStorage();
    const unsub = startAutosave();
    let lastPush = 0;
    const unsubRecents = useSongStore.subscribe((state) => {
      const now = Date.now();
      if (now - lastPush < 30_000) return;
      lastPush = now;
      try {
        pushRecent({ name: state.meta.title || "Untitled Song", snapshot: state.toJSON() });
      } catch { /* ignore */ }
    });
    return () => { unsub(); unsubRecents(); };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) useSongStore.getState().redo();
        else useSongStore.getState().undo();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        useSongStore.getState().redo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <OnboardingFilters />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Index />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/defaults" element={<FullScreenOverlay><Defaults /></FullScreenOverlay>} />
              <Route path="/help" element={<FullScreenOverlay><Help /></FullScreenOverlay>} />
              <Route path="/app" element={null} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<FullScreenOverlay><NotFound /></FullScreenOverlay>} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
