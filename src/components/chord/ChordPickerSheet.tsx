import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChordSymbol, suggestChords, parseChord, ALL_ROOTS, normalizeRoot } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import { Trash2, Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChord?: ChordSymbol;
  onPick: (chord: ChordSymbol) => void;
  onRemove?: () => void;
}

export function ChordPickerSheet({ open, onOpenChange, initialChord, onPick, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      setQuery(initialChord?.display ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialChord]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const update = () => {
      if (vv) {
        const overlap = window.innerHeight - (vv.height + vv.offsetTop);
        setKeyboardOffset(overlap > 0 ? overlap : 0);
        setVvHeight(vv.height);
      } else {
        setVvHeight(window.innerHeight);
      }
    };
    update();
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      setKeyboardOffset(0);
    };
  }, [open]);

  const suggestions = useMemo(() => suggestChords(query), [query]);
  const exact = useMemo(() => parseChord(query.trim()), [query]);

  const handlePick = (chord: ChordSymbol) => {
    onPick(chord);
    onOpenChange(false);
  };

  // Reserve ~140px from top so the highlighted chord row (positioned ~80px from top) stays visible.
  const TOP_RESERVED = 140;
  const SHEET_CHROME = isMobile ? 160 : 200;
  const sheetMaxHeight = Math.max(220, vvHeight - TOP_RESERVED);
  const gridMaxHeight = Math.max(80, vvHeight - TOP_RESERVED - SHEET_CHROME);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="paper-card rounded-t-2xl transition-[bottom] duration-150 overflow-hidden flex flex-col"
        style={{ bottom: `${keyboardOffset}px`, maxHeight: `${sheetMaxHeight}px` }}
      >
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a chord… e.g. Bbm9, Fmaj7, Csus4"
            className="font-mono-chord text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && exact) handlePick(exact);
            }}
          />

          {!query.trim() && (
            <p className="text-sm text-muted-foreground">
              Type a root letter (A–G) for variations, or a full chord like <code className="font-mono-chord">Fmaj7</code>.
            </p>
          )}

          {isMobile ? (
            <div
              className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-1 px-1"
              style={{ maxHeight: `${gridMaxHeight}px` }}
            >
              <div className="flex gap-2 w-max pb-2">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol.display}
                    className="group flex flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent transition-colors min-w-[110px]"
                    onClick={() => handlePick(s.symbol)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-mono-chord font-semibold ink-chord">{s.symbol.display}</span>
                      <span
                        role="button"
                        aria-label={`Preview ${s.symbol.display}`}
                        onClick={(e) => { e.stopPropagation(); void playChord(s.symbol); }}
                        className="ml-auto rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-background"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate w-full">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto -mx-1 px-1 flex-1 min-h-0" style={{ maxHeight: `${gridMaxHeight}px` }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol.display}
                    className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => handlePick(s.symbol)}
                  >
                    <div className="min-w-0">
                      <div className="font-mono-chord font-semibold ink-chord">{s.symbol.display}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                    </div>
                    <span
                      role="button"
                      aria-label={`Preview ${s.symbol.display}`}
                      onClick={(e) => { e.stopPropagation(); void playChord(s.symbol); }}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-primary hover:bg-background"
                    >
                      <Play className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {onRemove && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => { onRemove(); onOpenChange(false); }}>
                <Trash2 className="h-4 w-4" /> Remove chord
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
