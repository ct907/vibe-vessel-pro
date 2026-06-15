// MIDI type-1 file builder for chord export.
// Produces a 2-track file: tempo/time-sig on track 0, chord notes on track 1.

import { chordToMidi, transposeChord } from "@/lib/music/chords";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { patternPlayBeats } from "@/store/song";
import type { Section, PatternBlock, SongState } from "@/store/song";

const TICKS = 480; // ticks per quarter note

// ── binary helpers ────────────────────────────────────────────────────────────

function u16(v: number): number[] {
  return [(v >> 8) & 0xFF, v & 0xFF];
}
function u32(v: number): number[] {
  return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
}
function varLen(v: number): number[] {
  const out: number[] = [v & 0x7F];
  v >>>= 7;
  while (v > 0) { out.unshift((v & 0x7F) | 0x80); v >>>= 7; }
  return out;
}

function metaEvent(delta: number, type: number, data: number[]): number[] {
  return [...varLen(delta), 0xFF, type, ...varLen(data.length), ...data];
}

function track(events: number[]): number[] {
  return [0x4D, 0x54, 0x72, 0x6B, ...u32(events.length), ...events];
}

// ── chord collection (mirrors TransportHeader buildPlayback, no rotation) ─────

interface MidiEvent {
  tick: number;
  data: number[];
}

export function buildMidiBytes(
  sections: Section[],
  progression: PatternBlock[],
  meta: SongState["meta"],
): Uint8Array {
  const bpm = meta.bpm;
  const beatsPerBar = meta.beatsPerBar;
  const beatUnit = meta.beatUnit;
  const offsets = computeEffectiveOffsets(sections);

  // ── track 0: tempo + time-sig ─────────────────────────────────────────────
  const uSecPerBeat = Math.round(60_000_000 / bpm);
  const denomPow = Math.round(Math.log2(beatUnit));

  const tempoTrackEvents: number[] = [
    ...metaEvent(0, 0x51, [(uSecPerBeat >> 16) & 0xFF, (uSecPerBeat >> 8) & 0xFF, uSecPerBeat & 0xFF]),
    ...metaEvent(0, 0x58, [beatsPerBar, denomPow, 24, 8]),
    ...metaEvent(0, 0x2F, []),
  ];

  // ── track 1: chord notes ──────────────────────────────────────────────────
  const rawEvents: MidiEvent[] = [];

  let cursorBeat = 0;
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const sectionOffset = offsets[sIdx] ?? 0;
    const sectionPatterns = progression.filter(
      (p) => (p.sectionId ?? p.id) === sec.id,
    );
    if (sectionPatterns.length === 0) continue;

    const patternOffset = new Map<string, number>();
    let accBeats = 0;
    for (const p of sectionPatterns) {
      patternOffset.set(p.id, accBeats);
      accBeats += patternPlayBeats(p);
    }

    const chordList = sec.chords.length > 0
      ? sec.chords
          .filter((sc) => sc.progressionPlacement)
          .map((sc) => ({
            chord: sectionOffset ? transposeChord(sc.chord, sectionOffset) : sc.chord,
            startBeat: cursorBeat + (patternOffset.get(sc.progressionPlacement!.patternId) ?? 0) + sc.progressionPlacement!.startBeat,
            lengthBeats: sc.progressionPlacement!.lengthBeats,
          }))
      : sectionPatterns.flatMap((p) =>
          [...p.chords]
            .sort((a, b) => a.startBeat - b.startBeat)
            .map((pc) => ({
              chord: sectionOffset ? transposeChord(pc.chord, sectionOffset) : pc.chord,
              startBeat: cursorBeat + (patternOffset.get(p.id) ?? 0) + pc.startBeat,
              lengthBeats: pc.lengthBeats,
            })),
        );

    for (const ev of chordList) {
      const notes = chordToMidi(ev.chord, ev.chord.octave ?? 4);
      const onTick = Math.round(ev.startBeat * TICKS);
      const offTick = Math.round((ev.startBeat + ev.lengthBeats) * TICKS);
      for (const note of notes) {
        rawEvents.push({ tick: onTick,  data: [0x90, note, 80] }); // note on, ch 1
        rawEvents.push({ tick: offTick, data: [0x80, note, 0] });  // note off, ch 1
      }
    }

    cursorBeat += accBeats;
  }

  // Sort by tick, with note-off before note-on at the same tick.
  rawEvents.sort((a, b) =>
    a.tick !== b.tick ? a.tick - b.tick : (a.data[0] & 0xF0) - (b.data[0] & 0xF0),
  );

  const chordTrackEvents: number[] = [];
  let prevTick = 0;
  for (const ev of rawEvents) {
    const delta = ev.tick - prevTick;
    chordTrackEvents.push(...varLen(delta), ...ev.data);
    prevTick = ev.tick;
  }
  chordTrackEvents.push(...metaEvent(0, 0x2F, []));

  // ── assemble SMF ─────────────────────────────────────────────────────────
  const header = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    ...u32(6),               // header length
    ...u16(1),               // format 1
    ...u16(2),               // 2 tracks
    ...u16(TICKS),           // ticks per quarter note
  ];
  const bytes = [
    ...header,
    ...track(tempoTrackEvents),
    ...track(chordTrackEvents),
  ];
  return new Uint8Array(bytes);
}

export function downloadMidi(
  sections: Section[],
  progression: PatternBlock[],
  meta: SongState["meta"],
): void {
  const bytes = buildMidiBytes(sections, progression, meta);
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.title || "song"}.mid`;
  a.click();
  URL.revokeObjectURL(url);
}
