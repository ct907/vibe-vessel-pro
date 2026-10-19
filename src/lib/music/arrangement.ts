// What plays when: the song laid out in beats, and the notes each part plays.
//
// Pure functions only (no Web Audio, no stores), so the scheduler in audio.ts
// can ask for any window of notes and the same output is unit-testable.

import { chordToMidi, transposeChord, type ChordSymbol } from "./chords";
import { computeEffectiveOffsets } from "./keyChange";
import { patternPlayBeats, type PatternBlock, type Section } from "@/store/song";
import type { ArpRepeat, ArpSettings, BassRepeat } from "@/store/sound";

export interface ChordEvent {
  chord: ChordSymbol;
  /** Start in beats from the top of the song. */
  startBeat: number;
  lengthBeats: number;
  /** Owning section id: looks up per-section sound settings. */
  sectionId?: string;
}

/** Which chord in the editor an event came from, for the playhead. */
export interface ChordRef {
  patternId: string;
  patternChordId: string;
  mirrorId?: string;
}

export interface BlockSpan {
  startBeat: number;
  lengthBeats: number;
  beatsPerBar: number;
}

export interface SectionSpan {
  sectionId: string;
  startBeat: number;
  lengthBeats: number;
  /** Bars restart at every block, and a cropped block can end mid-bar. */
  blocks: BlockSpan[];
}

export interface Arrangement {
  /** Sorted by startBeat. */
  chords: ChordEvent[];
  refs: ChordRef[];
  sections: SectionSpan[];
  loopBeats: number;
}

export interface Meter {
  beatsPerBar: number;
  beatUnit: number;
}

export type PlayPart = "pad" | "bass" | "click";

export interface PlayNote {
  part: PlayPart;
  midi: number;
  startBeat: number;
  lengthBeats: number;
  velocity: number;
}

/** A rendered loop: every note, sorted by start, plus where each chord begins. */
export interface Track {
  notes: PlayNote[];
  chordStarts: { beat: number; index: number }[];
  loopBeats: number;
}

/** Lays sections → blocks → chords end to end. Null when there is nothing with a length. */
export function buildArrangement(sections: Section[], progression: PatternBlock[]): Arrangement | null {
  let cursorBeat = 0;
  const events: ChordEvent[] = [];
  const refs: ChordRef[] = [];
  const spans: SectionSpan[] = [];
  const effectiveOffsets = computeEffectiveOffsets(sections);
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const sectionOffset = effectiveOffsets[sIdx] ?? 0;
    const sectionPatterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    if (sectionPatterns.length === 0) continue;
    const patternOffset = new Map<string, number>();
    const blocks: BlockSpan[] = [];
    let accBeats = 0;
    for (const p of sectionPatterns) {
      patternOffset.set(p.id, accBeats);
      const len = patternPlayBeats(p);
      blocks.push({ startBeat: cursorBeat + accBeats, lengthBeats: len, beatsPerBar: p.beatsPerBar });
      accBeats += len;
    }
    const chord = (c: ChordSymbol) => (sectionOffset ? transposeChord(c, sectionOffset) : c);
    if (sec.chords.length > 0) {
      for (const sc of sec.chords) {
        const pp = sc.progressionPlacement;
        if (!pp) continue;
        const localOffset = patternOffset.get(pp.patternId);
        if (localOffset == null) continue;
        events.push({
          chord: chord(sc.chord),
          startBeat: cursorBeat + localOffset + pp.startBeat,
          lengthBeats: pp.lengthBeats,
          sectionId: sec.id,
        });
        refs.push({ patternId: pp.patternId, patternChordId: sc.id, mirrorId: sc.lyricsPlacement ? sc.id : undefined });
      }
    } else {
      // sec.chords not yet populated (e.g. duplicated section) — fall back to
      // pattern.chords so the playhead advances across all sections.
      for (const p of sectionPatterns) {
        const localOffset = patternOffset.get(p.id) ?? 0;
        for (const pc of [...p.chords].sort((a, b) => a.startBeat - b.startBeat)) {
          events.push({ chord: chord(pc.chord), startBeat: cursorBeat + localOffset + pc.startBeat, lengthBeats: pc.lengthBeats, sectionId: sec.id });
          refs.push({ patternId: p.id, patternChordId: pc.id, mirrorId: pc.mirrorId });
        }
      }
    }
    spans.push({ sectionId: sec.id, startBeat: cursorBeat, lengthBeats: accBeats, blocks });
    cursorBeat += accBeats;
  }
  if (cursorBeat <= 0) return null;
  // sec.chords is ordered by lyrics position (line → slot), which can place a
  // chord from a later block before the last chord of an earlier block.
  const order = events.map((_, i) => i).sort((a, b) => events[a].startBeat - events[b].startBeat);
  return { chords: order.map((i) => events[i]), refs: order.map((i) => refs[i]), sections: spans, loopBeats: cursorBeat };
}

// ---- Pad (chords + arpeggio) ----

const ARP_STEP_BEATS: Record<ArpRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/32": 0.125,
};
const BASS_STEP_BEATS: Record<BassRepeat, number> = {
  "1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25,
};
const TRIPLET_SUBDIVS = new Set<ArpRepeat>(["1/8", "1/16", "1/32"]);

/** Notes are pre-sorted low→high. Turnarounds drop the repeated endpoints. */
function buildStepNotes(notes: number[], pattern: ArpSettings["pattern"]): number[] {
  const sorted = [...notes].sort((a, b) => a - b);
  switch (pattern) {
    case "desc": return [...sorted].reverse();
    case "ascDesc": return sorted.length < 2 ? sorted : [...sorted, ...sorted.slice(1, -1).reverse()];
    case "descAsc": {
      if (sorted.length < 2) return sorted;
      const desc = [...sorted].reverse();
      return [...desc, ...desc.slice(1, -1).reverse()];
    }
    default: return sorted;
  }
}

/**
 * DAW-convention swing: 0.5 = straight; up to 0.75 delays the off-beat step
 * of each pair by up to a third of a step (full triplet swing).
 */
function swingDelay(stepIndex: number, step: number, swing: number): number {
  if (stepIndex % 2 === 0) return 0;
  const s = Math.max(0.5, Math.min(0.75, swing));
  return ((s - 0.5) / 0.5) * (step / 3);
}

/** Deterministic 0..1 from an integer seed, so re-rendering a loop doesn't re-roll it. */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Repeat `fn` every `step` beats across [start, start + len), clipping the last step. */
function eachStep(start: number, len: number, step: number, fn: (at: number, len: number, i: number) => void) {
  let i = 0;
  for (let t = 0; t < len - 1e-4; t += step, i++) fn(start + t, Math.min(step, len - t), i);
}

export interface PadSettings {
  arp: ArpSettings;
  /** False = hold block chords for the section regardless of the arp. */
  armed: boolean;
  octave: number;
}

/** The chord part for one chord: held, re-struck or arpeggiated, plus the arp's bass note. */
export function padNotes(ev: ChordEvent, pad: PadSettings, meter: Meter): PlayNote[] {
  const out: PlayNote[] = [];
  const octave = ev.chord.octave ?? pad.octave;
  const all = chordToMidi(ev.chord, octave);
  const { startBeat: start, lengthBeats: len } = ev;
  if (!pad.armed) {
    const velocity = Math.min(1, 1.4 / Math.sqrt(all.length));
    for (const midi of all) out.push({ part: "pad", midi, startBeat: start, lengthBeats: len, velocity });
    return out;
  }
  const { arp } = pad;
  const hasSlashBass = !!ev.chord.bass;
  // chordToMidi puts the slash bass at notes[0], an octave below.
  let melody = hasSlashBass ? all.slice(1) : all;
  const root = melody[0];
  let bass: number | null = null;
  if (hasSlashBass) bass = all[0];
  else if (arp.bassMode === "bass" || arp.bassMode === "bassArp") {
    bass = root - 12;
    if (arp.bassMode === "bass") melody = melody.filter((m) => m !== root);
  }

  if (bass != null) {
    const key: BassRepeat = hasSlashBass && arp.bassMode === "off" ? "1" : arp.bassRepeat;
    eachStep(start, len, BASS_STEP_BEATS[key], (at, l) => {
      out.push({ part: "pad", midi: bass!, startBeat: at, lengthBeats: l, velocity: 0.95 });
    });
  }
  if (melody.length === 0) return out;

  const triplet = (meter.beatsPerBar === 3 && meter.beatUnit === 4) || (meter.beatsPerBar === 6 && meter.beatUnit === 8);
  const step = ARP_STEP_BEATS[arp.repeat] * (triplet && TRIPLET_SUBDIVS.has(arp.repeat) ? 2 / 3 : 1);
  const velocity = Math.min(1, 1.4 / Math.sqrt(melody.length));
  const end = start + len;
  const swung = (at: number, i: number) => at + swingDelay(i, step, arp.swing);

  if (arp.pattern === "all") {
    eachStep(start, len, step, (at, _l, i) => {
      const s = swung(at, i);
      if (s >= end) return;
      const l = Math.min(end, s + step) - s;
      for (const midi of melody) out.push({ part: "pad", midi, startBeat: s, lengthBeats: l, velocity });
    });
    return out;
  }

  const steps = buildStepNotes(melody, arp.pattern);
  let prevPick = -1;
  eachStep(start, len, step, (at, _l, i) => {
    const s = swung(at, i);
    if (s >= end) return;
    let midi: number;
    if (arp.pattern === "random") {
      let pick = Math.floor(rand(Math.round(start * 960) * 131 + i) * steps.length);
      if (steps.length > 1 && pick === prevPick) pick = (pick + 1) % steps.length;
      prevPick = pick;
      midi = steps[pick];
    } else {
      midi = steps[i % steps.length];
    }
    out.push({ part: "pad", midi, startBeat: s, lengthBeats: Math.min(end, s + step) - s, velocity });
  });
  return out;
}

// ---- Click ----

/** One click per beat, accented on the first beat of each bar of each block. */
function clickNotes(arr: Arrangement | null, loopBeats: number, meter: Meter): PlayNote[] {
  const out: PlayNote[] = [];
  const blocks = arr?.sections.flatMap((s) => s.blocks) ?? [];
  const spans = blocks.length ? blocks : [{ startBeat: 0, lengthBeats: loopBeats, beatsPerBar: meter.beatsPerBar }];
  for (const b of spans) {
    for (let k = 0; k < b.lengthBeats - 1e-6; k++) {
      const accent = k % Math.max(1, b.beatsPerBar) === 0;
      out.push({ part: "click", midi: accent ? 1 : 0, startBeat: b.startBeat + k, lengthBeats: 0, velocity: accent ? 0.9 : 0.6 });
    }
  }
  return out;
}

// ---- Rendering ----

export interface RenderSettings {
  pad: (sectionId?: string) => PadSettings;
  meter: Meter;
  click: boolean;
}

/** Every note the loop plays. `loopBeats` may exceed the arrangement (audio-only playback). */
export function renderTrack(arr: Arrangement | null, loopBeats: number, s: RenderSettings): Track {
  const notes: PlayNote[] = [];
  for (const ev of arr?.chords ?? []) notes.push(...padNotes(ev, s.pad(ev.sectionId), s.meter));
  if (s.click) notes.push(...clickNotes(arr, loopBeats, s.meter));
  notes.sort((a, b) => a.startBeat - b.startBeat);
  return {
    notes,
    chordStarts: (arr?.chords ?? []).map((c, index) => ({ beat: c.startBeat, index })),
    loopBeats,
  };
}

/** Absolute beat `abs` is at (unwrapped) loop position `local`. */
export interface Epoch {
  abs: number;
  local: number;
}

export interface WindowEvents {
  notes: { note: PlayNote; abs: number }[];
  chords: { index: number; abs: number }[];
  /** Without looping: the absolute beat where the track ends, once the window reaches it. */
  endAbs: number | null;
}

/**
 * Everything starting in absolute beats [from, to), with the loop unrolled.
 * Consecutive windows never repeat or skip a note.
 */
export function windowEvents(track: Track, from: number, to: number, epoch: Epoch, loop: boolean): WindowEvents {
  const out: WindowEvents = { notes: [], chords: [], endAbs: null };
  const L = track.loopBeats;
  if (to <= from || L <= 0) return out;
  const lFrom = epoch.local + (from - epoch.abs);
  let lTo = epoch.local + (to - epoch.abs);
  if (!loop && lTo >= L) {
    lTo = L;
    out.endAbs = L - epoch.local + epoch.abs;
  }
  for (let k = Math.floor(lFrom / L); k * L < lTo; k++) {
    const s = Math.max(lFrom, k * L) - k * L;
    const e = Math.min(lTo, (k + 1) * L) - k * L;
    const shift = k * L - epoch.local + epoch.abs;
    const { notes, chordStarts } = track;
    for (let i = lowerBound(notes, s, (n) => n.startBeat); i < notes.length && notes[i].startBeat < e; i++) {
      out.notes.push({ note: notes[i], abs: notes[i].startBeat + shift });
    }
    for (let i = lowerBound(chordStarts, s, (c) => c.beat); i < chordStarts.length && chordStarts[i].beat < e; i++) {
      out.chords.push({ index: chordStarts[i].index, abs: chordStarts[i].beat + shift });
    }
  }
  return out;
}

/** First index in a list sorted by `key` whose key is ≥ `x`. */
export function lowerBound<T>(list: T[], x: number, key: (t: T) => number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}
