import { useEffect, useMemo, useState } from "react";
import { useSongStore } from "@/store/song";
import {
  ChordSymbol,
  Quality,
  nashvilleLadder,
  parseChord,
} from "@/lib/music/chords";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Plus, Music, X } from "lucide-react";

// All qualities shown together, in display order.
const ALL_QUALITIES: Quality[] = [
  "maj", "min", "dim", "aug", "sus2", "sus4",
  "maj7", "min7", "7", "dim7", "m7b5", "minMaj7",
  "maj9", "min9", "9", "add9", "6", "min6",
];

export function ChordsTab() {
  const { meta, addToBasket } = useSongStore();
  const ladder = useMemo(() => nashvilleLadder(meta.keyRoot, meta.keyMode), [meta.keyRoot, meta.keyMode]);
  const [selected, setSelected] = useState<Record<string, ChordSymbol>>({});

  // Build rows with all qualities, deduping repeated chord displays across rows.
  const grid = useMemo(() => {
    const seen = new Set<string>();
    return ladder.map((deg) => {
      const variants: ChordSymbol[] = [];
      for (const q of ALL_QUALITIES) {
        const display = deg.chord.root + (q === "maj" ? "" : q === "min" ? "m" : q);
        if (seen.has(display)) continue;
        seen.add(display);
        const parsed = parseChord(display);
        if (parsed) variants.push(parsed);
      }
      return { numeral: deg.numeral, root: deg.chord.root, baseChord: deg.chord, variants };
    });
  }, [ladder]);

  const toggleSelect = (chord: ChordSymbol) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[chord.display]) delete next[chord.display];
      else next[chord.display] = chord;
      return next;
    });
  };

  const clearSelection = () => setSelected({});

  const sendSelected = () => {
    const chords = Object.values(selected);
    if (chords.length === 0) return;
    addToBasket(chords);
    setSelected({});
  };

  // Esc cancels selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && Object.keys(selected).length > 0) {
        e.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const selectedCount = Object.keys(selected).length;

  return (
    <div className="space-y-5">
      {/* Nashville header strip */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Music className="h-4 w-4 ink-chord" />
          <h2 className="font-display text-lg">
            Diatonic ladder · <span className="font-mono-chord">{meta.keyRoot}{meta.keyMode === "min" ? "m" : ""}</span>
          </h2>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {ladder.map((d) => (
            <div key={d.numeral} className="rounded-md bg-muted/50 border border-border p-2 text-center">
              <div className="font-mono-chord text-xs text-muted-foreground mb-1">{d.numeral}</div>
              <ChordChip chord={d.chord} variant="ink" size="sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center">
        <span className="ml-auto text-xs text-muted-foreground">
          Tap to audition · Check to multi-select · Esc to cancel
        </span>
      </div>

      {/* Chord cards — one row per scale degree */}
      <div className="space-y-2">
        {grid.map((row) => (
          <div key={row.numeral} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono-chord text-xs text-muted-foreground w-10">{row.numeral}</span>
              <span className="font-display text-base ink-chord">{row.root}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.variants.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No new variants</span>
              )}
              {row.variants.map((c) => {
                const isSel = !!selected[c.display];
                return (
                  <div
                    key={c.display}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 transition-colors",
                      isSel && "border-primary bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleSelect(c)}
                      aria-label={`Select ${c.display}`}
                    />
                    <ChordChip chord={c} variant="ink" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="sticky bottom-20 flex justify-end gap-2">
          <Button onClick={sendSelected} size="lg" className="shadow-lg text-base px-6 py-6">
            <Plus className="h-5 w-5" /> Add {selectedCount} to basket
          </Button>
          <Button
            onClick={clearSelection}
            size="lg"
            variant="outline"
            className="shadow-lg text-base px-6 py-6"
            aria-label="Cancel selection"
          >
            <X className="h-5 w-5" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
