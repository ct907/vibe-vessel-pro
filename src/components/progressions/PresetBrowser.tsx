import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PROGRESSION_PRESETS, realizePreset, type ProgressionPreset } from "@/lib/music/presets";
import { CR_BANDS, CR_SPECTRUM_LABEL, type CRSpectrum } from "@/lib/music/chordRelationships";
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

export function PresetBrowser({ open, onOpenChange, onUse }: PresetBrowserProps) {
  const meta = useSongStore((s) => s.meta);
  const [activeBand, setActiveBand] = useState<keyof typeof CR_BANDS | null>(null);
  const [activeSpectrum, setActiveSpectrum] = useState<CRSpectrum | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!activeBand && !activeSpectrum) return PROGRESSION_PRESETS;
    return PROGRESSION_PRESETS.filter((p) => {
      const spectrums = p.crSpectrums;
      if (activeSpectrum) {
        if (spectrums?.includes(activeSpectrum)) return true;
        if (!spectrums) return p.tag.toLowerCase().includes(activeSpectrum);
        return false;
      }
      if (spectrums) {
        const bandSpectrums = CR_BANDS[activeBand!] as readonly string[];
        return spectrums.some((s) => bandSpectrums.includes(s));
      }
      const bandLabel =
        activeBand === "dark" ? "Dark" : activeBand === "neutral" ? "Cinematic" : "Epic";
      return p.tag.includes(bandLabel);
    });
  }, [activeBand, activeSpectrum]);

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
          <SheetTitle className="font-display text-2xl">Popular Progressions</SheetTitle>
        </SheetHeader>

        {/* Row 1 — Band pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {BAND_LABELS.map(({ label, key }) => {
            const active = activeBand === key;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setActiveBand(key);
                  setActiveSpectrum(null);
                }}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                  active ? "btn-sculpt-cocoa" : "btn-sculpt-cream",
                )}
              >
                {label}
              </button>
            );
          })}
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
                  onClick={() => setActiveSpectrum(isActive ? null : s)}
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

        <div className="mt-4 space-y-3 pb-6">
          {visible.map((preset) => {
            const chords = realizePreset(preset, meta.keyRoot, meta.keyMode);
            const isPlaying = playingId === preset.id;
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
                <div className="mb-2">
                  <span className="inline-block rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ background: "var(--paper-shade-soft)" }}>
                    {preset.tag}
                  </span>
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
