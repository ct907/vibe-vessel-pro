import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChordChip } from "@/components/chord/ChordChip";
import { Play, Square, Repeat2 } from "lucide-react";
import {
  type ChordSymbol,
  type Mode,
  type Quality,
  QUALITY_PRETTY,
  QUALITY_FAMILY,
  rootToPc,
  pcToName,
  parseChord,
  nashvilleLadder,
  isMinorMode,
  MODE_LABEL,
} from "@/lib/music/chords";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { analyzeProgression, describeChordFunction } from "@/lib/music/harmony";
import {
  MODE_CHARACTER,
  findParallelModesContaining,
  getNumeralAtDegree,
  modeDisplayName,
  type AnyMode,
} from "@/lib/music/modes";
import {
  PROGRESSION_PRESETS,
  realizePreset,
  type ProgressionPreset,
} from "@/lib/music/presets";
import { playChord, playProgression, stopProgression, ensureAudio } from "@/lib/music/audio";
import { useSongStore } from "@/store/song";
import { useUIStore } from "@/store/ui";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const QUALITY_LABEL: Partial<Record<Quality, string>> = {
  maj: "Major", min: "Minor", dim: "Diminished", aug: "Augmented",
  sus2: "Suspended 2", sus4: "Suspended 4",
  maj7: "Major 7th", min7: "Minor 7th", "7": "Dominant 7th",
  dim7: "Diminished 7th", m7b5: "Half-diminished", minMaj7: "Minor-Major 7th",
  maj9: "Major 9th", min9: "Minor 9th", "9": "Dominant 9th",
  "6": "Major 6th", min6: "Minor 6th", add9: "Add 9",
  "5": "Power", "7alt": "Altered Dominant",
};

const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);
const useFlatFor = (k: string) => k.includes("b") || FLAT_KEYS.has(k);

function buildChord(rootPc: number, quality: Quality, useFlat: boolean): ChordSymbol {
  const root = pcToName(rootPc, useFlat);
  return { root, quality, display: root + QUALITY_PRETTY[quality] };
}

function relativeSwap(c: ChordSymbol, useFlat: boolean): ChordSymbol | null {
  const fam = QUALITY_FAMILY[c.quality];
  if (fam === "major") {
    const pc = (rootToPc(c.root) + 9) % 12;
    return buildChord(pc, c.quality === "maj" ? "min" : c.quality, useFlat);
  }
  if (fam === "minor") {
    const pc = (rootToPc(c.root) + 3) % 12;
    return buildChord(pc, c.quality === "min" ? "maj" : c.quality, useFlat);
  }
  return null;
}

function chordsEqualDisplay(a: ChordSymbol, b: ChordSymbol): boolean {
  return a.display === b.display;
}

export function WhyThisChordSheet() {
  const req = useUIStore((s) => s.whyChord);
  const setWhyChord = useUIStore((s) => s.setWhyChord);
  const meta = useSongStore((s) => s.meta);
  const updatePatternChord = useSongStore((s) => s.updatePatternChord);

  const [playingPresetId, setPlayingPresetId] = useState<string | null>(null);
  const [playingStep, setPlayingStep] = useState<number | null>(null);

  const open = !!req;
  const chord = req?.chord ?? null;
  const useFlat = useFlatFor(meta.keyRoot);

  const close = () => {
    stopProgression();
    setPlayingPresetId(null);
    setPlayingStep(null);
    setWhyChord(null);
  };

  // ----- Analysis -----
  const analysis = useMemo(() => {
    if (!chord) return null;
    return analyzeProgression([chord], meta.keyRoot, meta.keyMode).chords[0];
  }, [chord, meta.keyRoot, meta.keyMode]);

  const explainer = useMemo(() => {
    if (!chord || !analysis) return "";
    return describeChordFunction(analysis, meta.keyRoot, meta.keyMode);
  }, [chord, analysis, meta.keyRoot, meta.keyMode]);

  const interval = useMemo(() => {
    if (!chord) return 0;
    return ((rootToPc(chord.root) - rootToPc(meta.keyRoot)) % 12 + 12) % 12;
  }, [chord, meta.keyRoot]);

  // ----- Borrowed-from modes -----
  const parallelModes = useMemo<AnyMode[]>(() => {
    if (!chord) return [];
    if (!analysis?.isBorrowed) return [];
    return findParallelModesContaining(interval, chord.quality)
      .filter((m) => m !== meta.keyMode);
  }, [chord, analysis, interval, meta.keyMode]);

  // ----- Matching presets: primary → secondary → borrowed (cap 3) -----
  type MatchKind = "primary" | "secondary" | "borrowed";
  interface PresetMatch {
    preset: ProgressionPreset;
    chords: ChordSymbol[];
    hitIndex: number;
    matchKind: MatchKind;
    subLabel?: string;
  }

  const matchingPresets = useMemo<PresetMatch[]>(() => {
    if (!chord) return [];
    const out: PresetMatch[] = [];
    const seen = new Set<string>();
    const focusedQuality = chord.quality;
    const focusedDegree = interval;

    const push = (m: PresetMatch) => {
      if (seen.has(m.preset.id) || out.length >= 3) return;
      seen.add(m.preset.id);
      out.push(m);
    };

    // Tier 1 — primary: same quality AND same degree (in current song key)
    for (const preset of PROGRESSION_PRESETS) {
      const hit = preset.degrees.findIndex(
        (d) => d.quality === focusedQuality && d.interval === focusedDegree,
      );
      if (hit < 0) continue;
      const realized = realizePreset(preset, meta.keyRoot, meta.keyMode);
      push({ preset, chords: realized, hitIndex: hit, matchKind: "primary" });
      if (out.length >= 3) return out;
    }

    // Tier 2 — secondary: same quality anywhere
    if (out.length < 2) {
      const qLabel = QUALITY_LABEL[focusedQuality] ?? focusedQuality;
      for (const preset of PROGRESSION_PRESETS) {
        const hit = preset.degrees.findIndex((d) => d.quality === focusedQuality);
        if (hit < 0) continue;
        const realized = realizePreset(preset, meta.keyRoot, meta.keyMode);
        push({
          preset,
          chords: realized,
          hitIndex: hit,
          matchKind: "secondary",
          subLabel: `Also uses ${qLabel}`,
        });
        if (out.length >= 3) return out;
      }
    }

    // Tier 3 — borrowed: parallel-mode aware
    if (out.length < 3) {
      const modes = findParallelModesContaining(focusedDegree, focusedQuality)
        .filter((m) => m !== meta.keyMode);
      for (const m of modes) {
        for (const preset of PROGRESSION_PRESETS) {
          const hit = preset.degrees.findIndex(
            (d) => d.quality === focusedQuality && d.interval === focusedDegree,
          );
          if (hit < 0) continue;
          const realized = realizePreset(preset, meta.keyRoot, meta.keyMode);
          push({
            preset,
            chords: realized,
            hitIndex: hit,
            matchKind: "borrowed",
            subLabel: `Borrowed context — ${modeDisplayName(m)}`,
          });
          if (out.length >= 3) return out;
        }
      }
    }

    return out;
  }, [chord, meta.keyRoot, meta.keyMode, interval]);

  // ----- Specialist hint (zero results fallback) -----
  const specialistHint = useMemo(() => {
    if (!chord || matchingPresets.length > 0) return null;
    const ladder = nashvilleLadder(meta.keyRoot, meta.keyMode);
    if (ladder.length === 0) return null;
    const targetPc = rootToPc(chord.root);
    const withDist = ladder.map((d) => {
      const pc = rootToPc(d.chord.root);
      const up = (pc - targetPc + 12) % 12;
      const down = (targetPc - pc + 12) % 12;
      return { chord: d.chord, up, down };
    });
    const next = [...withDist].sort((a, b) => (a.up || 12) - (b.up || 12))[0]?.chord;
    const prev = [...withDist].sort((a, b) => (a.down || 12) - (b.down || 12))[0]?.chord;
    if (!next || !prev) return null;
    return `${chord.display} is a specialist chord — try it as a passing chord between ${prev.display} and ${next.display}.`;
  }, [chord, matchingPresets, meta.keyRoot, meta.keyMode]);


  // ----- Related chords -----
  const relatedChords = useMemo<ChordSymbol[]>(() => {
    if (!chord) return [];
    const out: ChordSymbol[] = [];
    const seen = new Set<string>([chord.display]);
    const push = (c: ChordSymbol | null | undefined) => {
      if (!c || seen.has(c.display) || out.length >= 3) return;
      seen.add(c.display);
      out.push(c);
    };

    // (a) relative major/minor
    push(relativeSwap(chord, useFlat));

    // (b) diatonic neighbours: chord at degree ±1 in current mode
    const ladder = nashvilleLadder(meta.keyRoot, meta.keyMode);
    const curIdx = ladder.findIndex(
      (d) => d.chord.root === chord.root,
    );
    if (curIdx >= 0) {
      const next = ladder[(curIdx + 1) % ladder.length];
      const prev = ladder[(curIdx - 1 + ladder.length) % ladder.length];
      push(next?.chord);
      push(prev?.chord);
    }

    // (c) borrowed counterpart (parallel mode)
    const fam = QUALITY_FAMILY[chord.quality];
    if (fam === "major") {
      const swap = parseChord(chord.root + "m");
      push(swap ?? undefined);
    } else if (fam === "minor") {
      const swap = parseChord(chord.root);
      push(swap ?? undefined);
    }

    return out;
  }, [chord, meta.keyRoot, meta.keyMode, useFlat]);

  // ----- Actions -----
  const auditionChord = (c: ChordSymbol) => {
    void playChord(c, undefined, c.octave ?? 4);
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

  const sendPresetToProgressions = (chords: ChordSymbol[], presetName: string) => {
    const target = useSongStore.getState().progression[0];
    if (!target) {
      toast({ title: "No pattern blocks available", variant: "destructive" });
      return;
    }
    useSongStore.getState().replacePatternChords(target.id, chords);
    toast({ title: `Sent "${presetName}" to Progressions` });
    close();
  };

  const replaceInSong = (newChord: ChordSymbol) => {
    if (!req?.patternId || !req.chordId) {
      // Library mode (Chords tab): add to first available pattern instead.
      const target = useSongStore.getState().progression[0];
      if (!target) {
        toast({ title: "No pattern blocks available", variant: "destructive" });
        return;
      }
      const used = target.chords.reduce((s, c) => s + c.lengthBeats, 0);
      const remaining = target.bars * target.beatsPerBar - used;
      const len = Math.min(2, Math.max(0.5, remaining));
      useSongStore.getState().addChordToPattern(target.id, newChord, used, len);
      toast({ title: `Added ${newChord.display}` });
      close();
      return;
    }
    updatePatternChord(req.patternId, req.chordId, { chord: newChord });
    toast({ title: `Replaced with ${newChord.display}` });
    close();
  };

  if (!chord) return null;

  const modeName = isMinorMode(meta.keyMode) ? "minor" : "major";
  const keyLabel = `${meta.keyRoot} ${MODE_LABEL[meta.keyMode]}`;
  const showBorrowedSection = !!analysis?.isBorrowed && parallelModes.length > 0;
  const showChromaticNote = !!analysis?.isChromatic;

  // Override the harmony.ts default sentence with the spec wording for the
  // diatonic / borrowed / chromatic branches.
  const roleSentence = (() => {
    if (!analysis) return explainer;
    if (analysis.isBorrowed && parallelModes.length > 0) {
      const m = parallelModes[0];
      const ch = MODE_CHARACTER[m];
      return `This is borrowed from ${modeDisplayName(m)} — ${ch.mood.toLowerCase()}.`;
    }
    if (analysis.isChromatic) {
      return "This is a chromatic chord — it sits outside the key for colour or tension.";
    }
    return `This is the ${analysis.romanNumeral} in ${meta.keyRoot} ${modeName}. ${explainer
      .split(".")
      .slice(1)
      .join(".")
      .trim() || "It anchors the harmony in this key."}`;
  })();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto p-0"
      >
        <SheetTitle className="sr-only">Why {chord.display}?</SheetTitle>

        {/* 1. Header */}
        <div
          className="px-4 pt-6 pb-4 rounded-b-xl flex items-center gap-3"
          style={{ ...getChordColorClasses(chord).style }}
        >
          <div className="min-w-0 flex-1">
            <div className="font-mono-chord text-4xl font-bold leading-none">
              {chord.display}
            </div>
            <div className="text-xs mt-1 opacity-80 font-display">
              {QUALITY_LABEL[chord.quality] ?? chord.quality} · in {keyLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => auditionChord(chord)}
            className="btn-sculpt-cream inline-flex items-center justify-center rounded-full h-11 w-11 shrink-0"
            aria-label={`Play ${chord.display}`}
            title="Audition chord"
          >
            <Play className="h-5 w-5" />
          </button>
        </div>

        <SheetHeader className="sr-only">
          <SheetTitle>Why {chord.display}?</SheetTitle>
        </SheetHeader>

        <div className="px-4 py-4 space-y-5 pb-10">
          {/* 2. Role in this key */}
          <section className="space-y-1.5">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Role in this key
            </h3>
            <p className="text-sm leading-relaxed text-foreground">{roleSentence}</p>
          </section>

          {/* 3. Where it comes from */}
          {showBorrowedSection && (
            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Where it comes from
              </h3>
              <div className="flex flex-col gap-1.5">
                {parallelModes.slice(0, 3).map((m) => {
                  const ch = MODE_CHARACTER[m];
                  const numeral = getNumeralAtDegree(m, interval) ?? "";
                  return (
                    <div
                      key={m}
                      className="rounded-lg p-2.5 flex items-center gap-3"
                      style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-sm font-semibold capitalize">
                          {modeDisplayName(m)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{ch.mood}</div>
                      </div>
                      {numeral && (
                        <span className="font-mono-chord text-sm font-bold shrink-0">
                          {numeral}
                        </span>
                      )}
                    </div>
                  );
                })}
                {parallelModes.length > 3 && (
                  <div className="text-[11px] text-muted-foreground italic px-1">
                    … and others.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 4. Used in these progressions */}
          {(matchingPresets.length > 0 || specialistHint) && (
            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Used in these progressions
              </h3>
              {matchingPresets.map(({ preset, chords, hitIndex, subLabel }) => {
                const isPlaying = playingPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className="rounded-lg p-3 space-y-2"
                    style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
                  >
                    {subLabel && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">
                        {subLabel}
                      </div>
                    )}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-semibold text-sm">{preset.name}</span>
                      <span className="font-mono-chord text-[10px] text-muted-foreground">
                        {preset.formula}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
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
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => playPreset(preset, chords)}
                        className="btn-sculpt-cream inline-flex items-center justify-center gap-1.5 rounded-md h-11 min-w-[44px] px-3 text-xs font-semibold"
                        aria-label={isPlaying ? "Stop loop" : "Play loop"}
                      >
                        {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {isPlaying ? "Stop" : "Loop"}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendPresetToProgressions(chords, preset.name)}
                        className="btn-sculpt-amber inline-flex items-center justify-center rounded-md h-11 px-4 text-xs font-semibold"
                      >
                        Send to Progressions
                      </button>
                    </div>
                  </div>
                );
              })}
              {specialistHint && (
                <div
                  className="rounded-lg p-3 text-sm text-foreground leading-relaxed"
                  style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
                >
                  {specialistHint}
                </div>
              )}
            </section>
          )}


          {/* 5. Try a related chord */}
          {relatedChords.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Try a related chord
              </h3>
              <div className="flex flex-col gap-1.5">
                {relatedChords.map((c) => (
                  <div
                    key={c.display}
                    className="rounded-lg p-2 flex items-center gap-2"
                    style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-card)" }}
                  >
                    <button
                      type="button"
                      onClick={() => auditionChord(c)}
                      className="inline-flex items-center justify-center rounded-md h-11 min-w-[44px] px-2 shrink-0"
                      style={{ ...getChordColorClasses(c).style }}
                      aria-label={`Audition ${c.display}`}
                    >
                      <span className="font-mono-chord text-sm font-bold">{c.display}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => replaceInSong(c)}
                      className="btn-sculpt-amber ml-auto inline-flex items-center gap-1.5 rounded-md h-11 px-3 text-xs font-semibold shrink-0"
                    >
                      <Repeat2 className="h-3.5 w-3.5" />
                      {req?.patternId ? "Replace in song" : "Add to song"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
