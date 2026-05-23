import { useMemo, useState } from "react";
import { useSongStore } from "@/store/song";
import { useTheme } from "@/hooks/use-theme";
import { ChordSymbol, Quality, nashvilleLadder, parseChord, isMinorMode, COMMON_QUALITIES } from "@/lib/music/chords";
import { ChordChip } from "@/components/chord/ChordChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music } from "lucide-react";

const qualitySuffix = (q: Quality): string => (q === "maj" ? "" : q === "min" ? "m" : q);

interface ChordsTabProps {
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions") => void;
}

export function ChordsTab({ onSwitchTab: _onSwitchTab }: ChordsTabProps = {}) {
  const { theme } = useTheme();
  const meta = useSongStore((s) => s.meta);
  const ladder = useMemo(() => nashvilleLadder(meta.keyRoot, meta.keyMode), [meta.keyRoot, meta.keyMode]);
  const [numeralFilter, setNumeralFilter] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState<number>(4);

  const grid = useMemo(() => {
    return ladder.map((deg) => {
      const variants: ChordSymbol[] = [];
      const seenInRow = new Set<string>();
      for (const q of COMMON_QUALITIES) {
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

  const toggleNumeral = (numeral: string) => {
    setNumeralFilter((prev) => {
      const next = new Set(prev);
      if (next.has(numeral)) next.delete(numeral);
      else next.add(numeral);
      return next;
    });
  };

  const keySuffix =
    isMinorMode(meta.keyMode) && meta.keyMode !== "blues" && meta.keyMode !== "pentatonic-min" ? "m" : "";

  return (
    <div className="space-y-5">
      <div className="rounded-xl">
        <div className="flex items-center gap-2 mb-3 mt-3 h-8">
          <Music className="ink-chord" style={{ width: "1.4rem", height: "1.4rem" }} />
          <h2
            className="font-display flex-1 min-w-0 truncate"
            style={{ fontSize: "1.18rem", color: theme === "dark" ? "var(--cocoa)" : undefined }}
          >
            <span className="font-mono-chord">
              {meta.keyRoot}
              {keySuffix}
            </span>{" "}
            · Filter Chord Root
          </h2>
          {numeralFilter.size > 0 && (
            <button
              type="button"
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-6 px-2 text-xs font-semibold"
              onClick={() => setNumeralFilter(new Set())}
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {ladder.map((d) => {
            const active = numeralFilter.has(d.numeral);
            const activeBg = theme === "light" ? "var(--paper)" : "var(--cocoa)";
            const labelColor = active
              ? (theme === "light" ? "var(--cocoa)" : "var(--paper)")
              : "var(--cocoa)";
            return (
              <button
                key={d.numeral}
                type="button"
                onClick={() => toggleNumeral(d.numeral)}
                style={{
                  borderRadius: 8,
                  padding: "4px 8px",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  background: active ? activeBg : "transparent",
                  backdropFilter: active ? "blur(8px) saturate(200%)" : undefined,
                  WebkitBackdropFilter: active ? "blur(8px) saturate(200%)" : undefined,
                  boxShadow: active ? "var(--shadow-sculpt-cocoa-rest)" : "none",
                  border: "none",
                  transition: "background 120ms ease, box-shadow 120ms ease",
                  cursor: "pointer",
                }}
              >
                <div className="font-mono-chord" style={{ fontSize: "1.18rem", color: labelColor }}>{d.numeral}</div>
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
          Tap to audition · Hold to sustain
        </span>
      </div>

      <div className="space-y-2">
        {visibleGrid.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No degrees match this filter.
          </div>
        )}
        {visibleGrid.map((row) => (
          <div key={row.numeral} className="noise-texture-surface rounded-xl p-3" style={{ background: "var(--paper-shade-soft)" }}>
            <div className="mb-2" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "1.18rem", color: theme === "dark" ? "var(--paper)" : "var(--cocoa)" }}>{row.numeral}</span>
              <span style={{ fontFamily: "'Nunito', system-ui, sans-serif", fontWeight: 700, fontSize: "1.18rem", letterSpacing: "0.06em", textTransform: "uppercase" as const, color: theme === "dark" ? "var(--paper)" : "var(--cocoa)" }}>{row.root}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.variants.map((c) => (
                <div key={c.display} className="group relative flex items-center rounded-md px-2 py-1.5">
                  <ChordChip chord={c} variant="ink" octave={octave} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
