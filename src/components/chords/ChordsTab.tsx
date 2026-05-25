import { useMemo, useState } from "react";
import { useSongStore } from "@/store/song";
import { useUIStore } from "@/store/ui";
import { WhyThisChordSheet } from "@/components/chords/WhyThisChordSheet";
import { useTheme } from "@/hooks/use-theme";
import { ChordSymbol, Quality, nashvilleLadder, parseChord, isMinorMode, COMMON_QUALITIES, rootToPc, QUALITY_FAMILY, QUALITY_PRETTY } from "@/lib/music/chords";
import { ChordChip } from "@/components/chord/ChordChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Music, Play, Square } from "lucide-react";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { PROGRESSION_PRESETS, QUALITY_PROGRESSION_PRESETS, realizePreset, getPresetVibes, type ProgressionPreset } from "@/lib/music/presets";
import { analyzeProgression, describeChordFunction } from "@/lib/music/harmony";
import { playProgression, stopProgression, ensureAudio } from "@/lib/music/audio";
import { getChordProgressionSuggestions } from "@/lib/music/suggestions";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const qualitySuffix = (q: Quality): string => (q === "maj" ? "" : q === "min" ? "m" : q);

const QUALITY_LABEL: Record<Quality, string> = {
  maj: "Major", min: "Minor", dim: "Diminished", aug: "Augmented",
  sus2: "Suspended 2", sus4: "Suspended 4",
  maj7: "Major 7th", min7: "Minor 7th", "7": "Dominant 7th",
  dim7: "Diminished 7th", m7b5: "Half-diminished", minMaj7: "Minor-Major 7th",
  maj9: "Major 9th", min9: "Minor 9th", "9": "Dominant 9th",
  "6": "Major 6th", min6: "Minor 6th", add9: "Add 9",
  "5": "Power", "7alt": "Altered Dominant",
  "7#5": "Dominant 7 ♯5", "7b9": "Dominant 7 ♭9", "7#9": "Dominant 7 ♯9",
  maj11: "Major 11th", maj13: "Major 13th",
  min11: "Minor 11th", min13: "Minor 13th",
  add11: "Add 11", "6/9": "6 / 9",
};

interface ChordsTabProps {
  onSwitchTab?: (t: "lyrics" | "chords" | "progressions") => void;
}


export function ChordsTab({ onSwitchTab }: ChordsTabProps = {}) {
  const { theme } = useTheme();
  const meta = useSongStore((s) => s.meta);
  const progression = useSongStore((s) => s.progression);
  const addChordToPattern = useSongStore((s) => s.addChordToPattern);
  const setWhyChord = useUIStore((s) => s.setWhyChord);
  const ladder = useMemo(() => nashvilleLadder(meta.keyRoot, meta.keyMode), [meta.keyRoot, meta.keyMode]);
  const [numeralFilter, setNumeralFilter] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState<number>(4);
  const [detailChord, setDetailChord] = useState<ChordSymbol | null>(null);
  const [playingPresetId, setPlayingPresetId] = useState<string | null>(null);
  const [playingStep, setPlayingStep] = useState<number | null>(null);


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

  // Detail sheet derivations
  const detailAnalysis = useMemo(() => {
    if (!detailChord) return null;
    const a = analyzeProgression([detailChord], meta.keyRoot, meta.keyMode);
    return a.chords[0];
  }, [detailChord, meta.keyRoot, meta.keyMode]);

  const detailExplainer = useMemo(() => {
    if (!detailChord || !detailAnalysis) return "";
    return describeChordFunction(detailAnalysis);
  }, [detailChord, detailAnalysis]);

  const detailSuggestions = useMemo(() => {
    if (!detailChord) return [];
    return getChordProgressionSuggestions(detailChord, meta.keyRoot, meta.keyMode);
  }, [detailChord, meta.keyRoot, meta.keyMode]);

  const matchingPresets = useMemo(() => {
    if (!detailChord) return [];
    const matches: Array<{ preset: ProgressionPreset; chords: ChordSymbol[]; hitIndex: number }> = [];
    const usedIds = new Set<string>();

    const chordPc = rootToPc(detailChord.root);
    const keyPc = rootToPc(meta.keyRoot);
    const targetInterval = (chordPc - keyPc + 12) % 12;
    const detailFamily = QUALITY_FAMILY[detailChord.quality];

    const swapAt = (chords: ChordSymbol[], i: number): ChordSymbol[] =>
      chords.map((c, idx) =>
        idx === i
          ? { ...c, quality: detailChord.quality, display: c.root + QUALITY_PRETTY[detailChord.quality] }
          : c,
      );

    for (const preset of QUALITY_PROGRESSION_PRESETS) {
      if (!preset.featuredQualities?.includes(detailChord.quality)) continue;
      const featIdx = preset.featureIndex ?? preset.degrees.findIndex((d) => d.quality === detailChord.quality);
      if (featIdx < 0) continue;
      const slot = preset.degrees[featIdx];
      if (slot.interval !== targetInterval) continue;
      if (QUALITY_FAMILY[slot.quality] !== detailFamily) continue;
      const chords = swapAt(realizePreset(preset, meta.keyRoot, meta.keyMode), featIdx);
      matches.push({ preset, chords, hitIndex: featIdx });
      usedIds.add(preset.id);
      if (matches.length >= 3) break;
    }

    if (matches.length < 3) {
      for (const preset of PROGRESSION_PRESETS) {
        if (usedIds.has(preset.id)) continue;
        const hitIndex = preset.degrees.findIndex(
          (d) => d.interval === targetInterval && QUALITY_FAMILY[d.quality] === detailFamily,
        );
        if (hitIndex < 0) continue;
        const chords = swapAt(realizePreset(preset, meta.keyRoot, meta.keyMode), hitIndex);
        matches.push({ preset, chords, hitIndex });
        if (matches.length >= 3) break;
      }
    }
    return matches;
  }, [detailChord, meta.keyRoot, meta.keyMode]);




  const closeDetail = () => {
    stopProgression();
    setPlayingPresetId(null);
    setPlayingStep(null);
    setDetailChord(null);
  };

  const playPreset = async (preset: ProgressionPreset, chords: ChordSymbol[]) => {
    if (playingPresetId === preset.id) {
      stopProgression();
      setPlayingPresetId(null);
      setPlayingStep(null);
      return;
    }
    stopProgression();
    await ensureAudio();
    const beats = preset.beatsPerChord ?? 2;
    const events = chords.map((c, i) => ({ chord: c, startBeat: i * beats, lengthBeats: beats }));
    setPlayingPresetId(preset.id);
    setPlayingStep(0);
    await playProgression(events, meta.bpm, {
      loopBeats: events.length * beats,
      onChordStart: (idx) => setPlayingStep(idx),
      onEnd: () => {
        setPlayingPresetId((id) => (id === preset.id ? null : id));
        setPlayingStep(null);
      },
    });
  };


  const findFirstAvailablePattern = () => {
    for (const p of progression) {
      const used = p.chords.reduce((s, c) => s + c.lengthBeats, 0);
      if (used < p.bars * p.beatsPerBar) return { pattern: p, used };
    }
    return progression[0] ? { pattern: progression[0], used: 0 } : null;
  };

  const addChordToSong = (chord: ChordSymbol) => {
    const target = findFirstAvailablePattern();
    if (!target) {
      toast({ title: "No pattern blocks available", variant: "destructive" });
      return;
    }
    const remaining = target.pattern.bars * target.pattern.beatsPerBar - target.used;
    const len = Math.min(2, Math.max(0.5, remaining));
    addChordToPattern(target.pattern.id, chord, target.used, len);
    toast({ title: `Added ${chord.display} to ${target.pattern.label || "pattern"}` });
    if (onSwitchTab) onSwitchTab("progressions");
  };

  const sendPresetToProgressions = (chords: ChordSymbol[], presetName: string) => {
    const target = progression[0];
    if (!target) {
      toast({ title: "No pattern blocks available", variant: "destructive" });
      return;
    }
    useSongStore.getState().replacePatternChords(target.id, chords);
    toast({ title: `Sent "${presetName}" to Progressions` });
    closeDetail();
    if (onSwitchTab) onSwitchTab("progressions");
  };

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
                <ChordChip chord={d.chord} variant="ink" size="sm" octave={octave} audition={false} onClick={() => setWhyChord({ chord: d.chord })} />
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
          Tap to learn · Hold to sustain
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
                  <ChordChip chord={c} variant="ink" octave={octave} onClick={() => setWhyChord({ chord: c })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={!!detailChord} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          {detailChord && (
            <>
              <SheetHeader>
                <div
                  className="rounded-xl p-4"
                  style={{
                    ...getChordColorClasses(detailChord).style,
                  }}
                >
                  <div className="font-mono-chord text-3xl font-bold leading-none">{detailChord.display}</div>
                  <div className="text-xs mt-1 opacity-80">{QUALITY_LABEL[detailChord.quality]}</div>
                </div>
                <SheetTitle className="sr-only">{detailChord.display}</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4 pb-6">
                {detailExplainer && (
                  <p className="text-sm leading-relaxed text-foreground">{detailExplainer}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { addChordToSong(detailChord); closeDetail(); }}
                    className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-10 px-4 text-sm font-semibold"
                  >
                    Add to song
                  </button>
                </div>

                {detailSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-display text-base font-bold">Works well with</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailSuggestions.map((c) => (
                        <ChordChip
                          key={c.display}
                          chord={c}
                          variant="ink"
                          octave={octave}
                        />
                      ))}
                    </div>
                  </div>
                )}


                {matchingPresets.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-display text-base font-bold">Used in these progressions</h3>
                    {matchingPresets.map(({ preset, chords, hitIndex }) => {
                      const isPlaying = playingPresetId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          className="rounded-lg p-3"
                          style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
                        >
                          <div className="flex items-baseline gap-2 flex-wrap mb-1">
                            <span className="font-display font-semibold text-sm">{preset.name}</span>
                            <span className="font-mono-chord text-[10px] text-muted-foreground">{preset.formula}</span>
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{getPresetVibes(preset)[0] ?? ""}</div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {chords.map((c, i) => {
                              const isPlayhead = isPlaying && i === playingStep;
                              return (
                                <span
                                  key={i}
                                  className={cn(
                                    "rounded transition-shadow",
                                    i === hitIndex && "ring-2 ring-primary",
                                    isPlayhead && "ring-2 ring-primary shadow-[0_0_0_3px_var(--primary-halo)]",
                                  )}
                                >
                                  <ChordChip chord={c} variant="ink" size="sm" audition={false} />
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => playPreset(preset, chords)}
                              className="btn-sculpt-cream inline-flex items-center justify-center gap-1.5 rounded-md h-8 px-3 text-xs font-semibold"
                            >
                              {isPlaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              {isPlaying ? "Stop" : "Play"}
                            </button>
                            <button
                              type="button"
                              onClick={() => sendPresetToProgressions(chords, preset.name)}
                              className="btn-sculpt-amber inline-flex items-center justify-center rounded-md h-8 px-3 text-xs font-semibold"
                            >
                              Send to Progressions
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <WhyThisChordSheet />
    </div>
  );
}

