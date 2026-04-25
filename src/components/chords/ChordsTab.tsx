import { useEffect, useMemo, useState } from "react";
import { useSongStore } from "@/store/song";
import { ChordSymbol, Quality, nashvilleLadder, parseChord, isMinorMode } from "@/lib/music/chords";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Plus, Music, X } from "lucide-react";
import { BasketBar } from "@/components/basket/BasketBar";

// All qualities shown together, in display order.
const ALL_QUALITIES: Quality[] = [
  "maj",
  "min",
  "dim",
  "aug",
  "sus2",
  "sus4",
  "maj7",
  "min7",
  "7",
  "dim7",
  "m7b5",
  "minMaj7",
  "maj9",
  "min9",
  "9",
  "add9",
  "6",
  "min6",
];

const qualitySuffix = (q: Quality): string => (q === "maj" ? "" : q === "min" ? "m" : q);

interface ChordsTabProps {
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions") => void;
}

export function ChordsTab({ onSwitchTab: _onSwitchTab }: ChordsTabProps = {}) {
  const { meta, addToBasket, basket, removeFromBasket } = useSongStore();
  const ladder = useMemo(() => nashvilleLadder(meta.keyRoot, meta.keyMode), [meta.keyRoot, meta.keyMode]);
  const [selected, setSelected] = useState<Record<string, ChordSymbol>>({});
  // Numeral filter: when non-empty, only rows whose numeral is selected are shown.
  const [numeralFilter, setNumeralFilter] = useState<Set<string>>(new Set());
  // Audition octave applied to every chord chip in this tab.
  const [octave, setOctave] = useState<number>(4);
  const basketActive = basket.length > 0;
  // Map chord display → basket item id for fast lookup.
  const basketByDisplay = useMemo(() => {
    const m = new Map<string, string>();
    basket.forEach((b) => {
      if (!m.has(b.chord.display)) m.set(b.chord.display, b.id);
    });
    return m;
  }, [basket]);

  // Build rows with all qualities. Dedupe variants WITHIN each row by their
  // canonical (parsed) display so e.g. "Dm" never appears twice.
  const grid = useMemo(() => {
    return ladder.map((deg) => {
      const variants: ChordSymbol[] = [];
      const seenInRow = new Set<string>();
      for (const q of ALL_QUALITIES) {
        const parsed = parseChord(deg.chord.root + qualitySuffix(q));
        if (!parsed) continue;
        if (seenInRow.has(parsed.display)) continue;
        seenInRow.add(parsed.display);
        variants.push(parsed);
      }
      return { numeral: deg.numeral, root: deg.chord.root, baseChord: deg.chord, variants };
    });
  }, [ladder]);

  const visibleGrid = useMemo(
    () => (numeralFilter.size === 0 ? grid : grid.filter((r) => numeralFilter.has(r.numeral))),
    [grid, numeralFilter],
  );

  const toggleSelect = (chord: ChordSymbol) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[chord.display]) delete next[chord.display];
      else next[chord.display] = chord;
      return next;
    });
  };

  const toggleNumeral = (numeral: string) => {
    setNumeralFilter((prev) => {
      const next = new Set(prev);
      if (next.has(numeral)) next.delete(numeral);
      else next.add(numeral);
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
  const keySuffix =
    isMinorMode(meta.keyMode) && meta.keyMode !== "blues" && meta.keyMode !== "pentatonic-min" ? "m" : "";

  return (
    <div className="space-y-5">
      {/* Nashville header strip */}
      <div className="rounded-xl">
        <div className="flex items-center gap-2 mb-3 mt-3 h-8">
          <Music className="h-4 w-4 ink-chord" />
          <h2 className="font-display text-sm flex-1 min-w-0 truncate">
            <span className="font-mono-chord">
              {meta.keyRoot}
              {keySuffix}
            </span>{" "}
            · Filter Chord Root
          </h2>
          {numeralFilter.size > 0 && (
            <Button
              size="sm"
              className="bg-indigo-500/40 h-6"
              variant="secondary"
              onClick={() => setNumeralFilter(new Set())}
            >
              Clear filter
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {ladder.map((d) => {
            const active = numeralFilter.has(d.numeral);
            return (
              <button
                key={d.numeral}
                type="button"
                onClick={() => toggleNumeral(d.numeral)}
                className={cn(
                  "rounded-md p-1 text-center transition-colors",
                  active ? "border-primary bg-accent ring-1 ring-primary" : "bg-muted/50 hover:bg-accent/60",
                )}
              >
                <div className="font-mono-chord text-xs text-muted-foreground mb-1">{d.numeral}</div>
                <ChordChip chord={d.chord} variant="ink" size="sm" octave={octave} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          Octave
          <Select value={String(octave)} onValueChange={(v) => setOctave(Number(v))}>
            <SelectTrigger className="h-7 w-[72px] px-2 text-xs font-mono-chord" aria-label="Audition octave">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6].map((o) => (
                <SelectItem key={o} value={String(o)} className="text-xs font-mono-chord">
                  Oct {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          Tap to audition · Hold to sustain · Check to multi-select · Esc to cancel
        </span>
      </div>

      {/* Chord cards — one row per scale degree (filtered) */}
      <div className="space-y-2">
        {visibleGrid.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No degrees match this filter.
          </div>
        )}
        {visibleGrid.map((row) => (
          <div key={row.numeral} className="rounded-xl bg-card p-3">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono-chord text-xs text-muted-foreground w-10">{row.numeral}</span>
              <span className="font-display text-base ink-chord">{row.root}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.variants.map((c) => {
                // When basket is active, the checkbox reflects basket membership and
                // toggling adds/removes from the basket directly. Otherwise it drives
                // the local "Send to basket" selection workflow.
                const inBasket = basketByDisplay.has(c.display);
                const isSel = basketActive ? inBasket : !!selected[c.display];
                const onCheckedChange = () => {
                  if (basketActive) {
                    if (inBasket) {
                      const id = basketByDisplay.get(c.display);
                      if (id) removeFromBasket(id);
                    } else {
                      addToBasket([c]);
                    }
                  } else {
                    toggleSelect(c);
                  }
                };
                return (
                  <div
                    key={c.display}
                    className={cn(
                      "group relative flex items-center gap-1 rounded-md bg-card px-2 py-1.5 transition-colors",
                      isSel && "border-primary bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={onCheckedChange}
                      aria-label={`Select ${c.display}`}
                    />
                    <ChordChip chord={c} variant="ink" octave={octave} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!basketActive && selectedCount > 0 && (
        <div className="sticky bottom-10 flex justify-end gap-2">
          <Button
            onClick={sendSelected}
            size="default"
            className="h-12 bg-indigo-300 text-chord-chip-foreground shadow-lg shadow-indigo-300 text-base px-6 py-6"
          >
            <Plus className="h-5 w-5" /> Add {selectedCount} to basket
          </Button>
          <Button
            onClick={clearSelection}
            size="default"
            variant="outline"
            className="h-12 shadow-lg text-base px-6 py-6"
            aria-label="Cancel selection"
          >
            <X className="h-5 w-5" /> Cancel
          </Button>
        </div>
      )}

      <BasketBar
        onSendToLyrics={() => _onSwitchTab?.("lyrics")}
        onSendToProgressions={() => _onSwitchTab?.("progressions")}
      />
    </div>
  );
}
