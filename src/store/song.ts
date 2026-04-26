import { create } from "zustand";
import { nanoid } from "nanoid";
import { ChordSymbol, transposeChord, transposeKey, Mode } from "@/lib/music/chords";
import { useSoundStore, type SoundSettings } from "@/store/sound";
import { getDefaults } from "@/store/defaults";

// ---------- Types ----------

/** Number of fixed equal-width slots in a chord row. */
export const CHORD_ROW_SLOTS = 80;

export interface ChordAnchor {
  id: string;
  /** Legacy: character offset within the lyric line (kept for migration). */
  offset: number;
  /** Legacy: column position in the chord row (in monospace cells). Now used only as a fallback ordering hint. */
  chordCol?: number;
  /** Legacy: index of the lyric word this chord is bound to. Used by Format Chords + migration. */
  wordIndex?: number;
  /** Canonical position: 0..CHORD_ROW_SLOTS-1. The chord row is a fixed grid of equal slots. */
  slotIndex?: number;
  chord: ChordSymbol;
  /** Optional: id of the corresponding pattern chord this is mirrored to. */
  mirrorId?: string;
}

export interface LyricLine {
  id: string;
  text: string;
  chords: ChordAnchor[];
  /** Legacy: number of cursor cells in the chord row. Unused by the new word-anchored renderer. */
  chordRowLen?: number;
}

export type SectionType = "verse" | "chorus" | "bridge" | "intro" | "outro" | "pre-chorus" | "custom";

/**
 * Per-view placement metadata for a {@link SectionChord}. Free-form: NO
 * spacing rule is enforced. `slotIndex` is just an integer ordering hint
 * within a chord row in the lyrics view (any value, can be sparse).
 */
export interface LyricsPlacement {
  lineId: string;
  slotIndex: number;
}

/** Per-view placement metadata for a {@link SectionChord} in the progression view. */
export interface ProgressionPlacement {
  patternId: string;
  startBeat: number;
  lengthBeats: number;
}

/**
 * SSOT chord record for a section. The section's `chords` array is the
 * canonical list — chord **type** (`chord`) and **relative order** within
 * this array are what's synchronized across the lyrics and progression
 * views. Per-view position metadata (`lyricsPlacement`, `progressionPlacement`)
 * is independent and free-form.
 *
 * Phase 1: this is a DERIVED projection rebuilt from the existing
 * `line.chords` / `pattern.chords` mirrors after every mutation. Later
 * phases invert the flow.
 */
export interface SectionChord {
  id: string;
  chord: ChordSymbol;
  lyricsPlacement?: LyricsPlacement;
  progressionPlacement?: ProgressionPlacement;
}

export interface Section {
  id: string;
  label: string;
  type: SectionType;
  collapsed: boolean;
  lines: LyricLine[];
  /**
   * SSOT chord projection for this section. Phase 1: derived from mirrors
   * after every mutation. Do NOT mutate directly yet — write to
   * `line.chords` / `pattern.chords` and the projection will refresh.
   */
  chords: SectionChord[];
  /** Optional notes/comment for this section. */
  comment?: string;
  /** Optional color swatch key (matches SECTION_COLOR_KEYS). Synced lyrics ↔ progressions. */
  color?: string | null;
}

export interface PatternChord {
  id: string;
  chord: ChordSymbol;
  /** start beat within the pattern */
  startBeat: number;
  /** length in beats */
  lengthBeats: number;
  /** Optional: id of the corresponding lyric chord anchor this mirrors. */
  mirrorId?: string;
}

export interface PatternBlock {
  id: string;
  /** Owning section's id. Optional for legacy data — defaults to `id`. */
  sectionId?: string;
  label: string;
  bars: number;
  beatsPerBar: number;
  chords: PatternChord[];
}

export interface BasketItem {
  id: string;
  chord: ChordSymbol;
}

export interface SongState {
  meta: {
    title: string;
    keyRoot: string;
    keyMode: Mode;
    bpm: number;
    /** Time signature numerator (beats per bar). Default 4. */
    beatsPerBar: number;
    /** Time signature denominator (beat unit). Default 4. */
    beatUnit: number;
  };
  sections: Section[];
  basket: BasketItem[];
  progression: PatternBlock[];
  /** When true, cross-tab delete confirmation dialogs are suppressed. */
  suppressCrossTabDeleteWarning: boolean;
  setSuppressCrossTabDeleteWarning: (v: boolean) => void;

  // ---- meta ----
  setTitle: (t: string) => void;
  setKey: (root: string, mode: Mode) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (beatsPerBar: number, beatUnit: number) => void;
  transposeSong: (semitones: number) => void;

  // ---- sections ----
  addSection: (type?: SectionType, label?: string) => string;
  updateSection: (id: string, patch: Partial<Pick<Section, "label" | "type" | "collapsed" | "comment">>) => void;
  removeSection: (id: string) => void;
  duplicateSection: (id: string) => string | null;
  moveSection: (id: string, direction: -1 | 1) => void;
  reorderSection: (id: string, toIndex: number) => void;
  toggleSectionCollapsed: (id: string) => void;
  setAllSectionsCollapsed: (collapsed: boolean) => void;
  setSectionComment: (id: string, comment: string) => void;
  setSectionColor: (id: string, color: string | null) => void;
  /** Wipe all song state and replace with a single empty verse section (factory reset). */
  resetSong: () => void;

  // ---- lyrics (line-level) ----
  addLine: (sectionId: string, afterId?: string) => string;
  removeLine: (sectionId: string, id: string) => void;
  setLineText: (sectionId: string, id: string, text: string) => void;
  setChordRowLen: (sectionId: string, id: string, len: number) => void;
  insertChordSpaceAt: (sectionId: string, lineId: string, col: number) => void;
  removeChordCellAt: (sectionId: string, lineId: string, col: number) => boolean;
  upsertChordAt: (sectionId: string, lineId: string, col: number, chord: ChordSymbol, anchorId?: string) => void;
  removeChordAnchor: (sectionId: string, lineId: string, anchorId: string) => void;
  removeChordAnchorsBatch: (sectionId: string, lineId: string, anchorIds: string[]) => void;
  shiftChordAnchors: (sectionId: string, lineId: string, anchorIds: string[], deltaCols: number) => void;
  moveSelectedChordsByOrder: (sectionId: string, lineId: string, anchorIds: string[], direction: -1 | 1) => void;
  moveChordAnchor: (
    fromSectionId: string, fromLineId: string, anchorId: string,
    toSectionId: string, toLineId: string, toCol: number,
  ) => void;
  moveSelectedChordsTo: (
    fromSectionId: string, fromLineId: string,
    toSectionId: string, toLineId: string, toCol: number,
    anchorIds: string[],
  ) => void;
  pasteChordsAt: (
    sectionId: string, lineId: string, atCol: number,
    chords: { chord: ChordSymbol; relCol: number; widthCh: number }[],
  ) => void;
  /** Word-anchored: insert a chord bound to the word nearest `nearWordIndex` (skipping occupied words to the right). */
  upsertChordAtWord: (
    sectionId: string, lineId: string, nearWordIndex: number, chord: ChordSymbol, anchorId?: string,
  ) => void;
  /** Append a chord to the end of a line (used when the line has no words yet). */
  appendChordToLine: (sectionId: string, lineId: string, chord: ChordSymbol, anchorId?: string) => void;
  /** Snap each chord in a line to the closest unused word, preserving overall order. */
  formatChordsInLine: (sectionId: string, lineId: string) => void;
  /** Run formatChordsInLine on every line of every section. */
  formatChordsInSong: () => void;
  /** Re-bind a chord's word slot by ±1, swapping with the chord at the target slot if any. */
  moveChordWordSlot: (sectionId: string, lineId: string, anchorId: string, direction: -1 | 1) => void;
  /** Place a new chord into a specific slot. If occupied, walk right (then left) to nearest free slot. */
  placeChordInSlot: (sectionId: string, lineId: string, slotIndex: number, chord: ChordSymbol) => void;
  /** Move an existing anchor to a slot in the same row. Swap with occupant if any. */
  moveChordToSlot: (sectionId: string, lineId: string, anchorId: string, slotIndex: number) => void;
  /** Move a set of anchors to a different row, starting at dropSlot, pushing collisions right. */
  moveChordsAcrossLines: (
    fromSectionId: string, fromLineId: string,
    toSectionId: string, toLineId: string,
    anchorIds: string[], dropSlot: number,
  ) => void;

  // ---- basket ----
  addToBasket: (chords: ChordSymbol[]) => void;
  removeFromBasket: (id: string) => void;
  clearBasket: () => void;

  // ---- progression (binding-aware) ----
  updatePattern: (id: string, patch: Partial<Pick<PatternBlock, "bars" | "beatsPerBar">>) => void;
  addChordToPattern: (patternId: string, chord: ChordSymbol, atBeat: number, lengthBeats?: number) => void;
  updatePatternChord: (patternId: string, chordId: string, patch: Partial<Omit<PatternChord, "id" | "mirrorId">>) => void;
  removePatternChord: (patternId: string, chordId: string) => void;
  movePatternChord: (patternId: string, chordId: string, direction: -1 | 1) => void;
  removePatternChordsBatch: (patternId: string, chordIds: string[]) => void;
  shiftPatternChords: (patternId: string, chordIds: string[], deltaBeats: number) => void;
  movePatternChordsTo: (fromPatternId: string, toPatternId: string, chordIds: string[]) => void;
  setPatternChordLength: (patternId: string, chordId: string, lengthBeats: number) => void;
  /**
   * Grow or shrink one or more chords' lengths by `deltaBeats` each. If the new
   * total exceeds the pattern's capacity, the rightmost chords overflow into the
   * next pattern block in the same section (creating room by pushing existing
   * chords right and cascading overflow further down if needed).
   */
  resizePatternChordsWithOverflow: (patternId: string, chordIds: string[], deltaBeats: number) => void;
  reorderPatternChord: (patternId: string, chordId: string, toIndex: number) => void;
  movePatternChordToPatternAt: (fromPatternId: string, toPatternId: string, chordId: string, toIndex: number) => void;
  /** Slot-based: reorder a chord (or group of chords preserving relative order) to a target slot index in the same pattern. */
  movePatternChordToSlot: (patternId: string, chordId: string, slotIndex: number) => void;
  movePatternChordsToSlot: (patternId: string, chordIds: string[], slotIndex: number) => void;
  /** Slot-based: insert a brand-new chord into a specific slot (left-packed). */
  addChordToPatternSlot: (patternId: string, chord: ChordSymbol, slotIndex: number) => void;
  /** Append a fresh empty pattern block to a section. Returns its id. */
  addPatternToSection: (sectionId: string) => string;
  /** Remove a single pattern block. No-op if it's the only block in its section. */
  removePatternBlock: (patternId: string) => void;
  /** Replace a pattern's chords (used for variation suggestions). Lengths preserved. */
  replacePatternChords: (patternId: string, chords: ChordSymbol[]) => void;

  // ---- chord-row undo/redo ----
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- persistence ----
  loadFromJSON: (data: unknown) => void;
  toJSON: () => SerializedSong;
}

export interface SerializedSong {
  /** v2 = legacy mirror-only. v3 = SectionChord projection persisted alongside mirrors. */
  version: 2 | 3;
  meta: SongState["meta"];
  sections: Section[];
  progression: PatternBlock[];
  suppressCrossTabDeleteWarning?: boolean;
  sound?: SoundSettings;
}

// ---------- Factories ----------

const initialLine = (): LyricLine => ({ id: nanoid(), text: "", chords: [] });

const SECTION_DEFAULT_LABEL: Record<SectionType, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  intro: "Intro",
  outro: "Outro",
  "pre-chorus": "Pre-Chorus",
  custom: "Section",
};

function makeSection(type: SectionType = "verse", label?: string): { section: Section; pattern: PatternBlock } {
  const id = nanoid();
  const finalLabel = label ?? SECTION_DEFAULT_LABEL[type];
  const bars = getDefaults().defaultPatternBars;
  return {
    section: {
      id,
      type,
      label: finalLabel,
      collapsed: false,
      lines: [initialLine()],
      chords: [],
    },
    pattern: {
      id,
      sectionId: id,
      label: finalLabel,
      bars,
      beatsPerBar: 4,
      chords: [],
    },
  };
}

// ---------- Display helpers ----------
/**
 * Compute display name for a section based on its position among sections of
 * the same type. Custom sections use their user-set label as-is.
 *  - First Verse → "Verse"
 *  - Second Verse → "Verse 2"
 *  - Third Verse → "Verse 3"
 */
export function getSectionDisplayName(sections: Section[], sectionId: string): string {
  const sec = sections.find((s) => s.id === sectionId);
  if (!sec) return "";
  if (sec.type === "custom") return sec.label || "Section";
  if (sec.type === "intro" || sec.type === "outro") return SECTION_DEFAULT_LABEL[sec.type];
  const sameType = sections.filter((s) => s.type === sec.type);
  const idx = sameType.findIndex((s) => s.id === sectionId);
  const base = SECTION_DEFAULT_LABEL[sec.type];
  // Always number verse/chorus/bridge/pre-chorus starting at 1
  return `${base} ${idx + 1}`;
}

// ---------- Word-anchor helpers ----------
/** Words in a lyric line, with their character-offset start position. */
export function getWords(text: string): { index: number; start: number; end: number; text: string }[] {
  const out: { index: number; start: number; end: number; text: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({ index: idx, start: m.index, end: m.index + m[0].length, text: m[0] });
    idx++;
  }
  return out;
}

/** Sort anchors for left-to-right display: bound chords by wordIndex, floating by chordCol. */
function sortAnchors(chords: ChordAnchor[]): ChordAnchor[] {
  return [...chords].sort((a, b) => {
    const aw = a.wordIndex ?? Number.POSITIVE_INFINITY;
    const bw = b.wordIndex ?? Number.POSITIVE_INFINITY;
    if (aw !== bw) return aw - bw;
    const ac = a.chordCol ?? a.offset ?? 0;
    const bc = b.chordCol ?? b.offset ?? 0;
    return ac - bc;
  });
}

/**
 * Snap each chord in a line to a unique word slot, in the chord's existing
 * left-to-right order. Leftover chords stay floating (wordIndex undefined).
 */
function snapLineToWords(line: LyricLine): LyricLine {
  const words = getWords(line.text);
  if (!words.length) {
    const cleared = sortAnchors(line.chords).map((c, i) => ({
      ...c,
      wordIndex: undefined as number | undefined,
      chordCol: i * 4,
      offset: i * 4,
    }));
    return { ...line, chords: cleared };
  }
  const ordered = sortAnchors(line.chords);
  const used = new Set<number>();
  const result: ChordAnchor[] = [];
  for (const c of ordered) {
    let target: number | undefined;
    const desired = c.wordIndex;
    if (desired != null && desired >= 0 && desired < words.length && !used.has(desired)) {
      target = desired;
    } else {
      const probe = desired != null ? desired : result.length;
      let best: number | undefined;
      let bestDist = Infinity;
      for (let i = 0; i < words.length; i++) {
        if (used.has(i)) continue;
        const d = Math.abs(i - probe);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      target = best;
    }
    if (target == null) {
      result.push({ ...c, wordIndex: undefined });
    } else {
      used.add(target);
      result.push({ ...c, wordIndex: target, chordCol: words[target].start, offset: words[target].start });
    }
  }
  return { ...line, chords: result };
}

// ---------- Slot helpers (20-slot chord row) ----------

/** Find the nearest free slot starting from `desired`, scanning right then left. Returns -1 if all 20 are full. */
export function nearestFreeSlot(occupied: Set<number>, desired: number, total = CHORD_ROW_SLOTS): number {
  const start = Math.max(0, Math.min(total - 1, desired));
  if (!occupied.has(start)) return start;
  for (let off = 1; off < total; off++) {
    const r = start + off;
    if (r < total && !occupied.has(r)) return r;
    const l = start - off;
    if (l >= 0 && !occupied.has(l)) return l;
  }
  return -1;
}

/**
 * Find nearest free slot with empty immediate neighbors (spacing rule).
 * Prevents two chords from being placed in adjacent slots, which keeps the
 * chord row visually readable. Falls back to {@link nearestFreeSlot} if no
 * slot satisfies the spacing constraint (e.g. very dense rows).
 */
export function nearestSpacedFreeSlot(
  occupied: Set<number>,
  desired: number,
  total = CHORD_ROW_SLOTS,
): number {
  const isSpaced = (i: number) =>
    !occupied.has(i) &&
    !occupied.has(i - 1) &&
    !occupied.has(i + 1);
  const start = Math.max(0, Math.min(total - 1, desired));
  if (isSpaced(start)) return start;
  for (let off = 1; off < total; off++) {
    const r = start + off;
    if (r < total && isSpaced(r)) return r;
    const l = start - off;
    if (l >= 0 && isSpaced(l)) return l;
  }
  // No spaced slot available — fall back so the user doesn't silently lose
  // the chord on dense rows.
  return nearestFreeSlot(occupied, desired, total);
}

/** Derive a slotIndex for a legacy anchor (uses wordIndex if present, else order). */
function deriveSlotIndex(anchor: ChordAnchor, fallbackOrder: number): number {
  if (anchor.wordIndex != null) return Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, anchor.wordIndex));
  return Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, fallbackOrder));
}

/** Ensure every chord on a line has a unique slotIndex in [0, 20). Resolves collisions left-to-right. */
function ensureSlotsForLine(line: LyricLine): LyricLine {
  const ordered = [...line.chords].sort((a, b) => {
    const aw = a.slotIndex ?? a.wordIndex ?? a.chordCol ?? a.offset ?? 0;
    const bw = b.slotIndex ?? b.wordIndex ?? b.chordCol ?? b.offset ?? 0;
    return aw - bw;
  });
  const used = new Set<number>();
  const next: ChordAnchor[] = [];
  ordered.forEach((c, i) => {
    const desired = c.slotIndex != null ? c.slotIndex : deriveSlotIndex(c, i);
    const slot = nearestFreeSlot(used, desired);
    if (slot < 0) {
      // Row full → keep without slot (renderer will hide; should be rare).
      next.push({ ...c, slotIndex: undefined });
    } else {
      used.add(slot);
      next.push({ ...c, slotIndex: slot });
    }
  });
  return { ...line, chords: next };
}

// ---------- Sync helpers ----------
// Find the next free start beat in a pattern (after the last chord's end).
function nextFreeBeat(pattern: PatternBlock): number {
  if (!pattern.chords.length) return 0;
  return Math.max(...pattern.chords.map((c) => c.startBeat + c.lengthBeats));
}

/**
 * Repack chords left-aligned by current sort order; each chord starts at the
 * previous chord's end. Returns a new chords array with adjusted startBeats and
 * lengths clamped so the total never exceeds totalBeats. The chord whose length
 * pushes past the cap gets its length clamped (it doesn't bump siblings off).
 */
function repackChords(chords: PatternChord[], totalBeats: number): PatternChord[] {
  const sorted = [...chords].sort((a, b) => a.startBeat - b.startBeat);
  let cursor = 0;
  const out: PatternChord[] = [];
  for (const c of sorted) {
    if (cursor >= totalBeats) break; // no more room — drop overflow (shouldn't happen normally)
    const minLen = 0.5;
    const maxLen = totalBeats - cursor;
    const len = Math.max(minLen, Math.min(c.lengthBeats, maxLen));
    out.push({ ...c, startBeat: cursor, lengthBeats: len });
    cursor += len;
  }
  return out;
}

/** Visual-order list of anchors across all lines of a section. */
function anchorsInVisualOrder(section: Section): { lineId: string; anchor: ChordAnchor }[] {
  const out: { lineId: string; anchor: ChordAnchor }[] = [];
  section.lines.forEach((l) => {
    const sorted = [...l.chords].sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
    sorted.forEach((a) => out.push({ lineId: l.id, anchor: a }));
  });
  return out;
}

/** Get all pattern blocks belonging to a section, in their progression order. */
function getSectionPatternsArr(progression: PatternBlock[], sectionId: string): PatternBlock[] {
  return progression.filter((p) => p.sectionId === sectionId);
}

/**
 * Given an updated section, reorder the section's pattern blocks' chords so
 * their left-to-right (across-blocks) order matches the section anchors'
 * visual order. Mirrored pairs are reordered together; unmirrored pattern
 * chords remain in their original block, appended after mirrored ones.
 */
function syncPatternFromAnchors(progression: PatternBlock[], section: Section): PatternBlock[] {
  const blocks = getSectionPatternsArr(progression, section.id);
  if (!blocks.length) return progression;
  const visual = anchorsInVisualOrder(section);
  // Map mirrorId -> { block, chord }
  const pcByMirror = new Map<string, { blockId: string; chord: PatternChord }>();
  blocks.forEach((b) => b.chords.forEach((c) => pcByMirror.set(c.id, { blockId: b.id, chord: c })));

  // Group mirrored chords per block in visual order
  const mirroredPerBlock = new Map<string, PatternChord[]>();
  blocks.forEach((b) => mirroredPerBlock.set(b.id, []));
  const usedPcIds = new Set<string>();
  for (const { anchor } of visual) {
    if (anchor.mirrorId && pcByMirror.has(anchor.mirrorId)) {
      const ref = pcByMirror.get(anchor.mirrorId)!;
      mirroredPerBlock.get(ref.blockId)!.push(ref.chord);
      usedPcIds.add(anchor.mirrorId);
    }
  }
  return progression.map((p) => {
    if (p.sectionId !== section.id) return p;
    const mirrored = mirroredPerBlock.get(p.id) ?? [];
    const tail = p.chords.filter((c) => !usedPcIds.has(c.id));
    const newOrder = [...mirrored, ...tail];
    let cursor = 0;
    const reseq = newOrder.map((c) => {
      const next = { ...c, startBeat: cursor };
      cursor += c.lengthBeats;
      return next;
    });
    return { ...p, chords: repackChords(reseq, p.bars * p.beatsPerBar) };
  });
}

/**
 * Given a single updated pattern, rotate the bound section's mirrored anchor
 * contents (only those mirroring chords in this pattern) so the chords
 * displayed at each anchor slot follow the pattern's new order.
 */
function syncAnchorsFromPattern(sections: Section[], pattern: PatternBlock): Section[] {
  const section = sections.find((s) => s.id === pattern.sectionId);
  if (!section) return sections;
  const visual = anchorsInVisualOrder(section);
  const sortedPcs = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const mirroredSlots = visual.filter((v) => v.anchor.mirrorId && sortedPcs.some((c) => c.id === v.anchor.mirrorId));
  const mirroredPcs = sortedPcs.filter((c) => mirroredSlots.some((s) => s.anchor.mirrorId === c.id));
  if (mirroredSlots.length !== mirroredPcs.length) return sections;
  const replace = new Map<string, { chord: ChordSymbol; mirrorId: string }>();
  for (let i = 0; i < mirroredSlots.length; i++) {
    replace.set(mirroredSlots[i].anchor.id, { chord: mirroredPcs[i].chord, mirrorId: mirroredPcs[i].id });
  }
  return sections.map((sec) => {
    if (sec.id !== section.id) return sec;
    return {
      ...sec,
      lines: sec.lines.map((l) => ({
        ...l,
        chords: l.chords.map((a) => {
          const r = replace.get(a.id);
          return r ? { ...a, chord: r.chord, mirrorId: r.mirrorId } : a;
        }),
      })),
    };
  });
}

/**
 * Place a new chord into a section's pattern blocks. Tries each block in the
 * section in order; if none have room, appends a new continuation block to the
 * section. Returns the (possibly extended) progression and the created
 * PatternChord id + the patternId it ended up in.
 */
function placeMirroredChord(
  progression: PatternBlock[],
  sectionId: string,
  chord: ChordSymbol,
  mirrorId: string,
): { progression: PatternBlock[]; chordId: string; patternId: string } {
  const len = getDefaults().defaultChordLengthBeats;
  const sectionBlockIndices = progression
    .map((p, i) => (p.sectionId === sectionId ? i : -1))
    .filter((i) => i >= 0);
  if (!sectionBlockIndices.length) {
    return { progression, chordId: "", patternId: "" };
  }
  const findRoom = (p: PatternBlock) => {
    const start = nextFreeBeat(p);
    const total = p.bars * p.beatsPerBar;
    return total - start >= 0.5 ? Math.min(len, total - start) : 0;
  };
  const next = [...progression];
  // Try each block in order
  for (const i of sectionBlockIndices) {
    const target = next[i];
    const placedLen = findRoom(target);
    if (placedLen > 0) {
      const start = nextFreeBeat(target);
      const id = nanoid();
      const pc: PatternChord = { id, chord, startBeat: start, lengthBeats: placedLen, mirrorId };
      next[i] = {
        ...target,
        chords: [...target.chords, pc].sort((a, b) => a.startBeat - b.startBeat),
      };
      return { progression: next, chordId: id, patternId: target.id };
    }
  }
  // No room — create a new continuation block right after the last block of this section.
  const lastIdx = sectionBlockIndices[sectionBlockIndices.length - 1];
  const ref = next[lastIdx];
  const newId = nanoid();
  const newPattern: PatternBlock = {
    id: newId,
    sectionId,
    label: `${ref.label} (cont.)`,
    bars: ref.bars,
    beatsPerBar: ref.beatsPerBar,
    chords: [],
  };
  const placedLen = Math.min(len, newPattern.bars * newPattern.beatsPerBar);
  const pcId = nanoid();
  newPattern.chords = [{ id: pcId, chord, startBeat: 0, lengthBeats: placedLen, mirrorId }];
  next.splice(lastIdx + 1, 0, newPattern);
  return { progression: next, chordId: pcId, patternId: newId };
}

// ---------- SSOT projection (Phase 1) ----------
/**
 * Rebuild a section's `chords: SectionChord[]` projection from the existing
 * `line.chords` (anchors) and the section's pattern blocks. Pairing happens
 * via `mirrorId`. Order is determined by visual order of anchors first
 * (lines top-to-bottom, slots/cols left-to-right), with progression-only
 * pattern chords (no anchor mirror) appended afterward in pattern order.
 *
 * The chord type and relative order in this list are the SSOT invariant.
 * Per-view metadata (`lyricsPlacement`, `progressionPlacement`) is captured
 * but treated as free-form (no spacing rule enforced).
 */
function recomputeSectionChordsFromMirrors(
  section: Section,
  sectionPatterns: PatternBlock[],
): SectionChord[] {
  const pcByMirror = new Map<string, { patternId: string; pc: PatternChord }>();
  const pcAll: { patternId: string; pc: PatternChord }[] = [];
  sectionPatterns.forEach((p) => {
    const sortedPcs = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
    sortedPcs.forEach((pc) => {
      pcAll.push({ patternId: p.id, pc });
      if (pc.mirrorId) pcByMirror.set(pc.mirrorId, { patternId: p.id, pc });
    });
  });

  const usedPcIds = new Set<string>();
  const out: SectionChord[] = [];

  section.lines.forEach((line) => {
    const sorted = [...line.chords].sort((a, b) => {
      const as = a.slotIndex ?? a.wordIndex ?? a.chordCol ?? a.offset ?? 0;
      const bs = b.slotIndex ?? b.wordIndex ?? b.chordCol ?? b.offset ?? 0;
      return as - bs;
    });
    sorted.forEach((a) => {
      const mirror = a.mirrorId ? pcByMirror.get(a.mirrorId) : undefined;
      if (mirror) usedPcIds.add(mirror.pc.id);
      out.push({
        id: a.id,
        chord: a.chord,
        lyricsPlacement: { lineId: line.id, slotIndex: a.slotIndex ?? 0 },
        progressionPlacement: mirror
          ? { patternId: mirror.patternId, startBeat: mirror.pc.startBeat, lengthBeats: mirror.pc.lengthBeats }
          : undefined,
      });
    });
  });

  pcAll.forEach(({ patternId, pc }) => {
    if (usedPcIds.has(pc.id)) return;
    out.push({
      id: pc.id,
      chord: pc.chord,
      lyricsPlacement: undefined,
      progressionPlacement: { patternId, startBeat: pc.startBeat, lengthBeats: pc.lengthBeats },
    });
  });

  return out;
}

/**
 * Refresh `section.chords` for every section based on current mirrors.
 * Wrapped `set` calls this after any update that touches sections/progression.
 */
function refreshAllSectionChords(sections: Section[], progression: PatternBlock[]): Section[] {
  return sections.map((sec) => {
    const sectionPatterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    return { ...sec, chords: recomputeSectionChordsFromMirrors(sec, sectionPatterns) };
  });
}

/**
 * SSOT-aware read for the lyrics view. Returns the {@link ChordAnchor} objects
 * for a given line, ordered to match the section's SSOT (`section.chords`).
 *
 * Phase 2: lyrics UI uses this selector instead of `line.chords` directly so
 * that ordering follows the SectionChord projection. The legacy ChordAnchor
 * shape is preserved (id, slotIndex, mirrorId, …) because the renderer still
 * depends on those fields.
 */
export function getLineChordsViaSSOT(section: Section, lineId: string): ChordAnchor[] {
  const line = section.lines.find((l) => l.id === lineId);
  if (!line) return [];
  if (!section.chords || section.chords.length === 0) return line.chords;
  const byId = new Map(line.chords.map((a) => [a.id, a] as const));
  const out: ChordAnchor[] = [];
  const seen = new Set<string>();
  // Walk SSOT order first, picking anchors that belong to this line.
  for (const sc of section.chords) {
    if (sc.lyricsPlacement?.lineId !== lineId) continue;
    const a = byId.get(sc.id);
    if (a) {
      out.push(a);
      seen.add(a.id);
    }
  }
  // Append any anchors not represented in SSOT yet (defensive — shouldn't
  // happen since the projection covers every anchor, but keeps the UI safe
  // during transient mismatches).
  for (const a of line.chords) {
    if (!seen.has(a.id)) out.push(a);
  }
  return out;
}

/**
 * SSOT-aware read for the progression view. Returns this pattern's
 * {@link PatternChord} list ordered to match the section's SSOT
 * (`section.chords`). Pattern chords not represented in the SSOT (transient
 * mismatches) are appended at the end in their native order.
 */
export function getPatternChordsViaSSOT(section: Section, pattern: PatternBlock): PatternChord[] {
  if (!section.chords || section.chords.length === 0) {
    return [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  }
  const byId = new Map(pattern.chords.map((pc) => [pc.id, pc] as const));
  const out: PatternChord[] = [];
  const seen = new Set<string>();
  for (const sc of section.chords) {
    if (sc.progressionPlacement?.patternId !== pattern.id) continue;
    const pc = byId.get(sc.id);
    if (pc) {
      out.push(pc);
      seen.add(pc.id);
    }
  }
  for (const pc of [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat)) {
    if (!seen.has(pc.id)) out.push(pc);
  }
  return out;
}

// ---------- SSOT inversion (Phase 4b) ----------
/**
 * Inverse of `recomputeSectionChordsFromMirrors`: given an updated
 * `section.chords` (SSOT), rebuild `line.chords` and the section's pattern
 * blocks' chords so the legacy mirrors stay in sync.
 *
 * Each SectionChord becomes:
 *  - an anchor on the line referenced by `lyricsPlacement.lineId` (if any),
 *    using the SectionChord's id so playback `mirrorId` keeps pointing at
 *    the same anchor.
 *  - a pattern chord on the pattern referenced by
 *    `progressionPlacement.patternId` (if any), with `mirrorId` set to the
 *    SectionChord id so the legacy pairing keeps working.
 *
 * Pattern chord `startBeat` is recomputed left-to-right (no spacing rule).
 */
function deriveMirrorsFromSectionChords(
  section: Section,
  sectionPatterns: PatternBlock[],
): { section: Section; patterns: PatternBlock[] } {
  // 1) Rebuild line.chords from SectionChords whose lyricsPlacement matches.
  const anchorsByLine = new Map<string, ChordAnchor[]>();
  section.lines.forEach((l) => anchorsByLine.set(l.id, []));
  for (const sc of section.chords) {
    const lp = sc.lyricsPlacement;
    if (!lp) continue;
    const bucket = anchorsByLine.get(lp.lineId);
    if (!bucket) continue;
    bucket.push({
      id: sc.id,
      offset: lp.slotIndex,
      slotIndex: lp.slotIndex,
      chord: sc.chord,
      mirrorId: sc.progressionPlacement ? sc.id : undefined,
    });
  }
  const nextSection: Section = {
    ...section,
    lines: section.lines.map((l) => ({
      ...l,
      chords: (anchorsByLine.get(l.id) ?? []).sort(
        (a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0),
      ),
    })),
  };

  // 2) Rebuild each pattern's chords from SectionChords whose
  //    progressionPlacement matches that pattern. Order by SectionChord
  //    array order. Re-pack startBeat left-to-right.
  const defaultLen = getDefaults().defaultChordLengthBeats;
  const nextPatterns = sectionPatterns.map((p) => {
    const total = p.bars * p.beatsPerBar;
    const list: PatternChord[] = [];
    let cursor = 0;
    for (const sc of section.chords) {
      const pp = sc.progressionPlacement;
      if (!pp || pp.patternId !== p.id) continue;
      const want = pp.lengthBeats > 0 ? pp.lengthBeats : defaultLen;
      const remaining = total - cursor;
      if (remaining < 0.5) break;
      const len = Math.max(0.5, Math.min(want, remaining));
      list.push({
        id: sc.id,
        chord: sc.chord,
        startBeat: cursor,
        lengthBeats: len,
        mirrorId: sc.lyricsPlacement ? sc.id : undefined,
      });
      cursor += len;
    }
    return { ...p, chords: list };
  });

  return { section: nextSection, patterns: nextPatterns };
}

/**
 * Place a brand-new SectionChord into a section, choosing a target pattern
 * with available room. If no existing pattern in the section has space,
 * spawn a continuation block at the end of the section. This ports the
 * legacy `placeMirroredChord` behavior into the SSOT-first flow.
 *
 * Returns the new SectionChord (with progressionPlacement filled), the
 * (possibly extended) progression, and the chosen patternId.
 */
function placeSectionChordInProgression(
  progression: PatternBlock[],
  sectionId: string,
  sectionChords: SectionChord[],
  newChord: ChordSymbol,
  newId: string,
  lyricsPlacement?: LyricsPlacement,
): { progression: PatternBlock[]; sectionChord: SectionChord } {
  const len = getDefaults().defaultChordLengthBeats;
  const sectionBlockIndices = progression
    .map((p, i) => ((p.sectionId ?? p.id) === sectionId ? i : -1))
    .filter((i) => i >= 0);
  if (!sectionBlockIndices.length) {
    return {
      progression,
      sectionChord: { id: newId, chord: newChord, lyricsPlacement },
    };
  }
  // For each candidate pattern, sum the lengths of SectionChords already
  // assigned to it (SSOT-driven, ignoring stale pattern.chords arrays).
  const usedByPattern = new Map<string, number>();
  for (const sc of sectionChords) {
    const pp = sc.progressionPlacement;
    if (!pp) continue;
    usedByPattern.set(pp.patternId, (usedByPattern.get(pp.patternId) ?? 0) + (pp.lengthBeats || len));
  }
  for (const i of sectionBlockIndices) {
    const target = progression[i];
    const total = target.bars * target.beatsPerBar;
    const used = usedByPattern.get(target.id) ?? 0;
    const free = total - used;
    if (free + 1e-9 >= 0.5) {
      const placedLen = Math.min(len, free);
      return {
        progression,
        sectionChord: {
          id: newId,
          chord: newChord,
          lyricsPlacement,
          progressionPlacement: { patternId: target.id, startBeat: used, lengthBeats: placedLen },
        },
      };
    }
  }
  // No room — spawn continuation block after the last block of this section.
  const lastIdx = sectionBlockIndices[sectionBlockIndices.length - 1];
  const ref = progression[lastIdx];
  const newPatternId = nanoid();
  const newPattern: PatternBlock = {
    id: newPatternId,
    sectionId,
    label: `${ref.label} (cont.)`,
    bars: ref.bars,
    beatsPerBar: ref.beatsPerBar,
    chords: [],
  };
  const placedLen = Math.min(len, newPattern.bars * newPattern.beatsPerBar);
  const nextProg = [...progression];
  nextProg.splice(lastIdx + 1, 0, newPattern);
  return {
    progression: nextProg,
    sectionChord: {
      id: newId,
      chord: newChord,
      lyricsPlacement,
      progressionPlacement: { patternId: newPatternId, startBeat: 0, lengthBeats: placedLen },
    },
  };
}

/**
 * Apply `deriveMirrorsFromSectionChords` across the whole song after a
 * SectionChord-first mutation. Keeps `section.chords` untouched and
 * rebuilds `line.chords` + `pattern.chords` from it.
 */
function syncMirrorsFromAllSectionChords(
  sections: Section[],
  progression: PatternBlock[],
): { sections: Section[]; progression: PatternBlock[] } {
  const nextSections: Section[] = [];
  const patternReplacements = new Map<string, PatternBlock>();
  for (const sec of sections) {
    const sectionPatterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    const derived = deriveMirrorsFromSectionChords(sec, sectionPatterns);
    nextSections.push(derived.section);
    derived.patterns.forEach((p) => patternReplacements.set(p.id, p));
  }
  const nextProgression = progression.map((p) => patternReplacements.get(p.id) ?? p);
  return { sections: nextSections, progression: nextProgression };
}

/**
 * Marker on a partial state update: when present, the wrapped `set` treats
 * `section.chords` as authoritative and rebuilds mirrors from it. Stripped
 * before being merged into state.
 */
const SSOT_MODE = "__ssotMode__" as const;

// ---------- Store ----------

const seed = makeSection("verse");
seed.section.chords = recomputeSectionChordsFromMirrors(seed.section, [seed.pattern]);

// History stacks live outside the reactive state so snapshots don't trigger re-renders.
type HistorySnapshot = { sections: Section[]; progression: PatternBlock[] };
const undoStack: HistorySnapshot[] = [];
const redoStack: HistorySnapshot[] = [];
const HISTORY_LIMIT = 50;

function snapshot(s: { sections: Section[]; progression: PatternBlock[] }): HistorySnapshot {
  return {
    sections: JSON.parse(JSON.stringify(s.sections)),
    progression: JSON.parse(JSON.stringify(s.progression)),
  };
}

/** Call BEFORE mutating sections/progression in a chord-row action. */
function pushHistory(get: () => SongState) {
  const s = get();
  undoStack.push(snapshot(s));
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

export const useSongStore = create<SongState>((rawSet, get) => {
  /**
   * Wrapped setter. Two flow modes:
   *   - Default (mirror-first, legacy): after any update touching sections/
   *     progression, refresh `section.chords` from the mirrors via
   *     `refreshAllSectionChords`.
   *   - SSOT-first (Phase 4b actions): if the partial carries the
   *     `[SSOT_MODE]: true` marker, treat the new `section.chords` as
   *     authoritative and rebuild `line.chords` + `pattern.chords` from it
   *     via `syncMirrorsFromAllSectionChords`. The marker is stripped.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = ((updater: any, replace?: any) => {
    return rawSet((prev: SongState) => {
      const partial = typeof updater === "function" ? updater(prev) : updater;
      if (!partial) return partial;
      const touchesSections = Object.prototype.hasOwnProperty.call(partial, "sections");
      const touchesProgression = Object.prototype.hasOwnProperty.call(partial, "progression");
      if (!touchesSections && !touchesProgression) return partial;
      const ssotMode = partial[SSOT_MODE] === true;
      const sections = touchesSections ? partial.sections : prev.sections;
      const progression = touchesProgression ? partial.progression : prev.progression;
      if (ssotMode) {
        const synced = syncMirrorsFromAllSectionChords(sections, progression);
        const out = { ...partial, sections: synced.sections, progression: synced.progression };
        delete out[SSOT_MODE];
        return out;
      }
      return { ...partial, sections: refreshAllSectionChords(sections, progression) };
    }, replace);
  }) as typeof rawSet;

  return {
  meta: { title: "Untitled Song", keyRoot: "C", keyMode: "maj", bpm: 92, beatsPerBar: 4, beatUnit: 4 },
  sections: [seed.section],
  basket: [],
  progression: [seed.pattern],
  suppressCrossTabDeleteWarning: false,
  setSuppressCrossTabDeleteWarning: (v) => set({ suppressCrossTabDeleteWarning: v }),

  setTitle: (title) => set((s) => ({ meta: { ...s.meta, title } })),
  setKey: (keyRoot, keyMode) => set((s) => ({ meta: { ...s.meta, keyRoot, keyMode } })),
  setBpm: (bpm) => set((s) => ({ meta: { ...s.meta, bpm: Math.max(40, Math.min(220, bpm)) } })),

  setTimeSignature: (beatsPerBar, beatUnit) => set((s) => {
    const bpb = Math.max(1, Math.min(16, Math.round(beatsPerBar)));
    const bu = [2, 4, 8, 16].includes(beatUnit) ? beatUnit : 4;
    // Propagate beatsPerBar to every pattern block; clamp/repack chords to fit new capacity.
    const progression = s.progression.map((p) => {
      const newTotal = p.bars * bpb;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const fit: PatternChord[] = [];
      let cursor = 0;
      for (const c of sorted) {
        const len = Math.max(0.5, c.lengthBeats);
        if (cursor + len <= newTotal + 1e-9) {
          fit.push({ ...c, startBeat: cursor, lengthBeats: len });
          cursor += len;
        } else if (cursor < newTotal) {
          // Truncate the last chord to fit; drop the rest (rare).
          fit.push({ ...c, startBeat: cursor, lengthBeats: newTotal - cursor });
          cursor = newTotal;
        }
      }
      return { ...p, beatsPerBar: bpb, chords: repackChords(fit, newTotal) };
    });
    return { meta: { ...s.meta, beatsPerBar: bpb, beatUnit: bu }, progression };
  }),

  transposeSong: (semitones) => set((s) => ({
    meta: { ...s.meta, keyRoot: transposeKey(s.meta.keyRoot, semitones) },
    sections: s.sections.map((sec) => ({
      ...sec,
      lines: sec.lines.map((l) => ({
        ...l,
        chords: l.chords.map((a) => ({ ...a, chord: transposeChord(a.chord, semitones) })),
      })),
    })),
    progression: s.progression.map((p) => ({
      ...p,
      chords: p.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, semitones) })),
    })),
  })),

  // ---- sections ----
  addSection: (type = "verse", label) => {
    const { section, pattern } = makeSection(type, label);
    set((s) => ({
      sections: [...s.sections, section],
      progression: [...s.progression, pattern],
    }));
    return section.id;
  },
  updateSection: (id, patch) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)),
    progression: patch.label !== undefined
      ? s.progression.map((p) => (p.sectionId === id ? { ...p, label: patch.label! } : p))
      : s.progression,
  })),
  removeSection: (id) => set((s) => {
    if (s.sections.length <= 1) return s;
    return {
      sections: s.sections.filter((sec) => sec.id !== id),
      progression: s.progression.filter((p) => p.sectionId !== id),
    };
  }),
  duplicateSection: (id) => {
    const state = get();
    const idx = state.sections.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const src = state.sections[idx];
    const srcPattern = state.progression.find((p) => p.id === id);
    const newId = nanoid();
    // Rebuild lines + chords with fresh ids and mirror relationships.
    const idMap = new Map<string, string>(); // oldAnchorId -> newAnchorId
    const newLines: LyricLine[] = src.lines.map((l) => ({
      id: nanoid(),
      text: l.text,
      chords: l.chords.map((a) => {
        const newAnchorId = nanoid();
        idMap.set(a.id, newAnchorId);
        return { id: newAnchorId, offset: a.offset, chord: a.chord, mirrorId: undefined };
      }),
    }));
    const newSection: Section = {
      id: newId,
      type: src.type,
      label: `${src.label} copy`,
      collapsed: src.collapsed,
      lines: newLines,
      chords: [],
    };
    const newPattern: PatternBlock = srcPattern
      ? {
          id: newId,
          sectionId: newId,
          label: newSection.label,
          bars: srcPattern.bars,
          beatsPerBar: srcPattern.beatsPerBar,
          chords: srcPattern.chords.map((c) => {
            const newPcId = nanoid();
            const linkedAnchor = c.mirrorId ? idMap.get(c.mirrorId) : undefined;
            // also re-link the anchor's mirrorId
            if (linkedAnchor) {
              for (const ln of newLines) {
                const found = ln.chords.find((a) => a.id === linkedAnchor);
                if (found) found.mirrorId = newPcId;
              }
            }
            return { id: newPcId, chord: c.chord, startBeat: c.startBeat, lengthBeats: c.lengthBeats, mirrorId: linkedAnchor };
          }),
        }
      : { id: newId, sectionId: newId, label: newSection.label, bars: 4, beatsPerBar: 4, chords: [] };

    set((s) => {
      const sections = [...s.sections];
      sections.splice(idx + 1, 0, newSection);
      const pIdx = s.progression.findIndex((p) => p.id === id);
      const progression = [...s.progression];
      progression.splice((pIdx >= 0 ? pIdx : s.progression.length - 1) + 1, 0, newPattern);
      return { sections, progression };
    });
    return newId;
  },
  moveSection: (id, direction) => set((s) => {
    const idx = s.sections.findIndex((sec) => sec.id === id);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= s.sections.length) return s;
    const sections = [...s.sections];
    [sections[idx], sections[swap]] = [sections[swap], sections[idx]];
    // Reorder progression so that block groups follow new section order.
    const groups = new Map<string, PatternBlock[]>();
    s.progression.forEach((p) => {
      const arr = groups.get(p.sectionId) ?? [];
      arr.push(p);
      groups.set(p.sectionId, arr);
    });
    const progression: PatternBlock[] = [];
    sections.forEach((sec) => {
      (groups.get(sec.id) ?? []).forEach((p) => progression.push(p));
    });
    // Append any orphan blocks (sectionId not matching any section) at the end.
    s.progression.forEach((p) => {
      if (!sections.some((sec) => sec.id === p.sectionId) && !progression.includes(p)) {
        progression.push(p);
      }
    });
    return { sections, progression };
  }),
  reorderSection: (id, toIndex) => set((s) => {
    const idx = s.sections.findIndex((sec) => sec.id === id);
    if (idx < 0) return s;
    const sections = [...s.sections];
    const [moved] = sections.splice(idx, 1);
    const clamped = Math.max(0, Math.min(sections.length, toIndex));
    sections.splice(clamped, 0, moved);
    // Rebuild progression so all blocks of each section stay grouped, in new section order.
    const groups = new Map<string, PatternBlock[]>();
    s.progression.forEach((p) => {
      const arr = groups.get(p.sectionId) ?? [];
      arr.push(p);
      groups.set(p.sectionId, arr);
    });
    const progression: PatternBlock[] = [];
    sections.forEach((sec) => {
      (groups.get(sec.id) ?? []).forEach((p) => progression.push(p));
    });
    s.progression.forEach((p) => {
      if (!sections.some((sec) => sec.id === p.sectionId) && !progression.includes(p)) {
        progression.push(p);
      }
    });
    return { sections, progression };
  }),
  toggleSectionCollapsed: (id) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, collapsed: !sec.collapsed } : sec)),
  })),
  setAllSectionsCollapsed: (collapsed) => set((s) => ({
    sections: s.sections.map((sec) => ({ ...sec, collapsed })),
  })),
  setSectionComment: (id, comment) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, comment } : sec)),
  })),
  setSectionColor: (id, color) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, color: color ?? null } : sec)),
  })),
  resetSong: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    const fresh = makeSection("verse");
    set((s) => ({
      meta: { title: "Untitled Song", keyRoot: "C", keyMode: "maj", bpm: 92, beatsPerBar: 4, beatUnit: 4 },
      sections: [fresh.section],
      progression: [fresh.pattern],
      basket: [],
      suppressCrossTabDeleteWarning: s.suppressCrossTabDeleteWarning,
    }));
  },

  // ---- lyric lines ----
  addLine: (sectionId, afterId) => {
    const newLine = initialLine();
    set((s) => ({
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        if (!afterId) return { ...sec, lines: [...sec.lines, newLine] };
        const idx = sec.lines.findIndex((l) => l.id === afterId);
        const lines = [...sec.lines];
        lines.splice(idx + 1, 0, newLine);
        return { ...sec, lines };
      }),
    }));
    return newLine.id;
  },
  removeLine: (sectionId, id) => set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      if (sec.lines.length <= 1) return sec;
      return { ...sec, lines: sec.lines.filter((l) => l.id !== id) };
    }),
    // Detach mirror links on all the section's pattern blocks for orphaned anchor ids
    progression: (() => {
      const sec = s.sections.find((x) => x.id === sectionId);
      const removed = sec?.lines.find((l) => l.id === id);
      if (!removed?.chords.length) return s.progression;
      const anchorIds = new Set(removed.chords.map((a) => a.id));
      return s.progression.map((p) =>
        (p.sectionId ?? p.id) !== sectionId
          ? p
          : { ...p, chords: p.chords.map((c) => (c.mirrorId && anchorIds.has(c.mirrorId) ? { ...c, mirrorId: undefined } : c)) },
      );
    })(),
  })),
  setLineText: (sectionId, id, text) => { pushHistory(get); set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        // Chord row is decoupled from lyric text; reflow word-anchored chords so:
        //  • newly-typed words pick up floating chords on their left,
        //  • deleted words leave their chord as floating (it falls beside its neighbor),
        //  • bound chords keep their wordIndex when their word still exists.
        lines: sec.lines.map((l) => {
          if (l.id !== id) return l;
          const prevWords = getWords(l.text);
          const nextWords = getWords(text);
          const sorted = sortAnchors(l.chords);
          const occupied = new Set<number>();
          // First pass: keep chords still bound to a valid word.
          const reflowed = sorted.map((c) => {
            if (c.wordIndex == null) return c;
            const oldWord = prevWords[c.wordIndex];
            if (!oldWord) {
              // Word removed — orphan becomes floating.
              return { ...c, wordIndex: undefined as number | undefined };
            }
            // Try to find the same word text at the same index in the new list first.
            const sameIdx = nextWords[c.wordIndex];
            if (sameIdx && sameIdx.text === oldWord.text && !occupied.has(sameIdx.index)) {
              occupied.add(sameIdx.index);
              return { ...c, chordCol: sameIdx.start, offset: sameIdx.start };
            }
            // Otherwise look for the same word text elsewhere (handles inserted words).
            const match = nextWords.find((w) => w.text === oldWord.text && !occupied.has(w.index));
            if (match) {
              occupied.add(match.index);
              return { ...c, wordIndex: match.index, chordCol: match.start, offset: match.start };
            }
            // Word vanished — orphan, becomes floating.
            return { ...c, wordIndex: undefined as number | undefined };
          });
          // Second pass: floating chords (in display order) snap into the nearest free
          // word slot to the right of their previous neighbor — this is what makes
          // typing a new lyric "pull" leftover chords onto the new words.
          const final = reflowed.map((c) => {
            if (c.wordIndex != null) return c;
            // Scan word slots left→right for the first free one.
            for (let i = 0; i < nextWords.length; i++) {
              if (!occupied.has(i)) {
                occupied.add(i);
                const w = nextWords[i];
                return { ...c, wordIndex: i, chordCol: w.start, offset: w.start };
              }
            }
            return c; // remains floating if no free word
          });
          return { ...l, text, chords: sortAnchors(final) };
        }),
      };
    }),
  })); },

  setChordRowLen: (sectionId, id, len) => { pushHistory(get); set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => (l.id === id ? { ...l, chordRowLen: Math.max(0, len) } : l)),
      };
    }),
  })); },

  insertChordSpaceAt: (sectionId, lineId, col) => { pushHistory(get); set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          const chords = l.chords.map((c) => {
            const cc = c.chordCol ?? c.offset ?? 0;
            return cc >= col ? { ...c, chordCol: cc + 1 } : { ...c, chordCol: cc };
          });
          const len = Math.max((l.chordRowLen ?? 0) + 1, col + 1);
          return { ...l, chords, chordRowLen: len };
        }),
      };
    }),
  })); },

  removeChordCellAt: (sectionId, lineId, col) => {
    pushHistory(get);
    const state = get();
    const sec = state.sections.find((x) => x.id === sectionId);
    const line = sec?.lines.find((l) => l.id === lineId);
    if (!sec || !line) return false;
    const chordAt = line.chords.find((c) => (c.chordCol ?? c.offset ?? 0) === col);
    if (chordAt) {
      get().removeChordAnchor(sectionId, lineId, chordAt.id);
      return true;
    }
    // Otherwise shift later chords back by 1
    const hasLater = line.chords.some((c) => (c.chordCol ?? c.offset ?? 0) > col);
    if (!hasLater && (line.chordRowLen ?? 0) <= 0) return false;
    set((s) => ({
      sections: s.sections.map((s2) => {
        if (s2.id !== sectionId) return s2;
        return {
          ...s2,
          lines: s2.lines.map((l) => {
            if (l.id !== lineId) return l;
            const chords = l.chords.map((c) => {
              const cc = c.chordCol ?? c.offset ?? 0;
              return cc > col ? { ...c, chordCol: cc - 1 } : { ...c, chordCol: cc };
            });
            const len = Math.max(0, (l.chordRowLen ?? 0) - 1);
            return { ...l, chords, chordRowLen: len };
          }),
        };
      }),
    }));
    return true;
  },

  // Add or replace a chord anchor; mirror to bound pattern block.
  upsertChordAt: (sectionId, lineId, col, chord, anchorId) => { pushHistory(get); return set((s) => {
    let createdAnchorId: string | null = null;
    let updatedAnchorId: string | null = null;
    let prevMirrorId: string | undefined;

    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          let chords = [...l.chords];
          // Pad with 1ch on each side when this is the first chord placed
          // in an empty row, so the caret can land before/after the chip.
          const isFirstInEmpty = !anchorId && chords.length === 0 && (l.chordRowLen ?? 0) === 0;
          const placedCol = isFirstInEmpty ? Math.max(1, col + (col === 0 ? 1 : 0)) : col;
          if (anchorId) {
            chords = chords.map((c) => {
              if (c.id !== anchorId) return c;
              prevMirrorId = c.mirrorId;
              updatedAnchorId = c.id;
              return { ...c, chord, chordCol: placedCol, offset: placedCol };
            });
          } else {
            const existing = chords.findIndex((c) => (c.chordCol ?? c.offset ?? 0) === placedCol);
            if (existing >= 0) {
              prevMirrorId = chords[existing].mirrorId;
              updatedAnchorId = chords[existing].id;
              chords[existing] = { ...chords[existing], chord, chordCol: placedCol, offset: placedCol };
            } else {
              const newId = nanoid();
              createdAnchorId = newId;
              chords.push({ id: newId, offset: placedCol, chordCol: placedCol, chord });
            }
          }
          chords.sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
          // Reserve 1ch trailing space after the chord too.
          const minLen = placedCol + Math.max(1, chord.display.length) + 1;
          const newLen = Math.max(l.chordRowLen ?? 0, minLen);
          return { ...l, chords, chordRowLen: newLen };
        }),
      };
    });

    // Mirror to pattern.
    let progression = s.progression;
    let finalSections = sections;
    if (createdAnchorId) {
      const placed = placeMirroredChord(s.progression, sectionId, chord, createdAnchorId);
      progression = placed.progression;
      const pcId = placed.chordId;
      if (pcId) {
        finalSections = sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            lines: sec.lines.map((l) => ({
              ...l,
              chords: l.chords.map((a) => (a.id === createdAnchorId ? { ...a, mirrorId: pcId } : a)),
            })),
          };
        });
      }
      // After mirror placement, ensure pattern order matches anchor visual order.
      const updatedSection = finalSections.find((x) => x.id === sectionId);
      if (updatedSection) progression = syncPatternFromAnchors(progression, updatedSection);
    } else if (updatedAnchorId && prevMirrorId) {
      progression = s.progression.map((p) =>
        p.id !== sectionId
          ? p
          : { ...p, chords: p.chords.map((c) => (c.id === prevMirrorId ? { ...c, chord } : c)) },
      );
    }

    return { sections: finalSections, progression };
  }); },

  // SSOT-first: anchorId === SectionChord.id (deriveMirrorsFromSectionChords
  // copies sc.id into ChordAnchor.id). Drop that SectionChord and let
  // mirror derivation remove both the lyric anchor and the pattern chord.
  removeChordAnchor: (sectionId, _lineId, anchorId) => { pushHistory(get); return set((s) => {
    const sections = s.sections.map((sec) =>
      sec.id !== sectionId ? sec : { ...sec, chords: sec.chords.filter((sc) => sc.id !== anchorId) },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }); },

  removeChordAnchorsBatch: (sectionId, _lineId, anchorIds) => { pushHistory(get); return set((s) => {
    const idSet = new Set(anchorIds);
    const sections = s.sections.map((sec) =>
      sec.id !== sectionId ? sec : { ...sec, chords: sec.chords.filter((sc) => !idSet.has(sc.id)) },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }); },

  shiftChordAnchors: (sectionId, lineId, anchorIds, deltaCols) => { pushHistory(get); return set((s) => {
    const idSet = new Set(anchorIds);
    return {
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== lineId) return l;
            const chords = l.chords.map((c) => {
              if (!idSet.has(c.id)) return c;
              const cur = c.chordCol ?? c.offset ?? 0;
              const next = Math.max(0, cur + deltaCols);
              return { ...c, chordCol: next, offset: next };
            }).sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
            const maxCol = chords.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + 1), 0);
            return { ...l, chords, chordRowLen: Math.max(l.chordRowLen ?? 0, maxCol) };
          }),
        };
      }),
    };
  }); },

  moveSelectedChordsByOrder: (sectionId, lineId, anchorIds, direction) => { pushHistory(get); return set((s) => {
    const idSet = new Set(anchorIds);
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          const sorted = [...l.chords].sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
          // Process in order so neighbor lookups stay consistent.
          // For direction=+1, iterate right-to-left so we don't double-jump.
          const order = direction === 1 ? [...sorted].reverse() : sorted;
          const work = sorted.map((c) => ({ ...c }));
          for (const sel of order) {
            if (!idSet.has(sel.id)) continue;
            const idx = work.findIndex((c) => c.id === sel.id);
            if (idx < 0) continue;
            const cur = work[idx];
            const curCol = cur.chordCol ?? cur.offset ?? 0;
            const curWidth = Math.max(1, cur.chord.display.length);
            if (direction === 1) {
              const right = work.slice(idx + 1).find((c) => !idSet.has(c.id));
              if (!right) continue;
              const rCol = right.chordCol ?? right.offset ?? 0;
              const rWidth = Math.max(1, right.chord.display.length);
              const rightNewCol = curCol;
              const selNewCol = rightNewCol + rWidth + 1;
              work[idx] = { ...cur, chordCol: selNewCol, offset: selNewCol };
              const rIdx = work.findIndex((c) => c.id === right.id);
              work[rIdx] = { ...right, chordCol: rightNewCol, offset: rightNewCol };
            } else {
              const left = work.slice(0, idx).reverse().find((c) => !idSet.has(c.id));
              if (!left) continue;
              const lCol = left.chordCol ?? left.offset ?? 0;
              const selNewCol = lCol;
              const leftNewCol = lCol + curWidth + 1;
              work[idx] = { ...cur, chordCol: selNewCol, offset: selNewCol };
              const lIdx = work.findIndex((c) => c.id === left.id);
              work[lIdx] = { ...left, chordCol: leftNewCol, offset: leftNewCol };
            }
            work.sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
          }
          const maxEnd = work.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + Math.max(1, c.chord.display.length) + 1), 0);
          return { ...l, chords: work, chordRowLen: Math.max(l.chordRowLen ?? 0, maxEnd) };
        }),
      };
    });
    const updatedSection = sections.find((x) => x.id === sectionId);
    const progression = updatedSection ? syncPatternFromAnchors(s.progression, updatedSection) : s.progression;
    return { sections, progression };
  }); },

  moveChordAnchor: (fromSectionId, fromLineId, anchorId, toSectionId, toLineId, toCol) => { pushHistory(get); return set((s) => {
    // Find the anchor first
    let moved: ChordAnchor | undefined;
    let mirrorId: string | undefined;
    s.sections.forEach((sec) => {
      if (sec.id !== fromSectionId) return;
      sec.lines.forEach((l) => {
        if (l.id !== fromLineId) return;
        const a = l.chords.find((c) => c.id === anchorId);
        if (a) { moved = a; mirrorId = a.mirrorId; }
      });
    });
    if (!moved) return s;
    const movedChord = moved.chord;

    // The dropped chord visually occupies its display width plus chip padding
    // (px-2 ≈ 2ch each side ≈ 4ch). Reserve that many cells so chips don't
    // overlap when re-arranged via drag.
    const CHIP_PAD_CH = 4;
    const visualWidth = (display: string) => Math.max(1, display.length) + CHIP_PAD_CH;
    const reservedWidth = visualWidth(movedChord.display);

    // Same row: shift this anchor's column, pushing colliding chords aside.
    if (fromSectionId === toSectionId && fromLineId === toLineId) {
      const sectionsNext = s.sections.map((sec) => sec.id !== fromSectionId ? sec : {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== fromLineId) return l;
          const others = l.chords.filter((c) => c.id !== anchorId);
          const collision = others.find((c) => {
            const cc = c.chordCol ?? c.offset ?? 0;
            const cEnd = cc + visualWidth(c.chord.display);
            return cc < toCol + reservedWidth && cEnd > toCol;
          });
          const push = collision ? (toCol + reservedWidth) - (collision.chordCol ?? collision.offset ?? 0) : 0;
          const chords = l.chords.map((c) => {
            if (c.id === anchorId) return { ...c, chordCol: toCol, offset: toCol };
            const cc = c.chordCol ?? c.offset ?? 0;
            if (push > 0 && cc >= toCol) return { ...c, chordCol: cc + push, offset: cc + push };
            return c;
          }).sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
          const minLen = chords.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + visualWidth(c.chord.display)), toCol + reservedWidth);
          return { ...l, chords, chordRowLen: Math.max(l.chordRowLen ?? 0, minLen) };
        }),
      });
      // Mirror the new visual order back to the bound pattern so progressions stay in sync.
      const updatedSection = sectionsNext.find((x) => x.id === fromSectionId);
      const progression = updatedSection ? syncPatternFromAnchors(s.progression, updatedSection) : s.progression;
      return { sections: sectionsNext, progression };
    }

    // Cross-row move: remove from source line, insert into target line. Detach mirror.
    const sections = s.sections.map((sec) => {
      if (sec.id === fromSectionId) {
        sec = {
          ...sec,
          lines: sec.lines.map((l) => l.id !== fromLineId ? l : ({
            ...l,
            chords: l.chords.filter((c) => c.id !== anchorId),
          })),
        };
      }
      if (sec.id === toSectionId) {
        sec = {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== toLineId) return l;
            // Push existing chords that overlap the reserved zone aside.
            const collision = l.chords.find((c) => {
              const cc = c.chordCol ?? c.offset ?? 0;
              const cEnd = cc + visualWidth(c.chord.display);
              return cc < toCol + reservedWidth && cEnd > toCol;
            });
            const push = collision ? (toCol + reservedWidth) - (collision.chordCol ?? collision.offset ?? 0) : 0;
            const newAnchor: ChordAnchor = { id: nanoid(), offset: toCol, chordCol: toCol, chord: movedChord };
            const shifted = l.chords.map((c) => {
              const cc = c.chordCol ?? c.offset ?? 0;
              if (push > 0 && cc >= toCol) return { ...c, chordCol: cc + push, offset: cc + push };
              return c;
            });
            const chords = [...shifted, newAnchor].sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
            const minLen = chords.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + visualWidth(c.chord.display)), toCol + reservedWidth);
            return { ...l, chords, chordRowLen: Math.max(l.chordRowLen ?? 0, minLen) };
          }),
        };
      }
      return sec;
    });

    // Detach mirrored pattern chord (if any) since we no longer track which anchor it belongs to.
    const progression = mirrorId
      ? s.progression.map((p) => ({ ...p, chords: p.chords.map((c) => c.id === mirrorId ? { ...c, mirrorId: undefined } : c) }))
      : s.progression;

    return { sections, progression };
  }); },

  moveSelectedChordsTo: (fromSectionId, fromLineId, toSectionId, toLineId, toCol, anchorIds) => {
    if (!anchorIds.length) return;
    pushHistory(get);
    set((s) => {
      const CHIP_PAD_CH = 4;
      const visualWidth = (display: string) => Math.max(1, display.length) + CHIP_PAD_CH;

      const movingAnchors: ChordAnchor[] = [];
      s.sections.forEach((sec) => {
        if (sec.id !== fromSectionId) return;
        sec.lines.forEach((l) => {
          if (l.id !== fromLineId) return;
          l.chords.forEach((c) => { if (anchorIds.includes(c.id)) movingAnchors.push(c); });
        });
      });
      if (!movingAnchors.length) return s;

      const sortedMoving = [...movingAnchors].sort(
        (a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0),
      );
      const minOrigCol = (sortedMoving[0].chordCol ?? sortedMoving[0].offset ?? 0);

      const newAnchors: ChordAnchor[] = sortedMoving.map((a) => {
        const orig = a.chordCol ?? a.offset ?? 0;
        const col = Math.max(0, toCol + (orig - minOrigCol));
        return { id: nanoid(), offset: col, chordCol: col, chord: a.chord, mirrorId: a.mirrorId };
      });
      const oldToNew = new Map<string, string>();
      sortedMoving.forEach((a, i) => oldToNew.set(a.id, newAnchors[i].id));

      const sections = s.sections.map((sec) => {
        let next = sec;
        if (sec.id === fromSectionId) {
          next = {
            ...next,
            lines: next.lines.map((l) =>
              l.id === fromLineId
                ? { ...l, chords: l.chords.filter((c) => !anchorIds.includes(c.id)) }
                : l,
            ),
          };
        }
        if (next.id === toSectionId) {
          next = {
            ...next,
            lines: next.lines.map((l) => {
              if (l.id !== toLineId) return l;
              const base = l.chords.filter((c) => !anchorIds.includes(c.id));
              const merged = [...base, ...newAnchors].sort(
                (a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0),
              );
              const minLen = merged.reduce(
                (m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + visualWidth(c.chord.display)),
                l.chordRowLen ?? 0,
              );
              return { ...l, chords: merged, chordRowLen: minLen };
            }),
          };
        }
        return next;
      });

      const progression0 = s.progression.map((p) => ({
        ...p,
        chords: p.chords.map((c) => {
          if (!c.mirrorId) return c;
          const newId = oldToNew.get(c.mirrorId);
          return newId ? { ...c, mirrorId: newId } : c;
        }),
      }));

      const targetSection = sections.find((x) => x.id === toSectionId);
      let progression = targetSection ? syncPatternFromAnchors(progression0, targetSection) : progression0;
      if (fromSectionId !== toSectionId) {
        const fromSection = sections.find((x) => x.id === fromSectionId);
        if (fromSection) progression = syncPatternFromAnchors(progression, fromSection);
      }
      return { sections, progression };
    });
  },

  pasteChordsAt: (sectionId, lineId, atCol, items) => { pushHistory(get); return set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          const newAnchors: ChordAnchor[] = items.map((it) => {
            const col = atCol + Math.max(0, it.relCol);
            return { id: nanoid(), offset: col, chordCol: col, chord: it.chord };
          });
          // Replace any chord at the same column.
          const occupied = new Set(newAnchors.map((a) => a.chordCol!));
          const kept = l.chords.filter((c) => !occupied.has((c.chordCol ?? c.offset ?? 0)));
          const chords = [...kept, ...newAnchors].sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
          const maxEnd = newAnchors.reduce((m, a) => Math.max(m, (a.chordCol ?? 0) + Math.max(1, a.chord.display.length) + 1), 0);
          return { ...l, chords, chordRowLen: Math.max(l.chordRowLen ?? 0, maxEnd) };
        }),
      };
    }),
  })); },

  // -------- Word-anchored chord placement --------
  upsertChordAtWord: (sectionId, lineId, nearWordIndex, chord, anchorId) => {
    pushHistory(get);
    set((s) => {
      let createdAnchorId: string | null = null;
      let updatedAnchorId: string | null = null;
      let prevMirrorId: string | undefined;

      const sections = s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== lineId) return l;
            const words = getWords(l.text);
            // If editing an existing anchor, just swap the chord (keep its wordIndex).
            if (anchorId) {
              const chords = l.chords.map((c) => {
                if (c.id !== anchorId) return c;
                prevMirrorId = c.mirrorId;
                updatedAnchorId = c.id;
                return { ...c, chord };
              });
              return { ...l, chords };
            }
            // Find target word: nearest unused word at or after nearWordIndex; if all
            // are taken to the right, scan left; if no words at all, append floating.
            const occupied = new Set<number>();
            l.chords.forEach((c) => { if (c.wordIndex != null) occupied.add(c.wordIndex); });
            let target: number | undefined;
            if (words.length) {
              const clamped = Math.max(0, Math.min(words.length - 1, nearWordIndex));
              for (let i = clamped; i < words.length; i++) {
                if (!occupied.has(i)) { target = i; break; }
              }
              if (target == null) {
                for (let i = clamped - 1; i >= 0; i--) {
                  if (!occupied.has(i)) { target = i; break; }
                }
              }
            }
            const newId = nanoid();
            createdAnchorId = newId;
            const wordIndex = target;
            const col = wordIndex != null ? words[wordIndex].start : (l.chords.length * 4);
            const newAnchor: ChordAnchor = {
              id: newId,
              offset: col,
              chordCol: col,
              wordIndex,
              chord,
            };
            const chords = sortAnchors([...l.chords, newAnchor]);
            return { ...l, chords };
          }),
        };
      });

      // Mirror to pattern (same logic as upsertChordAt for created anchors).
      let progression = s.progression;
      let finalSections = sections;
      if (createdAnchorId) {
        const placed = placeMirroredChord(s.progression, sectionId, chord, createdAnchorId);
        progression = placed.progression;
        const pcId = placed.chordId;
        if (pcId) {
          finalSections = sections.map((sec) => {
            if (sec.id !== sectionId) return sec;
            return {
              ...sec,
              lines: sec.lines.map((l) => ({
                ...l,
                chords: l.chords.map((a) => (a.id === createdAnchorId ? { ...a, mirrorId: pcId } : a)),
              })),
            };
          });
        }
        const updatedSection = finalSections.find((x) => x.id === sectionId);
        if (updatedSection) progression = syncPatternFromAnchors(progression, updatedSection);
      } else if (updatedAnchorId && prevMirrorId) {
        progression = s.progression.map((p) =>
          p.sectionId !== sectionId
            ? p
            : { ...p, chords: p.chords.map((c) => (c.id === prevMirrorId ? { ...c, chord } : c)) },
        );
      }

      return { sections: finalSections, progression };
    });
  },

  appendChordToLine: (sectionId, lineId, chord, anchorId) => {
    // Convenience: append to end of a line with no words → floating, ordered last.
    const state = get();
    const sec = state.sections.find((s) => s.id === sectionId);
    const line = sec?.lines.find((l) => l.id === lineId);
    if (!line) return;
    state.upsertChordAtWord(sectionId, lineId, getWords(line.text).length, chord, anchorId);
  },

  formatChordsInLine: (sectionId, lineId) => {
    pushHistory(get);
    set((s) => {
      const sections = s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => (l.id === lineId ? snapLineToWords(l) : l)),
        };
      });
      return { sections };
    });
  },

  formatChordsInSong: () => {
    pushHistory(get);
    set((s) => ({
      sections: s.sections.map((sec) => ({
        ...sec,
        lines: sec.lines.map((l) => snapLineToWords(l)),
      })),
    }));
  },

  moveChordWordSlot: (sectionId, lineId, anchorId, direction) => {
    pushHistory(get);
    set((s) => {
      const sections = s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== lineId) return l;
            const words = getWords(l.text);
            const ordered = sortAnchors(l.chords);
            const idx = ordered.findIndex((c) => c.id === anchorId);
            if (idx < 0) return l;
            const cur = ordered[idx];
            // Find the neighbor in the visual order (next/prev sibling chord).
            const neighbor = direction === 1 ? ordered[idx + 1] : ordered[idx - 1];
            // Swap their wordIndex (covers occupied case + floating reorder).
            if (neighbor) {
              const swapped = l.chords.map((c) => {
                if (c.id === cur.id) {
                  const wi = neighbor.wordIndex;
                  return {
                    ...c,
                    wordIndex: wi,
                    chordCol: wi != null && words[wi] ? words[wi].start : (c.chordCol ?? 0),
                    offset: wi != null && words[wi] ? words[wi].start : (c.offset ?? 0),
                  };
                }
                if (c.id === neighbor.id) {
                  const wi = cur.wordIndex;
                  return {
                    ...c,
                    wordIndex: wi,
                    chordCol: wi != null && words[wi] ? words[wi].start : (c.chordCol ?? 0),
                    offset: wi != null && words[wi] ? words[wi].start : (c.offset ?? 0),
                  };
                }
                return c;
              });
              return { ...l, chords: sortAnchors(swapped) };
            }
            // No neighbor in that direction: shift to next/prev free word slot.
            const curWord = cur.wordIndex ?? -1;
            const occupied = new Set<number>();
            l.chords.forEach((c) => { if (c.wordIndex != null && c.id !== cur.id) occupied.add(c.wordIndex); });
            let target: number | undefined;
            if (direction === 1) {
              for (let i = (curWord < 0 ? 0 : curWord + 1); i < words.length; i++) {
                if (!occupied.has(i)) { target = i; break; }
              }
            } else {
              for (let i = (curWord < 0 ? words.length - 1 : curWord - 1); i >= 0; i--) {
                if (!occupied.has(i)) { target = i; break; }
              }
            }
            if (target == null) {
              // Going right past the last word: detach into floating (right side).
              if (direction === 1) {
                const updated = l.chords.map((c) =>
                  c.id === cur.id ? { ...c, wordIndex: undefined as number | undefined } : c,
                );
                return { ...l, chords: sortAnchors(updated) };
              }
              return l;
            }
            const updated = l.chords.map((c) =>
              c.id === cur.id
                ? { ...c, wordIndex: target, chordCol: words[target!].start, offset: words[target!].start }
                : c,
            );
            return { ...l, chords: sortAnchors(updated) };
          }),
        };
      });
      const sec = sections.find((x) => x.id === sectionId);
      const progression = sec ? syncPatternFromAnchors(s.progression, sec) : s.progression;
      return { sections, progression };
    });
  },

  // -------- Slot-based chord row (SSOT-first) --------
  placeChordInSlot: (sectionId, lineId, slotIndex, chord) => {
    pushHistory(get);
    set((s) => {
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      // Auto-reflow placement: target the requested slot. If it collides with
      // an existing chord OR violates the 1-slot spacing rule with its
      // immediate neighbors, shift every chord at-or-after the desired slot
      // by +2 to open a properly-spaced gap, then place at `target`.
      const target = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, slotIndex));
      const lineChords = sec.chords
        .filter((sc) => sc.lyricsPlacement?.lineId === lineId)
        .sort((a, b) => (a.lyricsPlacement!.slotIndex - b.lyricsPlacement!.slotIndex));
      const occupied = new Set<number>(lineChords.map((sc) => sc.lyricsPlacement!.slotIndex));
      const collision =
        occupied.has(target) || occupied.has(target - 1) || occupied.has(target + 1);

      let nextSectionsBase = s.sections;
      let placeSlot = target;
      if (collision) {
        // Shift everything at-or-after target by +2 (clamped). If the tail
        // would overflow CHORD_ROW_SLOTS we silently drop — row genuinely full.
        const shifted = lineChords
          .filter((sc) => sc.lyricsPlacement!.slotIndex >= target)
          .map((sc) => ({ id: sc.id, to: sc.lyricsPlacement!.slotIndex + 2 }));
        if (shifted.some((x) => x.to >= CHORD_ROW_SLOTS)) {
          // Fallback: try a non-shifting spaced slot rather than losing chord.
          const fallback = nearestSpacedFreeSlot(occupied, target);
          if (fallback < 0) return {};
          placeSlot = fallback;
        } else {
          const shiftMap = new Map(shifted.map((x) => [x.id, x.to]));
          nextSectionsBase = s.sections.map((x) =>
            x.id !== sectionId
              ? x
              : {
                  ...x,
                  chords: x.chords.map((sc) =>
                    shiftMap.has(sc.id) && sc.lyricsPlacement
                      ? { ...sc, lyricsPlacement: { ...sc.lyricsPlacement, slotIndex: shiftMap.get(sc.id)! } }
                      : sc,
                  ),
                },
          );
        }
      }

      const newId = nanoid();
      const secForPlacement = nextSectionsBase.find((x) => x.id === sectionId)!;
      const placement = placeSectionChordInProgression(
        s.progression,
        sectionId,
        secForPlacement.chords,
        chord,
        newId,
        { lineId, slotIndex: placeSlot },
      );
      const nextSections = nextSectionsBase.map((x) =>
        x.id !== sectionId ? x : { ...x, chords: [...x.chords, placement.sectionChord] },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({
        sections: nextSections,
        progression: placement.progression,
        [SSOT_MODE]: true,
      } as any);
    });
  },

  moveChordToSlot: (sectionId, lineId, anchorId, slotIndex) => {
    pushHistory(get);
    set((s) => {
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      const target = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, slotIndex));
      const me = sec.chords.find((c) => c.id === anchorId && c.lyricsPlacement?.lineId === lineId);
      if (!me || !me.lyricsPlacement) return {};
      if (me.lyricsPlacement.slotIndex === target) return {};
      const occupant = sec.chords.find(
        (c) => c.id !== anchorId && c.lyricsPlacement?.lineId === lineId && c.lyricsPlacement.slotIndex === target,
      );
      const myPrev = me.lyricsPlacement.slotIndex;
      const nextSections = s.sections.map((x) =>
        x.id !== sectionId
          ? x
          : {
              ...x,
              chords: x.chords.map((c) => {
                if (c.id === anchorId && c.lyricsPlacement)
                  return { ...c, lyricsPlacement: { ...c.lyricsPlacement, slotIndex: target } };
                if (occupant && c.id === occupant.id && c.lyricsPlacement)
                  return { ...c, lyricsPlacement: { ...c.lyricsPlacement, slotIndex: myPrev } };
                return c;
              }),
            },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    });
  },

  moveChordsAcrossLines: (fromSectionId, fromLineId, toSectionId, toLineId, anchorIds, dropSlot) => {
    pushHistory(get);
    set((s) => {
      const fromSec = s.sections.find((x) => x.id === fromSectionId);
      const fromLine = fromSec?.lines.find((l) => l.id === fromLineId);
      if (!fromSec || !fromLine) return s;
      // Same row → fall back to single-anchor moves.
      if (fromSectionId === toSectionId && fromLineId === toLineId) {
        // Lay out selection starting at dropSlot, push others right.
        const moving = anchorIds
          .map((id) => fromLine.chords.find((c) => c.id === id))
          .filter((c): c is ChordAnchor => !!c)
          .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
        const others = fromLine.chords.filter((c) => !anchorIds.includes(c.id));
        const used = new Set<number>();
        const placedMoving: ChordAnchor[] = [];
        let cursor = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, dropSlot));
        for (const m of moving) {
          const slot = nearestFreeSlot(used, cursor);
          if (slot < 0) break;
          used.add(slot);
          placedMoving.push({ ...m, slotIndex: slot });
          cursor = slot + 1;
        }
        // Now place others in their original slot, walking right on collision.
        const placedOthers: ChordAnchor[] = [];
        for (const o of others.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0))) {
          const slot = nearestFreeSlot(used, o.slotIndex ?? 0);
          if (slot < 0) continue;
          used.add(slot);
          placedOthers.push({ ...o, slotIndex: slot });
        }
        const sections = s.sections.map((sec) =>
          sec.id !== fromSectionId
            ? sec
            : {
                ...sec,
                lines: sec.lines.map((l) =>
                  l.id !== fromLineId
                    ? l
                    : { ...l, chords: [...placedOthers, ...placedMoving].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)) },
                ),
              },
        );
        const sec = sections.find((x) => x.id === fromSectionId);
        const progression = sec ? syncPatternFromAnchors(s.progression, sec) : s.progression;
        return { sections, progression };
      }
      // Cross-line: remove from source, insert into target.
      const moving = anchorIds
        .map((id) => fromLine.chords.find((c) => c.id === id))
        .filter((c): c is ChordAnchor => !!c)
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
      if (!moving.length) return s;
      const sections = s.sections.map((sec) => {
        if (sec.id === fromSectionId) {
          return {
            ...sec,
            lines: sec.lines.map((l) =>
              l.id !== fromLineId ? l : { ...l, chords: l.chords.filter((c) => !anchorIds.includes(c.id)) },
            ),
          };
        }
        return sec;
      }).map((sec) => {
        if (sec.id !== toSectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== toLineId) return l;
            const used = new Set<number>();
            l.chords.forEach((c) => { if (c.slotIndex != null) used.add(c.slotIndex); });
            const placed: ChordAnchor[] = [];
            let cursor = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, dropSlot));
            for (const m of moving) {
              const slot = nearestFreeSlot(used, cursor);
              if (slot < 0) break;
              used.add(slot);
              placed.push({ ...m, slotIndex: slot });
              cursor = slot + 1;
            }
            return { ...l, chords: [...l.chords, ...placed].sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0)) };
          }),
        };
      });
      let progression = s.progression;
      const fromSecNew = sections.find((x) => x.id === fromSectionId);
      if (fromSecNew) progression = syncPatternFromAnchors(progression, fromSecNew);
      const toSecNew = sections.find((x) => x.id === toSectionId);
      if (toSecNew) progression = syncPatternFromAnchors(progression, toSecNew);
      return { sections, progression };
    });
  },

  addToBasket: (chords) => set((s) => ({
    basket: [...s.basket, ...chords.map((chord) => ({ id: nanoid(), chord }))],
  })),
  removeFromBasket: (id) => set((s) => ({ basket: s.basket.filter((b) => b.id !== id) })),
  clearBasket: () => set({ basket: [] }),

  // ---- pattern blocks ----
  updatePattern: (id, patch) => set((s) => {
    const target = s.progression.find((p) => p.id === id);
    if (!target) return s;
    const next: PatternBlock = { ...target, ...patch };
    const newTotal = next.bars * next.beatsPerBar;
    // Determine which chords fit; collect overflow (in left-to-right order).
    const sorted = [...target.chords].sort((a, b) => a.startBeat - b.startBeat);
    const fit: PatternChord[] = [];
    const overflow: PatternChord[] = [];
    let cursor = 0;
    for (const c of sorted) {
      const len = Math.max(0.5, c.lengthBeats);
      if (cursor + len <= newTotal + 1e-9) {
        fit.push({ ...c, startBeat: cursor, lengthBeats: len });
        cursor += len;
      } else {
        overflow.push(c);
      }
    }
    let progression = s.progression.map((p) =>
      p.id === id ? { ...next, chords: repackChords(fit, newTotal) } : p,
    );
    if (!overflow.length) return { progression };
    // Distribute overflow into following blocks of the same section, creating new ones if needed.
    const sectionBlocks = () =>
      progression.map((p, i) => ({ p, i })).filter((x) => x.p.sectionId === target.sectionId);
    const targetIdx = progression.findIndex((p) => p.id === id);
    let nextBlocksAfter = sectionBlocks().filter((x) => x.i > targetIdx);
    for (const oc of overflow) {
      let placed = false;
      for (const { p, i } of nextBlocksAfter) {
        const total = p.bars * p.beatsPerBar;
        const used = p.chords.reduce((sum, c) => sum + c.lengthBeats, 0);
        const free = total - used;
        if (free >= 0.5) {
          const len = Math.max(0.5, Math.min(oc.lengthBeats, free));
          const newPc: PatternChord = { ...oc, startBeat: used, lengthBeats: len };
          progression = progression.map((q, qi) =>
            qi === i
              ? { ...q, chords: repackChords([...q.chords, newPc], total) }
              : q,
          );
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Append a new continuation block right after the last block of this section.
        const blocks = sectionBlocks();
        const lastIdx = blocks[blocks.length - 1].i;
        const ref = progression[lastIdx];
        const newBlock: PatternBlock = {
          id: nanoid(),
          sectionId: target.sectionId,
          label: `${ref.label} (cont.)`,
          bars: ref.bars,
          beatsPerBar: ref.beatsPerBar,
          chords: [],
        };
        const total = newBlock.bars * newBlock.beatsPerBar;
        const len = Math.max(0.5, Math.min(oc.lengthBeats, total));
        newBlock.chords = [{ ...oc, startBeat: 0, lengthBeats: len }];
        progression = [
          ...progression.slice(0, lastIdx + 1),
          newBlock,
          ...progression.slice(lastIdx + 1),
        ];
        nextBlocksAfter = sectionBlocks().filter((x) => x.i > targetIdx);
      }
    }
    return { progression };
  }),

  // Add chord into pattern (SSOT-first). Creates a SectionChord targeting the
  // specific pattern; mirrors derive `line.chords` + `pattern.chords`.
  addChordToPattern: (patternId, chord, atBeat, lengthBeats) => set((s) => {
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};
    const totalBeats = pattern.bars * pattern.beatsPerBar;
    const effectiveLen = lengthBeats ?? getDefaults().defaultChordLengthBeats;

    // SSOT used in this pattern (sum of lengths) — drives append point.
    const usedInPattern = sec.chords
      .filter((c) => c.progressionPlacement?.patternId === patternId)
      .reduce((acc, c) => acc + (c.progressionPlacement!.lengthBeats || 0), 0);
    const free = totalBeats - usedInPattern;

    const newId = nanoid();
    let nextProgression = s.progression;
    let sectionChord: SectionChord;
    if (free + 1e-9 >= 0.5) {
      // Append into target pattern at the natural end.
      const placedLen = Math.max(0.5, Math.min(effectiveLen, free));
      sectionChord = {
        id: newId,
        chord,
        progressionPlacement: { patternId, startBeat: usedInPattern, lengthBeats: placedLen },
      };
    } else {
      // Pattern full — fall back to generic placement (continuation block etc.).
      const placement = placeSectionChordInProgression(
        s.progression,
        sectionId,
        sec.chords,
        chord,
        newId,
      );
      nextProgression = placement.progression;
      sectionChord = placement.sectionChord;
    }

    // Insert SectionChord at the end of this pattern's group within section.chords.
    const nextSections = s.sections.map((x) => {
      if (x.id !== sectionId) return x;
      // Find last index of any SectionChord placed in same pattern; insert after it.
      let insertAt = x.chords.length;
      for (let i = x.chords.length - 1; i >= 0; i--) {
        if (x.chords[i].progressionPlacement?.patternId === patternId) {
          insertAt = i + 1;
          break;
        }
      }
      const next = [...x.chords];
      next.splice(insertAt, 0, sectionChord);
      return { ...x, chords: next };
    });

    // Suppress unused warning on atBeat (free-form per-view metadata, not respected for SSOT placement).
    void atBeat;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, progression: nextProgression, [SSOT_MODE]: true } as any);
  }),

  updatePatternChord: (patternId, chordId, patch) => set((s) => {
    let mirrorAnchorId: string | undefined;
    let newChord: ChordSymbol | undefined;

    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const chords = p.chords.map((c) => {
        if (c.id !== chordId) return c;
        mirrorAnchorId = c.mirrorId;
        const next = { ...c, ...patch };
        next.lengthBeats = Math.max(0.5, next.lengthBeats);
        if (patch.chord) newChord = patch.chord;
        return next;
      });
      return { ...p, chords: repackChords(chords, totalBeats) };
    });

    // Mirror chord-quality changes to the anchor (length/position are pattern-only)
    const sections = (mirrorAnchorId && newChord)
      ? s.sections.map((sec) => {
          if (sec.id !== patternId) return sec;
          return {
            ...sec,
            lines: sec.lines.map((l) => ({
              ...l,
              chords: l.chords.map((a) => (a.id === mirrorAnchorId ? { ...a, chord: newChord! } : a)),
            })),
          };
        })
      : s.sections;

    return { progression, sections };
  }),

  // SSOT-first: chordId === SectionChord.id. Mutate that chord's
  // progressionPlacement.lengthBeats; mirror derivation re-packs startBeats.
  setPatternChordLength: (patternId, chordId, lengthBeats) => set((s) => {
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const totalBeats = pattern.bars * pattern.beatsPerBar;
    const sections = s.sections.map((sec) => {
      if (!sec.chords.some((sc) => sc.id === chordId && sc.progressionPlacement?.patternId === patternId)) return sec;
      const othersSum = sec.chords.reduce((sum, sc) => {
        if (sc.id === chordId) return sum;
        const pp = sc.progressionPlacement;
        return pp && pp.patternId === patternId ? sum + pp.lengthBeats : sum;
      }, 0);
      const maxForThis = Math.max(0.5, totalBeats - othersSum);
      const clamped = Math.max(0.5, Math.min(lengthBeats, maxForThis));
      return {
        ...sec,
        chords: sec.chords.map((sc) =>
          sc.id !== chordId || !sc.progressionPlacement
            ? sc
            : { ...sc, progressionPlacement: { ...sc.progressionPlacement, lengthBeats: clamped } },
        ),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }),

  resizePatternChordsWithOverflow: (patternId, chordIds, deltaBeats) => set((s) => {
    if (!chordIds.length || deltaBeats === 0) return {};
    const sourcePattern = s.progression.find((p) => p.id === patternId);
    if (!sourcePattern) return {};
    const sectionId = sourcePattern.sectionId;
    const sectionPatterns = s.progression.filter((p) => p.sectionId === sectionId);
    const sourceIdx = sectionPatterns.findIndex((p) => p.id === patternId);

    // 1) Apply delta to each selected chord (clamp to >= 0.5).
    const idSet = new Set(chordIds);
    const grown = sourcePattern.chords.map((c) =>
      idSet.has(c.id) ? { ...c, lengthBeats: Math.max(0.5, c.lengthBeats + deltaBeats) } : c,
    );
    const sortedGrown = [...grown].sort((a, b) => a.startBeat - b.startBeat);

    // 2) Re-pack left-to-right; anything that doesn't fit overflows.
    const totalBeats = sourcePattern.bars * sourcePattern.beatsPerBar;
    const fitted: PatternChord[] = [];
    const overflow: PatternChord[] = [];
    let cursor = 0;
    for (const c of sortedGrown) {
      const remaining = totalBeats - cursor;
      if (remaining <= 0) {
        overflow.push({ ...c });
        continue;
      }
      if (c.lengthBeats <= remaining + 1e-9) {
        fitted.push({ ...c, startBeat: cursor });
        cursor += c.lengthBeats;
      } else {
        // Split: fit a prefix in this block, overflow the rest as a new chord.
        // To keep the model simple we drop the prefix and push the FULL chord
        // to the next block (preserves chord identity & mirrorId).
        overflow.push({ ...c });
      }
    }

    // 3) Build new section pattern list, distributing overflow into subsequent blocks.
    const newPatterns: PatternBlock[] = sectionPatterns.map((p) => p);
    newPatterns[sourceIdx] = { ...sourcePattern, chords: fitted };

    let pending = overflow;
    for (let i = sourceIdx + 1; i < newPatterns.length && pending.length > 0; i++) {
      const blk = newPatterns[i];
      const cap = blk.bars * blk.beatsPerBar;
      // Prepend pending chords, then push existing chords right, repack, and
      // any new overflow continues to the next block.
      const merged = [
        ...pending.map((c) => ({ ...c })),
        ...blk.chords.map((c) => ({ ...c })),
      ];
      // Re-sequence sequentially (ignore startBeat) since we're prepending.
      let cur = 0;
      const fit2: PatternChord[] = [];
      const over2: PatternChord[] = [];
      for (const c of merged) {
        const remaining = cap - cur;
        if (remaining <= 0) { over2.push(c); continue; }
        if (c.lengthBeats <= remaining + 1e-9) {
          fit2.push({ ...c, startBeat: cur });
          cur += c.lengthBeats;
        } else {
          over2.push(c);
        }
      }
      newPatterns[i] = { ...blk, chords: fit2 };
      pending = over2;
    }

    // 4) If still overflowing, append a new block at end of section to absorb it.
    if (pending.length > 0) {
      const lastInSection = newPatterns[newPatterns.length - 1];
      const newId = nanoid();
      const cap = (lastInSection?.bars ?? 4) * (lastInSection?.beatsPerBar ?? 4);
      let cur = 0;
      const fit3: PatternChord[] = [];
      for (const c of pending) {
        const remaining = cap - cur;
        if (remaining <= 0) break;
        const len = Math.min(c.lengthBeats, remaining);
        fit3.push({ ...c, startBeat: cur, lengthBeats: len });
        cur += len;
      }
      const newBlock: PatternBlock = {
        id: newId,
        sectionId,
        label: `${lastInSection?.label ?? "Pattern"} +`,
        bars: lastInSection?.bars ?? 4,
        beatsPerBar: lastInSection?.beatsPerBar ?? 4,
        chords: fit3,
      };
      newPatterns.push(newBlock);
    }

    // 5) Splice the rebuilt section back into the global progression in place,
    //    preserving original positions of other-section blocks.
    const sectionBlockIds = new Set(sectionPatterns.map((p) => p.id));
    const rebuilt: PatternBlock[] = [];
    let inserted = false;
    for (const p of s.progression) {
      if (sectionBlockIds.has(p.id)) {
        if (!inserted) {
          rebuilt.push(...newPatterns);
          inserted = true;
        }
        // skip — already added via newPatterns
      } else {
        rebuilt.push(p);
      }
    }
    if (!inserted) rebuilt.push(...newPatterns);

    return { progression: rebuilt };
  }),

  reorderPatternChord: (patternId, chordId, toIndex) => set((s) => {
    // SSOT-first: reorder SectionChord entries bound to this pattern; derive mirrors.
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};
    const inPattern = sec.chords.filter((c) => c.progressionPlacement?.patternId === patternId);
    const fromIdx = inPattern.findIndex((c) => c.id === chordId);
    if (fromIdx < 0) return {};
    let insertAt = Math.max(0, Math.min(inPattern.length, toIndex));
    if (toIndex > fromIdx) insertAt = Math.max(0, insertAt - 1);
    const reordered = [...inPattern];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(insertAt, 0, moved);
    // Splice these back into section.chords positions originally occupied by `inPattern`.
    const slotIndices: number[] = [];
    sec.chords.forEach((c, i) => {
      if (c.progressionPlacement?.patternId === patternId) slotIndices.push(i);
    });
    const nextSections = s.sections.map((x) => {
      if (x.id !== sectionId) return x;
      const next = [...x.chords];
      slotIndices.forEach((origIdx, k) => {
        next[origIdx] = reordered[k];
      });
      return { ...x, chords: next };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, [SSOT_MODE]: true } as any);
  }),

  movePatternChordToPatternAt: (fromPatternId, toPatternId, chordId, toIndex) => set((s) => {
    if (fromPatternId === toPatternId) {
      const progression = s.progression.map((p) => {
        if (p.id !== fromPatternId) return p;
        const totalBeats = p.bars * p.beatsPerBar;
        const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
        const fromIdx = sorted.findIndex((c) => c.id === chordId);
        if (fromIdx < 0) return p;
        const [moved] = sorted.splice(fromIdx, 1);
        let insertAt = Math.max(0, Math.min(sorted.length, toIndex));
        if (toIndex > fromIdx) insertAt = Math.max(0, insertAt - 1);
        sorted.splice(insertAt, 0, moved);
        let cursor = 0;
        const reseq = sorted.map((c) => {
          const next = { ...c, startBeat: cursor };
          cursor += c.lengthBeats;
          return next;
        });
        return { ...p, chords: repackChords(reseq, totalBeats) };
      });
      const updatedPattern = progression.find((p) => p.id === fromPatternId);
      const sections = updatedPattern ? syncAnchorsFromPattern(s.sections, updatedPattern) : s.sections;
      return { progression, sections };
    }
    const fromPattern = s.progression.find((p) => p.id === fromPatternId);
    const toPattern = s.progression.find((p) => p.id === toPatternId);
    if (!fromPattern || !toPattern) return s;
    const moving = fromPattern.chords.find((c) => c.id === chordId);
    if (!moving) return s;
    const mirrorAnchorId = moving.mirrorId;
    const detached: PatternChord = { ...moving, mirrorId: undefined };

    const progression = s.progression.map((p) => {
      if (p.id === fromPatternId) {
        const totalBeats = p.bars * p.beatsPerBar;
        return { ...p, chords: repackChords(p.chords.filter((c) => c.id !== chordId), totalBeats) };
      }
      if (p.id === toPatternId) {
        const totalBeats = p.bars * p.beatsPerBar;
        const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
        const insertAt = Math.max(0, Math.min(sorted.length, toIndex));
        sorted.splice(insertAt, 0, detached);
        const othersSum = sorted.reduce((sum, c) => sum + (c.id === detached.id ? 0 : c.lengthBeats), 0);
        const maxForMoved = Math.max(0.5, totalBeats - othersSum);
        const clamped = sorted.map((c) =>
          c.id === detached.id ? { ...c, lengthBeats: Math.min(c.lengthBeats, maxForMoved) } : c,
        );
        return { ...p, chords: repackChords(clamped, totalBeats) };
      }
      return p;
    });

    const sections = mirrorAnchorId
      ? s.sections.map((sec) => sec.id !== fromPatternId ? sec : {
          ...sec,
          lines: sec.lines.map((l) => ({ ...l, chords: l.chords.filter((a) => a.id !== mirrorAnchorId) })),
        })
      : s.sections;

    return { progression, sections };
  }),

  movePatternChordToSlot: (patternId, chordId, slotIndex) => {
    get().reorderPatternChord(patternId, chordId, Math.max(0, slotIndex));
  },

  movePatternChordsToSlot: (patternId, chordIds, slotIndex) => set((s) => {
    pushHistory(get);
    const idSet = new Set(chordIds);
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const moving = sorted.filter((c) => idSet.has(c.id));
      const others = sorted.filter((c) => !idSet.has(c.id));
      const target = Math.max(0, Math.min(others.length, slotIndex));
      const next = [...others.slice(0, target), ...moving, ...others.slice(target)];
      let cursor = 0;
      const reseq = next.map((c) => {
        const out = { ...c, startBeat: cursor };
        cursor += c.lengthBeats;
        return out;
      });
      return { ...p, chords: repackChords(reseq, totalBeats) };
    });
    const updated = progression.find((p) => p.id === patternId);
    const sections = updated ? syncAnchorsFromPattern(s.sections, updated) : s.sections;
    return { progression, sections };
  }),

  // SSOT-first: add a SectionChord assigned to this pattern (or a sibling
  // pattern with room / a fresh continuation block), placed at slotIndex
  // within the pattern's chord order.
  addChordToPatternSlot: (patternId, chord, slotIndex) => {
    pushHistory(get);
    set((s) => {
      const target = s.progression.find((p) => p.id === patternId);
      if (!target) return {};
      const sectionId = target.sectionId ?? target.id;
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};

      const newId = nanoid();
      // placeSectionChordInProgression handles "no room → walk to next block
      // → spawn continuation". It picks the first pattern in section order
      // with room. To honor the requested patternId when it has room, we
      // pre-check capacity here.
      const defaultLen = getDefaults().defaultChordLengthBeats;
      const totalBeats = target.bars * target.beatsPerBar;
      const usedInTarget = sec.chords.reduce((sum, sc) => {
        const pp = sc.progressionPlacement;
        return pp && pp.patternId === patternId ? sum + pp.lengthBeats : sum;
      }, 0);
      const freeInTarget = totalBeats - usedInTarget;

      let placement: { progression: PatternBlock[]; sectionChord: SectionChord };
      if (freeInTarget + 1e-9 >= 0.5) {
        const placedLen = Math.min(defaultLen, freeInTarget);
        placement = {
          progression: s.progression,
          sectionChord: {
            id: newId,
            chord,
            progressionPlacement: { patternId, startBeat: usedInTarget, lengthBeats: placedLen },
          },
        };
      } else {
        placement = placeSectionChordInProgression(
          s.progression,
          sectionId,
          sec.chords,
          chord,
          newId,
          undefined,
        );
      }

      // Insert the new SectionChord such that, among same-pattern chords,
      // it sits at slotIndex. Other-pattern chords keep their relative order.
      const targetPatternId = placement.sectionChord.progressionPlacement?.patternId;
      const samePatternIds = sec.chords
        .filter((sc) => sc.progressionPlacement?.patternId === targetPatternId)
        .map((sc) => sc.id);
      const idx = Math.max(0, Math.min(samePatternIds.length, slotIndex));
      const anchorBeforeId = idx === 0 ? null : samePatternIds[idx - 1];

      const nextChords: SectionChord[] = [];
      let inserted = false;
      if (anchorBeforeId === null) {
        // Insert before the first same-pattern chord (or at end if none).
        for (const sc of sec.chords) {
          if (!inserted && sc.progressionPlacement?.patternId === targetPatternId) {
            nextChords.push(placement.sectionChord);
            inserted = true;
          }
          nextChords.push(sc);
        }
        if (!inserted) nextChords.push(placement.sectionChord);
      } else {
        for (const sc of sec.chords) {
          nextChords.push(sc);
          if (!inserted && sc.id === anchorBeforeId) {
            nextChords.push(placement.sectionChord);
            inserted = true;
          }
        }
        if (!inserted) nextChords.push(placement.sectionChord);
      }

      const nextSections = s.sections.map((x) =>
        x.id !== sectionId ? x : { ...x, chords: nextChords },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({
        sections: nextSections,
        progression: placement.progression,
        [SSOT_MODE]: true,
      } as any);
    });
  },

  removePatternChord: (patternId, chordId) => set((s) => {
    // SSOT-first: chordId === SectionChord.id. Drop the SectionChord; mirrors derive.
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const nextSections = s.sections.map((sec) =>
      sec.id !== sectionId ? sec : { ...sec, chords: sec.chords.filter((c) => c.id !== chordId) },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, [SSOT_MODE]: true } as any);
  }),

  movePatternChord: (patternId, chordId, direction) => set((s) => {
    // SSOT-first: reorder within the SectionChord array (only those bound to
    // this pattern), then derive mirrors. Identity is preserved (id stable).
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};
    const inPattern = sec.chords.filter((c) => c.progressionPlacement?.patternId === patternId);
    const idx = inPattern.findIndex((c) => c.id === chordId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= inPattern.length) return {};
    // Swap order WITHIN section.chords, preserving relative positions of chords from other patterns.
    const a = inPattern[idx];
    const b = inPattern[swapWith];
    const nextSections = s.sections.map((x) => {
      if (x.id !== sectionId) return x;
      // Build new list: walk original; when we hit one of the two swapped, emit the other.
      const next = x.chords.map((c) => (c.id === a.id ? b : c.id === b.id ? a : c));
      return { ...x, chords: next };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, [SSOT_MODE]: true } as any);
  }),

  removePatternChordsBatch: (patternId, chordIds) => set((s) => {
    const idSet = new Set(chordIds);
    const mirrorAnchorIds = new Set<string>();
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      p.chords.forEach((c) => { if (idSet.has(c.id) && c.mirrorId) mirrorAnchorIds.add(c.mirrorId); });
      return { ...p, chords: repackChords(p.chords.filter((c) => !idSet.has(c.id)), totalBeats) };
    });
    const sections = mirrorAnchorIds.size
      ? s.sections.map((sec) => sec.id !== patternId ? sec : {
          ...sec,
          lines: sec.lines.map((l) => ({ ...l, chords: l.chords.filter((a) => !mirrorAnchorIds.has(a.id)) })),
        })
      : s.sections;
    return { progression, sections };
  }),

  shiftPatternChords: (patternId, chordIds, deltaBeats) => set((s) => {
    const idSet = new Set(chordIds);
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const dir = deltaBeats > 0 ? 1 : -1;
      const indices = sorted
        .map((c, i) => idSet.has(c.id) ? i : -1)
        .filter((i) => i >= 0);
      const order = dir > 0 ? indices.slice().reverse() : indices.slice();
      const arr = [...sorted];
      for (const i of order) {
        const j = i + dir;
        if (j < 0 || j >= arr.length) continue;
        if (idSet.has(arr[j].id)) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return { ...p, chords: repackChords(arr, totalBeats) };
    });
    const updatedPattern = progression.find((p) => p.id === patternId);
    const sections = updatedPattern ? syncAnchorsFromPattern(s.sections, updatedPattern) : s.sections;
    return { progression, sections };
  }),

  movePatternChordsTo: (fromPatternId, toPatternId, chordIds) => set((s) => {
    if (fromPatternId === toPatternId) return s;
    const idSet = new Set(chordIds);
    const fromPattern = s.progression.find((p) => p.id === fromPatternId);
    const toPattern = s.progression.find((p) => p.id === toPatternId);
    if (!fromPattern || !toPattern) return s;
    const moving = fromPattern.chords.filter((c) => idSet.has(c.id));
    if (!moving.length) return s;
    const mirrorAnchorIds = new Set(moving.map((c) => c.mirrorId).filter(Boolean) as string[]);

    let target: PatternBlock = { ...toPattern, chords: [...toPattern.chords] };
    let cursor = target.chords.length
      ? Math.max(...target.chords.map((c) => c.startBeat + c.lengthBeats))
      : 0;
    for (const m of moving) {
      let total = target.bars * target.beatsPerBar;
      if (cursor + m.lengthBeats > total) {
        const neededBars = Math.min(32, Math.ceil((cursor + m.lengthBeats) / target.beatsPerBar));
        target = { ...target, bars: neededBars };
        total = target.bars * target.beatsPerBar;
      }
      const start = Math.min(cursor, total - 1);
      const len = Math.max(1, Math.min(m.lengthBeats, total - start));
      target.chords.push({ id: m.id, chord: m.chord, startBeat: start, lengthBeats: len, mirrorId: undefined });
      cursor = start + len;
    }
    target.chords = repackChords(target.chords, target.bars * target.beatsPerBar);

    const progression = s.progression.map((p) => {
      if (p.id === fromPatternId) {
        const totalBeats = p.bars * p.beatsPerBar;
        return { ...p, chords: repackChords(p.chords.filter((c) => !idSet.has(c.id)), totalBeats) };
      }
      if (p.id === toPatternId) return target;
      return p;
    });

    const sections = mirrorAnchorIds.size
      ? s.sections.map((sec) => sec.id !== fromPatternId ? sec : {
          ...sec,
          lines: sec.lines.map((l) => ({ ...l, chords: l.chords.filter((a) => !mirrorAnchorIds.has(a.id)) })),
        })
      : s.sections;

    return { progression, sections };
  }),

  addPatternToSection: (sectionId) => {
    const newId = nanoid();
    let createdId = newId;
    set((s) => {
      const blocks = s.progression.filter((p) => (p.sectionId ?? p.id) === sectionId);
      if (!blocks.length) return s;
      const ref = blocks[blocks.length - 1];
      const newBlock: PatternBlock = {
        id: newId,
        sectionId,
        label: ref.label,
        bars: getDefaults().defaultPatternBars,
        beatsPerBar: ref.beatsPerBar,
        chords: [],
      };
      const lastIdx = s.progression.lastIndexOf(ref);
      const progression = [
        ...s.progression.slice(0, lastIdx + 1),
        newBlock,
        ...s.progression.slice(lastIdx + 1),
      ];
      return { progression };
    });
    return createdId;
  },
  removePatternBlock: (patternId) => set((s) => {
    const target = s.progression.find((p) => p.id === patternId);
    if (!target) return s;
    const sid = target.sectionId ?? target.id;
    const siblings = s.progression.filter((p) => (p.sectionId ?? p.id) === sid);
    if (siblings.length <= 1) return s; // can't remove the only block
    // Detach mirror anchors that pointed into this block.
    const mirrorIds = new Set(target.chords.map((c) => c.mirrorId).filter(Boolean) as string[]);
    const sections = mirrorIds.size
      ? s.sections.map((sec) => sec.id !== sid ? sec : {
          ...sec,
          lines: sec.lines.map((l) => ({
            ...l,
            chords: l.chords.map((a) => mirrorIds.has(a.mirrorId ?? "") ? { ...a, mirrorId: undefined } : a),
          })),
        })
      : s.sections;
    return { sections, progression: s.progression.filter((p) => p.id !== patternId) };
  }),
  // SSOT-first: swap `chord` on SectionChords assigned to this pattern, in
  // section.chords order (which is the SSOT order). Lengths/placements are
  // preserved. Note: under SSOT the lyric mirror updates too — that's
  // correct since the SectionChord is the unified identity.
  replacePatternChords: (patternId, chords) => set((s) => {
    const target = s.progression.find((p) => p.id === patternId);
    if (!target) return {};
    const sectionId = target.sectionId ?? target.id;
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      let i = 0;
      return {
        ...sec,
        chords: sec.chords.map((sc) => {
          if (sc.progressionPlacement?.patternId !== patternId) return sc;
          const swap = chords[i++];
          return swap ? { ...sc, chord: swap } : sc;
        }),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }),

  // ---- chord-row undo/redo ----
  undo: () => {
    if (!undoStack.length) return false;
    const cur = get();
    const prev = undoStack.pop()!;
    redoStack.push(snapshot(cur));
    if (redoStack.length > HISTORY_LIMIT) redoStack.shift();
    set({ sections: prev.sections, progression: prev.progression });
    return true;
  },
  redo: () => {
    if (!redoStack.length) return false;
    const cur = get();
    const next = redoStack.pop()!;
    undoStack.push(snapshot(cur));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    set({ sections: next.sections, progression: next.progression });
    return true;
  },
  canUndo: () => undoStack.length > 0,
  canRedo: () => redoStack.length > 0,

  loadFromJSON: (data) => {
    // Loading a project clears history.
    undoStack.length = 0;
    redoStack.length = 0;
    const parsed = data as any;
    if (!parsed) return;

    // v1 (lyrics: LyricLine[]) → v2 migration: wrap lines in a single Verse section.
    if (parsed.version === 1 && Array.isArray(parsed.lyrics)) {
      const v1Progression = (parsed as any).progression as PatternBlock[] | undefined;
      const sectionId = nanoid();
      const section: Section = {
        id: sectionId,
        type: "verse",
        label: "Verse",
        collapsed: false,
        lines: parsed.lyrics.length ? parsed.lyrics : [initialLine()],
        chords: [],
      };
      // Take first v1 pattern (if any) and bind its id to the new section.
      const firstPattern: PatternBlock = v1Progression?.[0]
        ? { ...v1Progression[0], id: sectionId, label: "Verse" }
        : { id: sectionId, label: "Verse", bars: 4, beatsPerBar: 4, chords: [] };
      // any extra v1 patterns become their own bare sections
      const extras = (v1Progression?.slice(1) ?? []).map((p, i) => {
        const sid = nanoid();
        const sec: Section = { id: sid, type: "custom", label: p.label || `Section ${i + 2}`, collapsed: false, lines: [initialLine()], chords: [] };
        const pat: PatternBlock = { ...p, id: sid };
        return { sec, pat };
      });
      set({
        meta: { beatsPerBar: 4, beatUnit: 4, ...(parsed.meta ?? get().meta) },
        sections: [section, ...extras.map((e) => e.sec)],
        progression: [firstPattern, ...extras.map((e) => e.pat)],
        basket: [],
      });
      return;
    }

    if (parsed.version !== 2 && parsed.version !== 3) return;
    const sectionsRaw: Section[] = parsed.sections?.length ? parsed.sections : [makeSection().section];
    // Migrate every line so each anchor has a unique slotIndex (derived from wordIndex / order).
    // Also ensure `chords: []` exists (the wrapped set will recompute the SSOT projection).
    const sectionsLoaded: Section[] = sectionsRaw.map((sec) => ({
      ...sec,
      lines: sec.lines.map((l) => ensureSlotsForLine(l)),
      chords: sec.chords ?? [],
    }));
    const progressionLoaded: PatternBlock[] = parsed.progression?.length ? parsed.progression : [makeSection().pattern];
    // Migrate legacy patterns: if no sectionId, fall back to id (1:1 pairing).
    const migratedProgression = progressionLoaded.map((p) => ({
      ...p,
      sectionId: p.sectionId ?? p.id,
      chords: repackChords(p.chords, p.bars * p.beatsPerBar),
    }));
    set({
      meta: { beatsPerBar: 4, beatUnit: 4, ...(parsed.meta ?? get().meta) },
      sections: sectionsLoaded,
      progression: migratedProgression,
      basket: [],
      suppressCrossTabDeleteWarning: !!parsed.suppressCrossTabDeleteWarning,
    });
    // Sound settings live in their own store but travel with the song JSON.
    useSoundStore.getState().loadFrom(parsed.sound);
  },
  toJSON: () => {
    const s = get();
    return {
      version: 3,
      meta: s.meta,
      sections: s.sections,
      progression: s.progression,
      suppressCrossTabDeleteWarning: s.suppressCrossTabDeleteWarning,
      sound: useSoundStore.getState().toJSON(),
    };
  },
  };
});

// ---- localStorage autosave ----
const STORAGE_KEY = "songwriters-notebook:v1";

export function hydrateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    useSongStore.getState().loadFromJSON(data);
  } catch { /* ignore */ }
}

export function startAutosave() {
  return useSongStore.subscribe((state) => {
    try {
      const json = state.toJSON();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
    } catch { /* quota etc */ }
  });
}

// ---- File save / load ----
export function downloadProjectJSON(filename = "song.json") {
  const data = useSongStore.getState().toJSON();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function loadProjectFromFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        useSongStore.getState().loadFromJSON(data);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
