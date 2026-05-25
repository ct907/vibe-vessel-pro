import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  PROGRESSION_PRESETS, realizePreset, type ProgressionPreset, type PresetFilter,
  getPresetCRSpectrums, getPresetGenres, getPresetVibes,
} from "@/lib/music/presets";
import { CR_BANDS, CR_SPECTRUM_LABEL, type CRSpectrum } from "@/lib/music/chordRelationships";
import { GENRE_LABEL, GENRE_COLOR, type GenreTag } from "@/lib/music/genreColor";
import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { playProgression, stopProgression } from "@/lib/music/audio";
import type { ChordSymbol } from "@/lib/music/chords";
import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface PresetBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (chords: ChordSymbol[]) => void;
}

const BAND_LABELS: Array<{ label: string; key: keyof typeof CR_BANDS | null }> = [
  { label: "All",     key: null },
  { label: "Dark",    key: "dark" },
  { label: "Neutral", key: "neutral" },
  { label: "Bright",  key: "bright" },
];

const GENRE_FILTER_TAGS: GenreTag[] = ["neo_soul", "jazz", "gospel", "rnb", "cinematic"];

export function PresetBrowser({ open, onOpenChange, onUse }: PresetBrowserProps) {
  const meta = useSongStore((s) => s.meta);
  const [activeBand, setActiveBand] = useState<keyof typeof CR_BANDS | null>(null);
  const [activeFilters, setActiveFilters] = useState<PresetFilter[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const activeSpectrum = useMemo<CRSpectrum | null>(() => {
    const f = activeFilters.find((x) => x.kind === "cr_spectrum");
    return f && f.kind === "cr_spectrum" ? f.value : null;
  }, [activeFilters]);

  const activeGenres = useMemo<GenreTag[]>(
    () => activeFilters.filter((f): f is Extract<PresetFilter, { kind: "genre" }> => f.kind === "genre").map((f) => f.value),
    [activeFilters],
  );

  const toggleFilter = (f: PresetFilter) => {
    setActiveFilters((prev) => {
      const existing = prev.findIndex((x) => x.kind === f.kind && x.value === f.value);
      if (existing >= 0) return prev.filter((_, i) => i !== existing);
      // Spectrum is single-select: clear any prior spectrum filter first
      const cleared = f.kind === "cr_spectrum" ? prev.filter((x) => x.kind !== "cr_spectrum") : prev;
      return [...cleared, f];
    });
  };

  const toggleGenre = (g: GenreTag) => toggleFilter({ kind: "genre", value: g });

  const setSpectrum = (s: CRSpectrum | null) => {
    setActiveFilters((prev) => {
      const cleared = prev.filter((x) => x.kind !== "cr_spectrum");
      return s ? [...cleared, { kind: "cr_spectrum", value: s }] : cleared;
    });
  };

  const visible = useMemo(() => {
    const hasBand = !!activeBand || !!activeSpectrum;
    const hasGenre = activeGenres.length > 0;
    if (!hasBand && !hasGenre) return PROGRESSION_PRESETS;

    return PROGRESSION_PRESETS.filter((p) => {
      const spectrums = getPresetCRSpectrums(p);
      const genres = getPresetGenres(p);
      const vibes = getPresetVibes(p);

      let bandMatch = true;
      let genreMatch = true;

      if (hasBand) {
        if (activeSpectrum) {
          bandMatch = spectrums.includes(activeSpectrum) ||
            (spectrums.length === 0 && vibes.some((v) => v.toLowerCase().includes(activeSpectrum)));
        } else {
          if (spectrums.length > 0) {
            const bandSpectrums = CR_BANDS[activeBand!] as readonly string[];
            bandMatch = spectrums.some((s) => bandSpectrums.includes(s));
          } else {
            const bandLabel =
              activeBand === "dark" ? "Dark" : activeBand === "neutral" ? "Cinematic" : "Epic";
            bandMatch = vibes.some((v) => v.includes(bandLabel));
          }
        }
      }

      if (hasGenre) {
        genreMatch = genres.some((g) => activeGenres.includes(g));
      }

      return bandMatch && genreMatch;
    });
  }, [activeBand, activeSpectrum, activeGenres]);

  const handlePlay = async (preset: ProgressionPreset, chords: ChordSymbol[]) => {
    if (playingId === preset.id) {
      stopProgression();
      setPlayingId(null);
      return;
    }
    stopProgression();
    const events = chords.map((c, i) => ({ chord: c, startBeat: i * 2, lengthBeats: 2 }));
    const totalBeats = events.length * 2;
    setPlayingId(preset.id);
    await playProgression(events, meta.bpm, {
      loopBeats: totalBeats,
      octave: 3,
      onEnd: () => setPlayingId((id) => (id === preset.id ? null : id)),
    });
  };

  const handleUse = (chords: ChordSymbol[]) => {
    stopProgression();
    setPlayingId(null);
    onUse(chords);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          stopProgression();
          setPlayingId(null);
        }
        onOpenChange(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl text-primary">Popular Progressions</SheetTitle>
        </SheetHeader>

        {/* Row 1 — Band pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {BAND_LABELS.map(({ label, key }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setActiveBand(key);
                setSpectrum(null);
              }}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                activeBand === key ? "btn-sculpt-cocoa" : "btn-sculpt-cream",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Row 2 — Spectrum chips (only when a band is selected) */}
        {activeBand && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(CR_BANDS[activeBand] as readonly CRSpectrum[]).map((s) => {
              const isActive = activeSpectrum === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpectrum(isActive ? null : s)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                    isActive ? "btn-sculpt-cocoa" : "btn-sculpt-cream",
                  )}
                >
                  {CR_SPECTRUM_LABEL[s]}
                </button>
              );
            })}
          </div>
        )}

        {/* Row 3 — Genre chips */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="shrink-0 font-display text-[9px] uppercase tracking-widest text-muted-foreground pr-0.5">
            Genre
          </span>
          {GENRE_FILTER_TAGS.map((g) => {
            const isActive = activeGenres.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-0.5 text-[10px] font-semibold transition-colors border",
                  isActive ? "border-transparent" : "border-transparent",
                )}
                style={
                  isActive
                    ? { background: GENRE_COLOR[g], color: "oklch(0.25 0.02 260)", outline: "2px solid oklch(0.25 0.02 260 / 0.3)" }
                    : { background: GENRE_COLOR[g], color: "oklch(0.25 0.02 260)", opacity: 0.55 }
                }
              >
                {GENRE_LABEL[g]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 pb-6">
          {visible.map((preset) => {
            const chords = realizePreset(preset, meta.keyRoot, meta.keyMode);
            const isPlaying = playingId === preset.id;
            const presetGenres = getPresetGenres(preset);
            const presetVibe = getPresetVibes(preset)[0];
            const showGenreBadges = presetGenres.length > 0;
            return (
              <div
                key={preset.id}
                className="rounded-xl p-3"
                style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                  <span className="font-display text-lg font-bold">{preset.name}</span>
                  <span className="font-mono-chord text-xs text-muted-foreground">{preset.formula}</span>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {presetVibe && (
                    <span className="inline-block rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ background: "var(--paper-shade-soft)" }}>
                      {presetVibe}
                    </span>
                  )}
                  {showGenreBadges && presetGenres.map((g) => {
                    const isHighlighted = activeGenres.length > 0 && activeGenres.includes(g);
                    return (
                      <span
                        key={g}
                        className="inline-block rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold transition-opacity"
                        style={{
                          background: GENRE_COLOR[g],
                          color: "oklch(0.25 0.02 260)",
                          opacity: activeGenres.length > 0 && !isHighlighted ? 0.45 : 1,
                          outline: isHighlighted ? "2px solid oklch(0.25 0.02 260 / 0.3)" : undefined,
                        }}
                      >
                        {GENRE_LABEL[g]}
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {chords.map((c, i) => (
                    <ChordChip key={`${preset.id}-${i}`} chord={c} variant="ink" size="sm" />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlay(preset, chords)}
                    className="btn-sculpt-cream inline-flex items-center justify-center gap-1.5 rounded-lg h-9 px-3 text-xs font-semibold"
                    aria-label={isPlaying ? "Stop preview" : "Play preview"}
                  >
                    {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {isPlaying ? "Stop" : "Play"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUse(chords)}
                    className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-9 px-4 text-xs font-semibold"
                  >
                    Use
                  </button>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No presets match this filter.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
