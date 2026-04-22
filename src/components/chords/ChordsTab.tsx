import { useMemo, useState } from "react";
import { useSongStore } from "@/store/song";
import {
  ChordSymbol,
  COMMON_QUALITIES,
  Quality,
  nashvilleLadder,
  parseChord,
} from "@/lib/music/chords";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Plus, Music } from "lucide-react";

const QUALITY_FILTERS: Array<{ id: string; label: string; qualities: Quality[] }> = [
  { id: "triads", label: "Triads", qualities: ["maj", "min", "dim", "aug", "sus2", "sus4"] },
  { id: "sevenths", label: "7ths", qualities: ["maj7", "min7", "7", "dim7", "m7b5", "minMaj7"] },
  { id: "ninths", label: "9ths & ext.", qualities: ["maj9", "min9", "9", "add9", "6", "min6"] },
];

export function ChordsTab() {
  const { meta, addToBasket, basket } = useSongStore();
  const ladder = useMemo(() => nashvilleLadder(meta.keyRoot, meta.keyMode), [meta.keyRoot, meta.keyMode]);
  const [activeFilter, setActiveFilter] = useState<string>("triads");
  const [selected, setSelected] = useState<Record<string, ChordSymbol>>({});

  const filterQualities = QUALITY_FILTERS.find((f) => f.id === activeFilter)!.qualities;

  // Build a wide grid: each ladder root × each quality in the active filter
  const grid = useMemo(() => {
    return ladder.map((deg) => {
      const variants = filterQualities.map((q) => {
        const display = deg.chord.root + (q === "maj" ? "" : q === "min" ? "m" : q);
        const parsed = parseChord(display)!;
        return parsed;
      });
      return { numeral: deg.numeral, root: deg.chord.root, baseChord: deg.chord, variants };
    });
  }, [ladder, filterQualities]);

  const toggleSelect = (chord: ChordSymbol) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[chord.display]) delete next[chord.display];
      else next[chord.display] = chord;
      return next;
    });
  };

  const sendSelected = () => {
    const chords = Object.values(selected);
    if (chords.length === 0) return;
    addToBasket(chords);
    setSelected({});
  };

  return (
    <div className="space-y-5">
      {/* Nashville header strip */}
      <div className="paper-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Music className="h-4 w-4 ink-chord" />
          <h2 className="font-display text-lg">
            Diatonic ladder · <span className="font-mono-chord">{meta.keyRoot}{meta.keyMode === "min" ? "m" : ""}</span>
          </h2>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {ladder.map((d) => (
            <div key={d.numeral} className="rounded-md bg-paper-shade/60 border border-border p-2 text-center">
              <div className="font-mono-chord text-xs text-muted-foreground mb-1">{d.numeral}</div>
              <ChordChip chord={d.chord} variant="ink" size="sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Quality filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {QUALITY_FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={activeFilter === f.id ? "default" : "outline"}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Tap to audition · Check to multi-select
        </span>
      </div>

      {/* Chord cards — one row per scale degree */}
      <div className="space-y-2">
        {grid.map((row) => (
          <div key={row.numeral} className="paper-card rounded-xl p-3">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono-chord text-xs text-muted-foreground w-10">{row.numeral}</span>
              <span className="font-display text-base ink-chord">{row.root}</span>
            </div>
            <div className="flex flex-wrap gap-2">
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

      {Object.keys(selected).length > 0 && (
        <div className="sticky bottom-20 flex justify-end">
          <Button onClick={sendSelected} size="sm" className="shadow-lg">
            <Plus className="h-4 w-4" /> Add {Object.keys(selected).length} to basket
          </Button>
        </div>
      )}
    </div>
  );
}
