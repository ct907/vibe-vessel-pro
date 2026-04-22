import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChordSymbol, suggestChords, parseChord } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import { Trash2, Play } from "lucide-react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialChord?.display ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialChord]);

  // Lift the sheet above the on-screen keyboard on iOS/Android.
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setKeyboardOffset(overlap > 0 ? overlap : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setKeyboardOffset(0);
    };
  }, [open]);

  const suggestions = useMemo(() => suggestChords(query), [query]);
  const exact = useMemo(() => parseChord(query.trim()), [query]);

  const handlePick = (chord: ChordSymbol) => {
    onPick(chord);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] paper-card rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Choose a chord</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
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
              Type a root letter (A–G) for variations, or a full chord like <code className="font-mono-chord">Fmaj7</code> to insert directly.
            </p>
          )}

          <div className="overflow-y-auto max-h-[50vh] -mx-1 px-1">
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

          <div className="flex items-center justify-between pt-2 border-t border-border">
            {onRemove ? (
              <Button variant="ghost" size="sm" onClick={() => { onRemove(); onOpenChange(false); }}>
                <Trash2 className="h-4 w-4" /> Remove chord
              </Button>
            ) : <span />}
            {exact && (
              <Button onClick={() => handlePick(exact)} size="sm">
                Insert {exact.display}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
