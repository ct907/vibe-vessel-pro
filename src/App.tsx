import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
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

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Index />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/defaults" element={<FullScreenOverlay><Defaults /></FullScreenOverlay>} />
              <Route path="/help" element={<FullScreenOverlay><Help /></FullScreenOverlay>} />
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
