import { useMemo, useState } from "react";
import { PROGRESSION_PRESETS, realizePreset, getPresetVibes, type ProgressionPreset } from "@/lib/music/presets";
import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { playProgression, stopProgression } from "@/lib/music/audio";
import type { ChordSymbol } from "@/lib/music/chords";
import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface PresetListProps {
  onUse: (chords: ChordSymbol[]) => void;
  /** Optional override label for the heading. */
  heading?: string;
}

const FILTER_CHIPS: Array<{ label: string; match: string | null }> = [
  { label: "All", match: null },
  { label: "Emotional", match: "Emotional" },
  { label: "Smooth", match: "Smooth" },
  { label: "Epic", match: "Epic" },
  { label: "Dark", match: "Dark" },
  { label: "Nostalgic", match: "Nostalgic" },
  { label: "Classic", match: "Classic" },
];

export function PresetList({ onUse, heading = "Popular Progressions" }: PresetListProps) {
  const meta = useSongStore((s) => s.meta);
  const [filter, setFilter] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter ? PROGRESSION_PRESETS.filter((p) => getPresetVibes(p).some((v) => v.includes(filter))) : PROGRESSION_PRESETS),
    [filter],
  );

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
  };

  return (
    <div>
      <h3 className="font-display text-base font-bold mb-2" style={{ color: "var(--paper)" }}>{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.match;
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => setFilter(chip.match)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                active ? "btn-sculpt-cocoa" : "btn-sculpt-cream",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
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
                  {getPresetVibes(preset)[0] ?? ""}
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
    </div>
  );
}
