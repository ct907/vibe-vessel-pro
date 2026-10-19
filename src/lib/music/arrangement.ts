// What plays when: the song laid out in beats, and the notes each part plays.
//
// Pure functions only (no Web Audio, no stores), so the scheduler in audio.ts
// can ask for any window of notes and the same output is unit-testable.

import { chordToMidi, rootToPc, transposeChord, type ChordSymbol } from "./chords";
import { computeEffectiveOffsets } from "./keyChange";
import { patternPlayBeats, type PatternBlock, type Section } from "@/store/song";
import type { ArpRepeat, ArpSettings, BassRepeat, BassSettings, DrumSettings } from "@/store/sound";
import { DRUM_LANES, grooveLanes, stepsPerBar, type DrumLane } from "./grooves";

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

export type PlayPart = "pad" | "bass" | "drums" | "click";

export interface PlayNote {
  part: PlayPart;
  /** MIDI note; for drums, the lane's index in DRUM_LANES; for the click, 1 = accent. */
  midi: number;
  startBeat: number;
  lengthBeats: number;
  velocity: number;
  /** The pad preset, bass sound or drum kit (sections can each have their own). */
  sound?: string;
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
  /** The preset, carried on each note. */
  preset?: string;
  octave: number;
  /** The Bass part is playing, so it takes the slash-chord bass note. */
  bassOn: boolean;
}

/** The chord part for one chord: held, re-struck or arpeggiated. */
export function padNotes(ev: ChordEvent, pad: PadSettings, meter: Meter): PlayNote[] {
  const out: PlayNote[] = [];
  const octave = ev.chord.octave ?? pad.octave;
  // chordToMidi puts a slash bass at notes[0], an octave below.
  const all = chordToMidi(ev.chord, octave);
  const slash = ev.chord.bass ? all[0] : null;
  const chord = slash != null && pad.bassOn ? all.slice(1) : all;
  const { startBeat: start, lengthBeats: len } = ev;
  const sound = pad.preset;
  const { arp } = pad;
  if (arp.pattern === "hold") {
    const velocity = Math.min(1, 1.4 / Math.sqrt(chord.length));
    for (const midi of chord) out.push({ part: "pad", midi, startBeat: start, lengthBeats: len, velocity, sound });
    return out;
  }
  const melody = slash != null ? all.slice(1) : all;
  // Without a Bass part the slash note is struck once a bar under the arp.
  if (slash != null && !pad.bassOn) {
    eachStep(start, len, 4, (at, l) => out.push({ part: "pad", midi: slash, startBeat: at, lengthBeats: l, velocity: 0.95, sound }));
  }

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
      for (const midi of melody) out.push({ part: "pad", midi, startBeat: s, lengthBeats: l, velocity, sound });
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
    out.push({ part: "pad", midi, startBeat: s, lengthBeats: Math.min(end, s + step) - s, velocity, sound });
  });
  return out;
}

// ---- Bass ----

/** The bass register, A1–G#2: low enough to sit under the pad, high enough for phone speakers. */
export function bassMidi(name: string): number {
  return 33 + ((rootToPc(name) - 9 + 12) % 12);
}

/**
 * One chord's bass line. `next` is the chord after it, for the walk-in;
 * `kicks` are the drum groove's kick beats, for Follow the kick.
 */
export function bassNotes(ev: ChordEvent, next: ChordEvent | undefined, bass: BassSettings, kicks: number[] = []): PlayNote[] {
  const root = bassMidi(ev.chord.bass ?? ev.chord.root);
  const { startBeat: start, lengthBeats: len } = ev;
  const sound = bass.sound;
  if (bass.pattern === "hold") return [{ part: "bass", midi: root, startBeat: start, lengthBeats: len, velocity: 0.95, sound }];
  if (bass.pattern === "followKick") {
    const end = start + len;
    const at = kicks.filter((b) => b > start + 1e-6 && b < end - 1e-6);
    // Always land on the chord change, kick or not.
    at.unshift(start);
    return at.map((b, i) => ({
      part: "bass", midi: root, startBeat: b, lengthBeats: (at[i + 1] ?? end) - b, velocity: i === 0 ? 0.95 : 0.85, sound,
    }));
  }
  const fifth = root + 7 <= 47 ? root + 7 : root - 5;
  const target = next ? bassMidi(next.chord.bass ?? next.chord.root) : root;
  const step = BASS_STEP_BEATS[bass.rate];
  const count = Math.ceil(len / step - 1e-4);
  const out: PlayNote[] = [];
  eachStep(start, len, step, (at, l, i) => {
    let midi = root;
    if (bass.pattern === "rootFifth" && i % 2 === 1) midi = fifth;
    else if (bass.pattern === "octave" && i % 2 === 1) midi = root + 12;
    else if (bass.pattern === "approach" && i === count - 1 && count > 1 && target !== root) {
      midi = target > root ? target - 1 : target + 1;
    }
    out.push({ part: "bass", midi, startBeat: at, lengthBeats: l, velocity: i === 0 ? 0.95 : 0.82, sound });
  });
  return out;
}

// ---- Drums ----

/** Energy → how close together the notes are: 1 = half notes … 4 = sixteenths (from 75%). */
export function drumDensity(d: DrumSettings): number {
  return d.density ?? 1 + Math.min(3, Math.floor(Math.max(0, d.energy) * 4));
}

/** Energy → how hard the hits are, 0..1. */
export function drumVelocity(d: DrumSettings): number {
  return d.velocity ?? d.energy;
}

const LEVEL_VELOCITY = [0, 1, 0.85, 0.7, 0.5];

/** -0.5 → +0.5 across the section for a build (one density step each way), the reverse for a fade. */
function shapeAt(shape: string | undefined, t: number): number {
  if (shape === "build") return t - 0.5;
  if (shape === "fade") return 0.5 - t;
  return 0;
}

/** Every drum hit in a section. Bars restart at each block; a cropped block stops early. */
export function drumHits(span: SectionSpan, d: DrumSettings, meter: Meter): PlayNote[] {
  const out: PlayNote[] = [];
  const stepBeats = meter.beatUnit / 16;
  const density = drumDensity(d);
  const velocity = drumVelocity(d);
  const groove = grooveLanes(d.genre, meter.beatsPerBar, meter.beatUnit);
  const lanes = d.custom ?? groove.lanes;
  const swing = groove.swing;
  for (const block of span.blocks) {
    const perBar = stepsPerBar(block.beatsPerBar, meter.beatUnit);
    const blockEnd = block.startBeat + block.lengthBeats;
    for (const lane of DRUM_LANES) {
      const pattern = lanes[lane];
      if (!pattern) continue;
      const laneIdx = DRUM_LANES.indexOf(lane);
      const energy = d.lanes?.[lane];
      for (let step = 0; ; step++) {
        const beat = block.startBeat + step * stepBeats;
        if (beat >= blockEnd - 1e-6) break;
        const level = Number(pattern[step % pattern.length]) || 0;
        if (!level) continue;
        const t = span.lengthBeats > 0 ? (beat - span.startBeat) / span.lengthBeats : 0;
        const shift = (energy?.offset ?? 0) + shapeAt(energy?.shape, t);
        const laneDensity = Math.max(0, Math.min(4, density + Math.round(shift * 2)));
        if (level > laneDensity) continue;
        const laneVelocity = Math.max(0, Math.min(1, velocity + shift * 0.4));
        const inBar = step % perBar;
        let at = beat;
        if (swing?.unit === 16 && inBar % 2 === 1) at += swing.amount * stepBeats;
        if (swing?.unit === 8 && inBar % 4 === 2) at += swing.amount * 2 * stepBeats;
        const human = 1 + (rand(Math.round(beat * 960) * 17 + laneIdx) - 0.5) * 0.08;
        out.push({
          part: "drums",
          midi: laneIdx,
          startBeat: at,
          lengthBeats: 0,
          velocity: Math.min(1, LEVEL_VELOCITY[level] * (0.45 + 0.55 * laneVelocity) * (inBar === 0 ? 1 : 0.92) * human),
          sound: d.kit,
        });
      }
    }
  }
  // Mark each new section with a crash once the groove is busy enough.
  if (density >= 3 && !lanes.crash && span.lengthBeats > 0) {
    out.push({ part: "drums", midi: DRUM_LANES.indexOf("crash"), startBeat: span.startBeat, lengthBeats: 0, velocity: 0.45 + 0.4 * velocity, sound: d.kit });
  }
  return out;
}

export const laneOf = (n: PlayNote): DrumLane => DRUM_LANES[n.midi];

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
  /** Null = the Pad is off (for that section). */
  pad: (sectionId?: string) => PadSettings | null;
  bass: (sectionId?: string) => BassSettings | null;
  /** The groove is needed even when the Drums are off: the bass can follow its kick. */
  drums: (sectionId: string) => { settings: DrumSettings; on: boolean };
  meter: Meter;
  click: boolean;
}

/** Every note the loop plays. `loopBeats` may exceed the arrangement (audio-only playback). */
export function renderTrack(arr: Arrangement | null, loopBeats: number, s: RenderSettings): Track {
  const notes: PlayNote[] = [];
  const chords = arr?.chords ?? [];
  const kickLane = DRUM_LANES.indexOf("kick");
  const kicks: number[] = [];
  for (const span of arr?.sections ?? []) {
    const { settings, on } = s.drums(span.sectionId);
    const hits = drumHits(span, settings, s.meter);
    if (on) notes.push(...hits);
    for (const h of hits) if (h.midi === kickLane) kicks.push(h.startBeat);
  }
  kicks.sort((a, b) => a - b);
  chords.forEach((ev, i) => {
    const pad = s.pad(ev.sectionId);
    if (pad) notes.push(...padNotes(ev, pad, s.meter));
    const bass = s.bass(ev.sectionId);
    if (bass) notes.push(...bassNotes(ev, chords[i + 1] ?? chords[0], bass, kicks));
  });
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
