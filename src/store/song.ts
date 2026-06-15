import { create } from "zustand";
import { nanoid } from "nanoid";
import { ChordSymbol, transposeChord, transposeKey, Mode, parseChord, rootToPc } from "@/lib/music/chords";
import { usePlaybackStore } from "@/store/playback";
import { useSoundStore, type SoundSettings } from "@/store/sound";
import { useAppTintStore } from "@/store/appTint";
import { useAppBackgroundStore, PATTERN_KEYS, MASK_KEYS, type BackgroundPattern, type MaskStyle } from "@/store/appBackground";
import { SECTION_COLOR_KEYS, type SectionColor } from "@/components/section/SectionColorPicker";
import { getDefaults } from "@/store/defaults";
import { formatChordsAndLyrics } from "@/lib/music/chordLayout";
import { pushRecent } from "@/lib/recent-projects";
import { notifyStorageQuota } from "@/lib/storage-quota";
import { toast } from "sonner";

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
  /**
   * Auto-layout: when true, this line was synthesized by the chord-overflow
   * pass to host chords that didn't fit on the parent lyric line at the
   * current viewport. Renderers may show a subtle indicator. Persisted.
   */
  _isChordOverflow?: boolean;
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
  /** When false, this section plays as block chords even if the global arp is on. Default true. */
  arpArmed?: boolean;
  /**
   * Optional semitone offset relative to song.meta.keyRoot. Undefined means
   * the section inherits the running offset from earlier sections (running-key
   * model). 0 explicitly resets to song key.
   */
  keyChangeRootOffset?: number;
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
  /**
   * Crop-to-fit override: the block's *effective* played length in beats,
   * independent of its `bars × beatsPerBar` capacity. When set, playback uses
   * this duration (so the playhead jumps to the next block sooner) and the
   * grid is drawn shrunk to it. Absent = play the full capacity.
   */
  playBeats?: number;
  chords: PatternChord[];
}

/**
 * A block's effective played length in beats. Honors the crop-to-fit
 * `playBeats` override (clamped to capacity); otherwise the full
 * `bars × beatsPerBar`. Use for timeline/offset math — NOT for chord-capacity
 * checks, which always use the full capacity.
 */
export function patternPlayBeats(p: PatternBlock): number {
  const cap = p.bars * p.beatsPerBar;
  return p.playBeats != null ? Math.min(Math.max(0, p.playBeats), cap) : cap;
}

export interface BasketItem {
  id: string;
  chord: ChordSymbol;
}

export interface InspirationPhoto {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
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
  inspirationPhotos: InspirationPhoto[];
  addInspirationPhoto: (photo: InspirationPhoto) => void;
  removeInspirationPhoto: (id: string) => void;
  moveInspirationPhoto: (id: string, x: number, y: number) => void;

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
  setSectionArpArmed: (id: string, armed: boolean) => void;
  setSectionKeyChangeOffset: (id: string, offset: number | undefined) => void;
  /** Wipe all song state and replace with a single empty verse section (factory reset). */
  resetSong: () => void;

  // ---- lyrics (line-level) ----
  addLine: (sectionId: string, afterId?: string) => string;
  removeLine: (sectionId: string, id: string) => void;
  setLineText: (sectionId: string, id: string, text: string) => void;
  /** Split a lyric line at `caretIndex`: text before stays, text after (and its
   *  chords) moves to a new line inserted below. Returns the new line's id. */
  splitLine: (sectionId: string, id: string, caretIndex: number) => { newLineId: string } | null;
  /** Merge a lyric line onto the END of the previous line (text + chords).
   *  Returns the previous line's id and the caret index at the join. */
  mergeLineUp: (sectionId: string, id: string) => { prevLineId: string; caretIndex: number } | null;
  /** Record the active lyric caret so undo/redo can restore it. */
  noteLyricCaret: (sectionId: string, lineId: string, caret: number) => void;
  setChordRowLen: (sectionId: string, id: string, len: number) => void;
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
  /** Snap each chord in a line to the closest unused word, preserving overall order. */
  formatChordsInLine: (sectionId: string, lineId: string) => void;
  /** Run formatChordsInLine on every line of every section. */
  formatChordsInSong: () => void;
  /**
   * A4: re-split lyric lines to fit the viewport and repack chord positions
   * left-to-right. Pure positional re-layout (no chord identity changes).
   */
  autoLayoutSection: (sectionId: string, screenWidth: number, slotWidth?: number) => { changed: boolean; reason?: string; overflowRowsAdded?: number; residualOverflow?: number };
  /** Place a new chord into a specific slot. If occupied, walk right (then left) to nearest free slot. Returns the actual placement (or null if dropped). */
  placeChordInSlot: (sectionId: string, lineId: string, slotIndex: number, chord: ChordSymbol) => { id: string; lineId: string; slotIndex: number } | null;
  /** Move an existing anchor to a slot in the same row. Swap with occupant if any. */
  moveChordToSlot: (sectionId: string, lineId: string, anchorId: string, slotIndex: number) => void;
  /** Move a set of anchors to a different row, starting at dropSlot, pushing collisions right. */
  moveChordsAcrossLines: (
    fromSectionId: string, fromLineId: string,
    toSectionId: string, toLineId: string,
    anchorIds: string[], dropSlot: number,
  ) => void;
  /**
   * Move chord anchors to the chord row directly above/below in the lyrics
   * view. At a section's first row, up crosses to the previous section's last
   * row; at the last row, down crosses to the next section's first row
   * (single press). Moved chords are appended after the target row's existing
   * chords; a new row is created if the adjacent section has none. Returns
   * whether the move spawned a new pattern block (so the caller can toast).
   */
  moveChordsToAdjacentRow: (
    sourceSectionId: string, sourceLineId: string,
    anchorIds: string[], direction: -1 | 1,
  ) => { moved: boolean; createdBlock: boolean; movedIds: string[]; targetSectionId?: string; targetLineId?: string };

  // ---- basket (deprecated: superseded by preset browser + copy/paste chords) ----
  /** @deprecated basket UI was retired; field retained for transitive references. */
  addToBasket: (chords: ChordSymbol[]) => void;
  /** @deprecated */
  removeFromBasket: (id: string) => void;
  /** @deprecated */
  clearBasket: () => void;

  // ---- progression (binding-aware) ----
  updatePattern: (id: string, patch: Partial<Pick<PatternBlock, "bars" | "beatsPerBar">>) => void;
  /** Crop a block to a played length (beats), or pass null to restore full length. */
  setPatternPlayBeats: (id: string, playBeats: number | null) => void;
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
  bulkSetChordOctave: (patternId: string, chordIds: string[], octave: number) => void;
  reorderPatternChord: (patternId: string, chordId: string, toIndex: number) => void;
  movePatternChordToPatternAt: (fromPatternId: string, toPatternId: string, chordId: string, toIndex: number) => void;
  /** Slot-based: reorder a chord (or group of chords preserving relative order) to a target slot index in the same pattern. */
  movePatternChordToSlot: (patternId: string, chordId: string, slotIndex: number) => void;
  movePatternChordsToSlot: (patternId: string, chordIds: string[], slotIndex: number) => void;
  /** Slot-based: insert a brand-new chord into a specific slot (left-packed). */
  addChordToPatternSlot: (patternId: string, chord: ChordSymbol, slotIndex: number, lengthBeatsOverride?: number) => void;
  /** Append a fresh empty pattern block to a section. Returns its id. */
  addPatternToSection: (sectionId: string) => string;
  /** Reorder a pattern block within its section (Phase 3 / Item 3). */
  reorderPatternBlockInSection: (sectionId: string, fromIndex: number, toIndex: number) => void;
  /** Remove a single pattern block. No-op if it's the only block in its section. */
  removePatternBlock: (patternId: string) => void;
  /** Replace a pattern's chords (used for variation suggestions). Lengths preserved. */
  replacePatternChords: (patternId: string, chords: ChordSymbol[]) => void;

  // ---- chord-row undo/redo ----
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Caret position to restore after an undo/redo that moved a lyric line.
   *  The lyrics editor consumes and clears it. */
  pendingCaret: { sectionId: string; lineId: string; caret: number } | null;
  clearPendingCaret: () => void;

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
  inspirationPhotos?: InspirationPhoto[];
  /** Background tint key (matches SECTION_COLOR_KEYS), or null/undefined for no tint. */
  appTint?: SectionColor | null;
  /** Background pattern and mask settings. */
  appBackground?: { pattern: BackgroundPattern; mask: MaskStyle } | null;
  /** Layout metadata captured at save time (Phase 1.5 Issue #1). */
  layoutMeta?: {
    lastEditedScreenWidth: number;
    lastEditedDevice: "mobile" | "tablet" | "desktop";
    lastEditedAt: number;
  };
}

export function getDeviceTypeForWidth(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
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

// (syncAnchorsFromPattern removed — replaced by deriveMirrorsFromSectionChords)


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
 * Insert a fresh SectionChord into a section.chords array at the position
 * that matches its lyricsPlacement (line index then slotIndex). Without
 * this, callers like `placeChordInSlot` that just append the new chord
 * would have it placed at the LAST occupied slot on the line — because
 * `recomputeLyricsSlotsForSection` walks the SSOT array and pairs sorted-
 * ascending slot indices with SSOT-array order. Tapping empty slot 3
 * would land the chord at whatever the line's last-occupied slot was.
 *
 * Progression-only chords (no lyricsPlacement) are skipped during the
 * walk so they don't influence ordering. A new chord with no
 * lyricsPlacement is appended at the tail.
 */
function insertSectionChordAtSlot(
  chords: SectionChord[],
  newChord: SectionChord,
  lines: LyricLine[],
): SectionChord[] {
  const lp = newChord.lyricsPlacement;
  if (!lp) return [...chords, newChord];

  const lineIdx = new Map<string, number>();
  lines.forEach((l, i) => lineIdx.set(l.id, i));
  const newLineIdx = lineIdx.get(lp.lineId) ?? Number.MAX_SAFE_INTEGER;

  // Find the last index whose chord logically comes BEFORE the new one
  // (earlier line, or same line with smaller slot). Insert right after.
  let lastBeforeIdx = -1;
  for (let i = 0; i < chords.length; i++) {
    const lp2 = chords[i].lyricsPlacement;
    if (!lp2) continue;
    const otherLineIdx = lineIdx.get(lp2.lineId) ?? Number.MAX_SAFE_INTEGER;
    if (otherLineIdx < newLineIdx) {
      lastBeforeIdx = i;
    } else if (otherLineIdx === newLineIdx && (lp2.slotIndex ?? 0) < lp.slotIndex) {
      lastBeforeIdx = i;
    }
  }
  const insertAt = lastBeforeIdx + 1;
  return [...chords.slice(0, insertAt), newChord, ...chords.slice(insertAt)];
}

/**
 * Reassigns `lyricsPlacement.slotIndex` on every SectionChord so the lyric
 * row reflects the SSOT array order, while preserving the SET of occupied
 * slot positions per line.
 *
 * Why: lyrics-side reorders update `slotIndex` directly, but progression-
 * side reorders only shuffle the SSOT array. Without this pass the lyric
 * row would render in stale order (the bug the user reported). Running
 * this at the entry of `deriveMirrorsFromSectionChords` means every SSOT
 * mutation — past and future — gets the sync for free.
 *
 * Algorithm (per line):
 *  1. Walk `section.chords` in array order, collecting the chords whose
 *     `lyricsPlacement.lineId === line.id`.
 *  2. Collect their CURRENT slot indices (defined → those values; missing
 *     → fall back to a synthesized 0..n sequence).
 *  3. Sort the slot list ascending; reassign so the i-th chord in SSOT
 *     order gets the i-th slot. The footprint of occupied columns is
 *     unchanged — only which chord sits at each gets swapped.
 *
 * Idempotent: if SSOT order already matches slot order, the per-chord
 * assignment yields the same value and the section object is returned
 * unchanged (no React re-renders triggered downstream).
 */
function recomputeLyricsSlotsForSection(section: Section): Section {
  const byLine = new Map<string, SectionChord[]>();
  for (const sc of section.chords) {
    const lp = sc.lyricsPlacement;
    if (!lp) continue;
    const bucket = byLine.get(lp.lineId);
    if (bucket) bucket.push(sc);
    else byLine.set(lp.lineId, [sc]);
  }
  if (byLine.size === 0) return section;

  // Build per-chord target slot map. We only mutate chords whose target
  // differs from their current slotIndex, so unchanged inputs short-circuit.
  const newSlot = new Map<string, number>();
  let changed = false;
  for (const [, chordsOnLine] of byLine) {
    if (chordsOnLine.length <= 1) continue; // single chord can't be re-ordered
    const slots = chordsOnLine
      .map((sc, i) => sc.lyricsPlacement?.slotIndex ?? i)
      .slice()
      .sort((a, b) => a - b);
    chordsOnLine.forEach((sc, i) => {
      const cur = sc.lyricsPlacement?.slotIndex;
      const next = slots[i];
      if (cur !== next) {
        newSlot.set(sc.id, next);
        changed = true;
      }
    });
  }
  if (!changed) return section;

  return {
    ...section,
    chords: section.chords.map((sc) => {
      const target = newSlot.get(sc.id);
      if (target == null || !sc.lyricsPlacement) return sc;
      return { ...sc, lyricsPlacement: { ...sc.lyricsPlacement, slotIndex: target } };
    }),
  };
}

/**
 * Guarantees lyric slot uniqueness per line. Two SectionChords sharing a
 * (lineId, slotIndex) render as overlapping chips in the Write tab — this
 * happens when a chord is moved between pattern blocks but keeps its stale
 * lyric anchor on the old row. The first chord (in section.chords order) to
 * claim a slot keeps it; each later duplicate is repaired the same way the
 * load-time orphan heal does: a block-anchored duplicate drops its lyric
 * anchor (it stays visible via the progression / Arrange views), while a
 * pure-lyric duplicate slides to the next free slot so nothing is lost.
 *
 * Idempotent: returns the input section unchanged when no collisions exist.
 */
function resolveLyricSlotCollisions(section: Section): Section {
  const firstSlots = new Map<string, Set<number>>();
  const dupIds = new Set<string>();
  for (const sc of section.chords) {
    const lp = sc.lyricsPlacement;
    if (!lp) continue;
    let s = firstSlots.get(lp.lineId);
    if (!s) { s = new Set<number>(); firstSlots.set(lp.lineId, s); }
    if (s.has(lp.slotIndex)) dupIds.add(sc.id);
    else s.add(lp.slotIndex);
  }
  if (dupIds.size === 0) return section;
  const occupied = new Map<string, Set<number>>();
  for (const [lid, s] of firstSlots) occupied.set(lid, new Set(s));
  return {
    ...section,
    chords: section.chords.map((sc) => {
      if (!dupIds.has(sc.id)) return sc;
      const lp = sc.lyricsPlacement!;
      if (sc.progressionPlacement) return { ...sc, lyricsPlacement: undefined };
      const s = occupied.get(lp.lineId)!;
      let slot = 0;
      while (s.has(slot) && slot < CHORD_ROW_SLOTS - 1) slot++;
      s.add(slot);
      return { ...sc, lyricsPlacement: { ...lp, slotIndex: slot } };
    }),
  };
}

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
  rawSection: Section,
  sectionPatterns: PatternBlock[],
): { section: Section; patterns: PatternBlock[] } {
  // Reassign lyricsPlacement.slotIndex so the lyric row follows the SSOT
  // array order. Without this, dragging a chord in ProgressionsTab would
  // shuffle the SSOT but leave stale slot indices behind, so the lyric
  // row would render in the old order.
  const section = resolveLyricSlotCollisions(recomputeLyricsSlotsForSection(rawSection));
  // 1) Rebuild line.chords from SectionChords whose lyricsPlacement matches.
  const anchorsByLine = new Map<string, ChordAnchor[]>();
  section.lines.forEach((l) => anchorsByLine.set(l.id, []));
  // Pointer self-heal: a lyricsPlacement aimed at a line that no longer exists
  // is a phantom-in-waiting — invisible in Write yet kept alive by its
  // progressionPlacement and re-rendered in Arrange. Repair it at this single
  // chokepoint (every SSOT mutation flows through here) by demoting the chord
  // to progression-only, rather than silently skipping the anchor while
  // leaving the dangling pointer in the SSOT.
  const danglingLyricIds = new Set<string>();
  for (const sc of section.chords) {
    const lp = sc.lyricsPlacement;
    if (!lp) continue;
    const bucket = anchorsByLine.get(lp.lineId);
    if (!bucket) { danglingLyricIds.add(sc.id); continue; }
    bucket.push({
      id: sc.id,
      offset: lp.slotIndex,
      slotIndex: lp.slotIndex,
      chord: sc.chord,
      mirrorId: sc.progressionPlacement ? sc.id : undefined,
    });
  }

  // 2) Rebuild each pattern's chords from SectionChords whose
  //    progressionPlacement matches that pattern. Walk SectionChords in
  //    array order (== SSOT order). Pack left-to-right within each block;
  //    when a chord doesn't fit, cascade into the next block (preserving
  //    relative order). If no remaining block has room, spawn continuation
  //    blocks at the end of the section. Reassigns SectionChord patternIds
  //    on overflow so SSOT stays in sync with mirrors.
  const defaultLen = getDefaults().defaultChordLengthBeats;
  // Mutable copy of blocks; may grow with continuation blocks on overflow.
  const blocks: PatternBlock[] = sectionPatterns.map((p) => ({ ...p, chords: [] as PatternChord[] }));
  const usage: number[] = blocks.map(() => 0);
  const indexById = new Map<string, number>(blocks.map((b, i) => [b.id, i]));
  // Track patternId reassignment for SCs that overflowed.
  const remappedPlacement = new Map<string, { patternId: string; startBeat: number; lengthBeats: number }>();

  for (const sc of section.chords) {
    const pp = sc.progressionPlacement;
    if (!pp) continue;
    const origIdx = indexById.get(pp.patternId);
    if (origIdx == null) continue; // placement points to a foreign block — ignore here
    const want = pp.lengthBeats > 0 ? pp.lengthBeats : defaultLen;
    const len = Math.max(0.5, want);
    // Find first block at or after origIdx with room.
    let placed = false;
    for (let i = origIdx; i < blocks.length; i++) {
      const cap = blocks[i].bars * blocks[i].beatsPerBar;
      if (usage[i] + len <= cap + 1e-9) {
        const start = usage[i];
        blocks[i].chords.push({
          id: sc.id,
          chord: sc.chord,
          startBeat: start,
          lengthBeats: len,
          mirrorId: sc.lyricsPlacement ? sc.id : undefined,
        });
        usage[i] = start + len;
        if (blocks[i].id !== pp.patternId || start !== pp.startBeat) {
          remappedPlacement.set(sc.id, { patternId: blocks[i].id, startBeat: start, lengthBeats: len });
        }
        placed = true;
        break;
      }
    }
    if (placed) continue;
    // Spawn a new continuation block at the end of this section's blocks.
    const ref = blocks[blocks.length - 1] ?? sectionPatterns[sectionPatterns.length - 1];
    if (!ref) continue; // no template — section has no blocks; drop placement
    const newId = nanoid();
    const newBlock: PatternBlock = {
      id: newId,
      sectionId: section.id,
      label: `${ref.label} (cont.)`,
      bars: ref.bars,
      beatsPerBar: ref.beatsPerBar,
      chords: [],
    };
    const cap = newBlock.bars * newBlock.beatsPerBar;
    const placedLen = Math.min(len, cap);
    newBlock.chords.push({
      id: sc.id,
      chord: sc.chord,
      startBeat: 0,
      lengthBeats: placedLen,
      mirrorId: sc.lyricsPlacement ? sc.id : undefined,
    });
    blocks.push(newBlock);
    usage.push(placedLen);
    indexById.set(newId, blocks.length - 1);
    remappedPlacement.set(sc.id, { patternId: newId, startBeat: 0, lengthBeats: placedLen });
  }

  // Build updated section with possibly-remapped SC placements.
  const nextSectionChords = section.chords
    .map((sc) => {
      const cleaned = danglingLyricIds.has(sc.id)
        ? { ...sc, lyricsPlacement: undefined }
        : sc;
      const np = remappedPlacement.get(sc.id);
      return np ? { ...cleaned, progressionPlacement: np } : cleaned;
    })
    // Drop chords left with no placement on either side — neither view can
    // show them, so keeping them only re-seeds the phantom problem.
    .filter((sc) => sc.lyricsPlacement || sc.progressionPlacement);
  const nextSection: Section = {
    ...section,
    chords: nextSectionChords,
    lines: section.lines.map((l) => ({
      ...l,
      chords: (anchorsByLine.get(l.id) ?? []).sort(
        (a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0),
      ),
    })),
  };

  return { section: nextSection, patterns: blocks };
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
  // Per section: ordered list of patterns (existing replacements + new continuation blocks).
  const patternsBySection = new Map<string, PatternBlock[]>();
  for (const sec of sections) {
    const sectionPatterns = progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    const derived = deriveMirrorsFromSectionChords(sec, sectionPatterns);
    nextSections.push(derived.section);
    patternsBySection.set(sec.id, derived.patterns);
  }
  // Rebuild progression: walk original order, replacing each section's blocks
  // (in their original first-appearance position) with the derived ordered list
  // (which may include newly-spawned continuation blocks).
  const placedSections = new Set<string>();
  const nextProgression: PatternBlock[] = [];
  const sectionOfBlock = new Map<string, string>();
  for (const p of progression) sectionOfBlock.set(p.id, p.sectionId ?? p.id);
  for (const p of progression) {
    const sid = sectionOfBlock.get(p.id)!;
    if (placedSections.has(sid)) continue;
    const list = patternsBySection.get(sid);
    if (list && list.length) {
      nextProgression.push(...list);
    } else {
      nextProgression.push(p);
    }
    placedSections.add(sid);
  }
  // Append blocks from sections that exist only in patternsBySection but
  // weren't represented in original progression order (defensive — shouldn't
  // happen normally).
  for (const [sid, list] of patternsBySection) {
    if (!placedSections.has(sid)) nextProgression.push(...list);
  }
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
type CaretLoc = { sectionId: string; lineId: string; caret: number };
type HistorySnapshot = { sections: Section[]; progression: PatternBlock[]; caret: CaretLoc | null };
const undoStack: HistorySnapshot[] = [];
const redoStack: HistorySnapshot[] = [];
const HISTORY_LIMIT = 50;

// Last known lyric caret, updated as the user edits. Snapshotted with history so
// undo/redo can return the caret to where the edit happened.
let lastCaret: CaretLoc | null = null;

function snapshot(s: { sections: Section[]; progression: PatternBlock[] }): HistorySnapshot {
  return {
    sections: JSON.parse(JSON.stringify(s.sections)),
    progression: JSON.parse(JSON.stringify(s.progression)),
    caret: lastCaret,
  };
}

/** History grouping: while depth > 0, only the FIRST pushHistory in the
 *  group actually snapshots. Compound actions (cut + autoLayout, paste +
 *  reflow, drag move + reflow) wrap themselves in withHistoryGroup so the
 *  user undoes the whole thing in one press. */
let historyGroupDepth = 0;
let historyGroupSnapshotted = false;

/** Call BEFORE mutating sections/progression in a chord-row action. */
// Typing coalescing: rapid setLineText calls on the same line collapse into a
// single undo step, so undo reverts a typing burst instead of one keystroke.
// Any other history point (or undo/redo) breaks the run.
let lastLineTextEdit: { key: string; at: number } | null = null;
const LINE_TEXT_COALESCE_MS = 3000;

function pushHistory(get: () => SongState) {
  lastLineTextEdit = null;
  if (historyGroupDepth > 0) {
    if (historyGroupSnapshotted) return;
    historyGroupSnapshotted = true;
  }
  const s = get();
  undoStack.push(snapshot(s));
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

/** Run `fn` so any nested pushHistory calls collapse into a single undo step. */
export function withHistoryGroup<T>(fn: () => T): T {
  const wasTop = historyGroupDepth === 0;
  historyGroupDepth++;
  if (wasTop) historyGroupSnapshotted = false;
  try {
    return fn();
  } finally {
    historyGroupDepth--;
    if (historyGroupDepth === 0) historyGroupSnapshotted = false;
  }
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
  pendingCaret: null,
  suppressCrossTabDeleteWarning: false,
  setSuppressCrossTabDeleteWarning: (v) => set({ suppressCrossTabDeleteWarning: v }),
  inspirationPhotos: [],
  addInspirationPhoto: (photo) => set((s) => ({ inspirationPhotos: [...s.inspirationPhotos, photo] })),
  removeInspirationPhoto: (id) => set((s) => ({ inspirationPhotos: s.inspirationPhotos.filter((p) => p.id !== id) })),
  moveInspirationPhoto: (id, x, y) => set((s) => ({ inspirationPhotos: s.inspirationPhotos.map((p) => p.id === id ? { ...p, x, y } : p) })),

  setTitle: (title) => set((s) => ({ meta: { ...s.meta, title } })),
  setKey: (keyRoot, keyMode) => set((s) => {
    const semitones = (rootToPc(keyRoot) - rootToPc(s.meta.keyRoot) + 12) % 12;
    if (semitones === 0) return { meta: { ...s.meta, keyRoot, keyMode } };
    return {
      meta: { ...s.meta, keyRoot, keyMode },
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
    };
  }),
  setBpm: (bpm) => set((s) => ({ meta: { ...s.meta, bpm: Math.max(40, Math.min(220, bpm)) } })),

  setTimeSignature: (beatsPerBar, beatUnit) => set((s) => {
    const bpb = Math.max(1, Math.min(16, Math.round(beatsPerBar)));
    const bu = [2, 4, 8, 16].includes(beatUnit) ? beatUnit : 4;
    // Propagate beatsPerBar to every pattern block and wipe mirrors; placement
    // is re-derived from SSOT below so overflowing chords spill into the next
    // block or a fresh (cont.) block instead of being silently dropped.
    const progression = s.progression.map((p) => ({ ...p, beatsPerBar: bpb, chords: [] as PatternChord[] }));
    const capById = new Map(progression.map((p) => [p.id, p.bars * bpb] as const));
    const sections = s.sections.map((sec) => ({
      ...sec,
      chords: sec.chords.map((sc) => {
        const pp = sc.progressionPlacement;
        if (!pp) return sc;
        const cap = capById.get(pp.patternId) ?? pp.lengthBeats;
        const len = Math.max(0.5, Math.min(pp.lengthBeats, cap));
        return { ...sc, progressionPlacement: { patternId: pp.patternId, startBeat: 0, lengthBeats: len } };
      }),
    }));
    const synced = syncMirrorsFromAllSectionChords(sections, progression);
    return {
      meta: { ...s.meta, beatsPerBar: bpb, beatUnit: bu },
      sections: synced.sections,
      progression: synced.progression,
    };
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
    // Cross-tab cleanup: if the deleted section owns the focused/start
    // playback cursor, drop it so the play button starts from the top.
    try {
      const pb = usePlaybackStore.getState();
      const removedPatternIds = new Set(s.progression.filter((p) => (p.sectionId ?? p.id) === id).map((p) => p.id));
      if (pb.focusedPatternId && removedPatternIds.has(pb.focusedPatternId)) {
        pb.setStartFromChord(null, null);
      }
    } catch { /* ignore */ }
    return {
      sections: s.sections.filter((sec) => sec.id !== id),
      progression: s.progression.filter((p) => (p.sectionId ?? p.id) !== id),
    };
  }),
  duplicateSection: (id) => {
    const state = get();
    const idx = state.sections.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const src = state.sections[idx];
    const srcPatterns = state.progression.filter((p) => (p.sectionId ?? p.id) === id);
    const newId = nanoid();
    // Rebuild lines + chords with fresh ids and mirror relationships.
    const idMap = new Map<string, string>(); // oldAnchorId -> newAnchorId
    const newLines: LyricLine[] = src.lines.map((l) => ({
      id: nanoid(),
      text: l.text,
      _isChordOverflow: l._isChordOverflow,
      chords: l.chords.map((a) => {
        const newAnchorId = nanoid();
        idMap.set(a.id, newAnchorId);
        return {
          id: newAnchorId,
          offset: a.offset,
          slotIndex: a.slotIndex,
          wordIndex: a.wordIndex,
          chordCol: a.chordCol,
          chord: a.chord,
          mirrorId: undefined,
        };
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
    const newPatterns: PatternBlock[] = srcPatterns.length
      ? srcPatterns.map((srcPattern, pi) => ({
          id: pi === 0 ? newId : nanoid(),
          sectionId: newId,
          label: pi === 0 ? newSection.label : srcPattern.label,
          bars: srcPattern.bars,
          beatsPerBar: srcPattern.beatsPerBar,
          chords: srcPattern.chords.map((c) => {
            const newPcId = nanoid();
            const linkedAnchor = c.mirrorId ? idMap.get(c.mirrorId) : undefined;
            if (linkedAnchor) {
              for (const ln of newLines) {
                const found = ln.chords.find((a) => a.id === linkedAnchor);
                if (found) found.mirrorId = newPcId;
              }
            }
            return { id: newPcId, chord: c.chord, startBeat: c.startBeat, lengthBeats: c.lengthBeats, mirrorId: linkedAnchor };
          }),
        }))
      : [{ id: newId, sectionId: newId, label: newSection.label, bars: 4, beatsPerBar: 4, chords: [] }];

    set((s) => {
      const sections = [...s.sections];
      sections.splice(idx + 1, 0, newSection);
      let lastPIdx = -1;
      for (let k = 0; k < s.progression.length; k++) {
        if ((s.progression[k].sectionId ?? s.progression[k].id) === id) lastPIdx = k;
      }
      const insertAt = (lastPIdx >= 0 ? lastPIdx : s.progression.length - 1) + 1;
      const progression = [...s.progression];
      progression.splice(insertAt, 0, ...newPatterns);
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
    return { sections: refreshAllSectionChords(sections, progression), progression };
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
  setSectionArpArmed: (id, armed) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, arpArmed: armed } : sec)),
  })),
  setSectionKeyChangeOffset: (id, offset) => set((s) => {
    if (s.sections.length > 0 && s.sections[0].id === id) return s;
    return {
      sections: s.sections.map((sec) =>
        sec.id === id ? { ...sec, keyChangeRootOffset: offset } : sec,
      ),
    };
  }),
  resetSong: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    const fresh = makeSection("verse");
    set((s) => ({
      meta: { title: "", keyRoot: "C", keyMode: "maj", bpm: 92, beatsPerBar: 4, beatUnit: 4 },
      sections: [fresh.section],
      progression: [fresh.pattern],
      basket: [],
      inspirationPhotos: [],
      suppressCrossTabDeleteWarning: s.suppressCrossTabDeleteWarning,
    }));
    useAppTintStore.getState().setTint(null);
    useAppBackgroundStore.getState().setPattern("none");
    useAppBackgroundStore.getState().setMask("none");
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
  removeLine: (sectionId, id) => { pushHistory(get); return set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      if (sec.lines.length <= 1) return sec;
      return { ...sec, lines: sec.lines.filter((l) => l.id !== id) };
    }),
    // Drop the deleted line's mirrored chords from the progression too. Detaching
    // (rather than deleting) used to leave orphaned pattern chords that were
    // invisible in Write but still showed in Arrange and got hit by the playhead.
    // Undo restores the whole row, chords included.
    progression: (() => {
      const sec = s.sections.find((x) => x.id === sectionId);
      const removed = sec?.lines.find((l) => l.id === id);
      if (!removed?.chords.length) return s.progression;
      const anchorIds = new Set(removed.chords.map((a) => a.id));
      return s.progression.map((p) =>
        (p.sectionId ?? p.id) !== sectionId
          ? p
          : { ...p, chords: p.chords.filter((c) => !(c.mirrorId && anchorIds.has(c.mirrorId))) },
      );
    })(),
  })); },
  setLineText: (sectionId, id, text) => {
    const editKey = `${sectionId}:${id}`;
    const now = Date.now();
    const coalesce =
      lastLineTextEdit !== null &&
      lastLineTextEdit.key === editKey &&
      now - lastLineTextEdit.at < LINE_TEXT_COALESCE_MS;
    if (!coalesce) pushHistory(get);
    lastLineTextEdit = { key: editKey, at: now };
    set((s) => ({
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

  splitLine: (sectionId, id, caretIndex) => {
    let newLineId: string | null = null;
    // A split is its own atomic undo step (also ends any typing-coalesce run).
    pushHistory(get);
    // Re-anchor moved/kept chords in their existing left-to-right order.
    const reindex = (arr: ChordAnchor[]): ChordAnchor[] =>
      arr.map((c, i) => ({ ...c, wordIndex: undefined, chordCol: i, offset: i, slotIndex: undefined }));
    set((s) => ({
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = sec.lines.findIndex((l) => l.id === id);
        if (idx < 0) return sec;
        const line = sec.lines[idx];
        const caret = Math.max(0, Math.min(caretIndex, line.text.length));
        const before = line.text.slice(0, caret);
        const after = line.text.slice(caret);
        // Bind chords to words first so each has a character position to test.
        const snapped = snapLineToWords(line);
        const words = getWords(line.text);
        const charPosOf = (c: ChordAnchor) =>
          c.wordIndex != null && words[c.wordIndex] ? words[c.wordIndex].start : (c.chordCol ?? c.offset ?? 0);
        const keep: ChordAnchor[] = [];
        const move: ChordAnchor[] = [];
        snapped.chords.forEach((c) => (charPosOf(c) < caret ? keep : move).push(c));
        const original = ensureSlotsForLine(
          snapLineToWords({ ...line, text: before, chords: reindex(keep) }),
        );
        const newLine = ensureSlotsForLine(
          snapLineToWords({ ...initialLine(), text: after, chords: reindex(move) }),
        );
        newLineId = newLine.id;
        const lines = [...sec.lines];
        lines.splice(idx, 1, original, newLine);
        return { ...sec, lines };
      }),
    }));
    return newLineId ? { newLineId } : null;
  },

  mergeLineUp: (sectionId, id) => {
    const sec0 = get().sections.find((x) => x.id === sectionId);
    if (!sec0) return null;
    const idx0 = sec0.lines.findIndex((l) => l.id === id);
    if (idx0 <= 0) return null; // no previous line to merge onto
    const prev0 = sec0.lines[idx0 - 1];
    const result = { prevLineId: prev0.id, caretIndex: prev0.text.length };
    pushHistory(get);
    const reindex = (arr: ChordAnchor[]): ChordAnchor[] =>
      arr.map((c, i) => ({ ...c, wordIndex: undefined, chordCol: i, offset: i, slotIndex: undefined }));
    set((s) => ({
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = sec.lines.findIndex((l) => l.id === id);
        if (idx <= 0) return sec;
        const prev = sec.lines[idx - 1];
        const cur = sec.lines[idx];
        const prevSnapped = snapLineToWords(prev);
        const merged = ensureSlotsForLine(
          snapLineToWords({
            ...prev,
            text: prev.text + cur.text,
            chords: [...prevSnapped.chords, ...reindex(cur.chords)],
          }),
        );
        const lines = [...sec.lines];
        lines.splice(idx - 1, 2, merged);
        return { ...sec, lines };
      }),
    }));
    return result;
  },

  noteLyricCaret: (sectionId, lineId, caret) => {
    lastCaret = { sectionId, lineId, caret };
  },

  clearPendingCaret: () => set({ pendingCaret: null }),

  setChordRowLen: (sectionId, id, len) => { pushHistory(get); set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => (l.id === id ? { ...l, chordRowLen: Math.max(0, len) } : l)),
      };
    }),
  })); },

  // (insertChordSpaceAt / removeChordCellAt removed — legacy column-based actions
  //  unused by current UI; SSOT slots make them obsolete.)


  // Add or replace a chord anchor; mirror to bound pattern block.
  upsertChordAt: (sectionId, lineId, col, chord, anchorId) => {
    if (anchorId) {
      pushHistory(get);
      // Edit existing SectionChord: swap chord (and update slotIndex if it
      // moved). Identity preserved.
      set((s) => {
        const nextSections = s.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            chords: sec.chords.map((sc) => {
              if (sc.id !== anchorId) return sc;
              const nextLp = sc.lyricsPlacement
                ? { ...sc.lyricsPlacement, slotIndex: Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, col)) }
                : { lineId, slotIndex: Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, col)) };
              return { ...sc, chord, lyricsPlacement: nextLp };
            }),
          };
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ sections: nextSections, [SSOT_MODE]: true } as any);
      });
      return;
    }
    // Else: add a new chord at the requested slot (delegate to placeChordInSlot
    // semantics — it owns auto-reflow rules and progression placement).
    get().placeChordInSlot(sectionId, lineId, col, chord);
  },

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

  pasteChordsAt: (sectionId, lineId, atCol, items) => {
    pushHistory(get);
    set((s) => {
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      // Compute target slots from atCol+relCol, clamped to row.
      const targetByItem = items.map((it) => ({
        chord: it.chord,
        slot: Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, atCol + Math.max(0, it.relCol))),
      }));
      const replaceSlots = new Set(targetByItem.map((t) => t.slot));
      // Drop any existing SectionChord on this line whose slot collides.
      const trimmedSectionChords = sec.chords.filter(
        (sc) => !(sc.lyricsPlacement?.lineId === lineId && replaceSlots.has(sc.lyricsPlacement.slotIndex)),
      );
      // Build new SectionChords + their progression placements one at a time
      // (using placeSectionChordInProgression for continuation-block behavior).
      let workingProgression = s.progression;
      let workingChords = trimmedSectionChords;
      const created: SectionChord[] = [];
      for (const t of targetByItem) {
        const newId = nanoid();
        const placement = placeSectionChordInProgression(
          workingProgression,
          sectionId,
          workingChords,
          t.chord,
          newId,
          { lineId, slotIndex: t.slot },
        );
        workingProgression = placement.progression;
        workingChords = [...workingChords, placement.sectionChord];
        created.push(placement.sectionChord);
      }
      const nextSections = s.sections.map((x) =>
        x.id !== sectionId ? x : { ...x, chords: workingChords },
      );
      void created;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({
        sections: nextSections,
        progression: workingProgression,
        [SSOT_MODE]: true,
      } as any);
    });
  },

  // (upsertChordAtWord / appendChordToLine / moveChordWordSlot removed —
  //  legacy word-anchored actions superseded by SSOT slot model.)

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
    // Phase 1.5: a single song-wide action that (1) snaps each lyric line's
    // chords onto word boundaries and (2) reflows for the current viewport.
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    // SSOT mode: formatChordsAndLyrics returns sections whose `lines[].chords`
    // arrays are EMPTY by design (it only updates section.chords +
    // lines[].id/text). Without the SSOT_MODE marker the wrapped setter
    // would take the legacy "rebuild SSOT from mirrors" path
    // (refreshAllSectionChords → recomputeSectionChordsFromMirrors), which
    // reads line.chords[]; finding them empty it would drop every
    // lyrics-anchored chord — the exact bug the user hit. Routing through
    // SSOT mode rebuilds line.chords + pattern.chords from the formatter's
    // section.chords output instead.
    set((s) => {
      const next = {
        sections: s.sections.map((sec) => {
          const snapped: Section = {
            ...sec,
            lines: sec.lines.map((l) => snapLineToWords(l)),
          };
          return formatChordsAndLyrics(snapped, { screenWidth: w, slotWidth: 28 }).section;
        }),
        [SSOT_MODE]: true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return next as any;
    });
  },

  autoLayoutSection: (sectionId, screenWidth, slotWidth) => {
    const before = get().sections.find((x) => x.id === sectionId);
    if (!before) {
      return { changed: false, reason: "not-found" };
    }
    const result = formatChordsAndLyrics(before, { screenWidth, slotWidth });
    const next = result.section;
    const sameLines =
      before.lines.length === next.lines.length &&
      before.lines.every((l, i) => l.id === next.lines[i].id && l.text === next.lines[i].text && !!l._isChordOverflow === !!next.lines[i]._isChordOverflow);
    const samePlacements =
      before.chords.length === next.chords.length &&
      before.chords.every((c, i) => {
        const n = next.chords[i];
        const a = c.lyricsPlacement;
        const b = n?.lyricsPlacement;
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.lineId === b.lineId && a.slotIndex === b.slotIndex;
      });
    if (sameLines && samePlacements) {
      try {
        if (typeof window !== "undefined" && window.localStorage?.getItem("LV_DEBUG_LAYOUT") === "1") {
          // eslint-disable-next-line no-console
          console.log("[layout] autoLayoutSection no-op", { sectionId });
        }
      } catch { /* ignore */ }
      return { changed: false, reason: "no-op", overflowRowsAdded: 0 };
    }
    pushHistory(get);
    let recomputedOverflow = result.overflowRowsAdded;
    set((s) => {
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      const r2 = formatChordsAndLyrics(sec, { screenWidth, slotWidth });
      recomputedOverflow = r2.overflowRowsAdded;
      const nextSections = s.sections.map((x) => (x.id === sectionId ? r2.section : x));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    });

    // Safety net: detect residual overflow (chords still beyond capacity).
    const after = get().sections.find((x) => x.id === sectionId);
    let residualOverflow = 0;
    if (after) {
      const factor = screenWidth < 1024 ? 0.8 : 0.9;
      const slotsPerLine = Math.max(2, Math.floor((screenWidth * factor) / Math.max(20, slotWidth ?? 28)));
      const byLine = new Map<string, number>();
      after.chords.forEach((c) => {
        const lp = c.lyricsPlacement;
        if (!lp) return;
        const w = c.chord.display.length <= 3 ? 1 : 2;
        byLine.set(lp.lineId, (byLine.get(lp.lineId) ?? 0) + w + 1);
      });
      byLine.forEach((footprint) => {
        if (footprint > slotsPerLine + 1) residualOverflow += 1;
      });
    }

    return { changed: true, overflowRowsAdded: recomputedOverflow, residualOverflow };
  },

  // -------- Slot-based chord row (SSOT-first) --------
  placeChordInSlot: (sectionId, lineId, slotIndex, chord) => {
    const __dbg = (() => {
      try {
        return typeof window !== "undefined" && window.localStorage?.getItem("LV_DEBUG_LAYOUT") === "1";
      } catch { return false; }
    })();
    pushHistory(get);
    let result: { id: string; lineId: string; slotIndex: number } | null = null;
    set((s) => {
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      const target = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, slotIndex));
      const lineChords = sec.chords
        .filter((sc) => sc.lyricsPlacement?.lineId === lineId)
        .sort((a, b) => (a.lyricsPlacement!.slotIndex - b.lyricsPlacement!.slotIndex));
      const occupied = new Set<number>(lineChords.map((sc) => sc.lyricsPlacement!.slotIndex));
      const occupiedHere = occupied.has(target);
      const sandwiched = occupied.has(target - 1) && occupied.has(target + 1);
      const needsReflow = occupiedHere || sandwiched;

      let nextSectionsBase = s.sections;
      let placeSlot = target;
      if (needsReflow) {
        const shifted = lineChords
          .filter((sc) => sc.lyricsPlacement!.slotIndex >= target)
          .map((sc) => ({ id: sc.id, to: sc.lyricsPlacement!.slotIndex + 2 }));
        if (shifted.some((x) => x.to >= CHORD_ROW_SLOTS)) {
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
        x.id !== sectionId
          ? x
          : { ...x, chords: insertSectionChordAtSlot(x.chords, placement.sectionChord, x.lines) },
      );
      result = { id: newId, lineId, slotIndex: placeSlot };
      if (__dbg) {
        // eslint-disable-next-line no-console
        console.log("[layout] placeChordInSlot", {
          sectionId, lineId, requested: target, placeSlot,
          neededReflow: needsReflow, fellBackToSpaced: needsReflow && placeSlot !== target,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({
        sections: nextSections,
        progression: placement.progression,
        [SSOT_MODE]: true,
      } as any);
    });
    return result;
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
      const nextSections = s.sections.map((x) => {
        if (x.id !== sectionId) return x;
        // 1) Update slotIndex on the moved chord (and swap with occupant if any).
        const withSlots = x.chords.map((c) => {
          if (c.id === anchorId && c.lyricsPlacement)
            return { ...c, lyricsPlacement: { ...c.lyricsPlacement, slotIndex: target } };
          if (occupant && c.id === occupant.id && c.lyricsPlacement)
            return { ...c, lyricsPlacement: { ...c.lyricsPlacement, slotIndex: myPrev } };
          return c;
        });
        // 2) Reorder SSOT array so chords on THIS line appear in slotIndex order.
        //    Chords on other lines / progression-only chords keep their relative
        //    positions; we only permute the indices currently occupied by the
        //    line's chords.
        const lineIdxs: number[] = [];
        withSlots.forEach((c, i) => {
          if (c.lyricsPlacement?.lineId === lineId) lineIdxs.push(i);
        });
        const lineChords = lineIdxs.map((i) => withSlots[i]);
        lineChords.sort((a, b) =>
          (a.lyricsPlacement!.slotIndex ?? 0) - (b.lyricsPlacement!.slotIndex ?? 0),
        );
        const reordered = withSlots.slice();
        lineIdxs.forEach((i, k) => { reordered[i] = lineChords[k]; });
        return { ...x, chords: reordered };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    });
  },

  moveChordsAcrossLines: (fromSectionId, fromLineId, toSectionId, toLineId, anchorIds, dropSlot) => {
    pushHistory(get);
    set((s) => {
      const fromSec = s.sections.find((x) => x.id === fromSectionId);
      if (!fromSec) return {};
      const idSet = new Set(anchorIds);
      // Pull the SectionChords being moved (anchorId === SectionChord.id under SSOT).
      const moving = fromSec.chords
        .filter((sc) => idSet.has(sc.id) && sc.lyricsPlacement?.lineId === fromLineId)
        .sort((a, b) => (a.lyricsPlacement!.slotIndex - b.lyricsPlacement!.slotIndex));
      if (!moving.length) return {};

      const start = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, dropSlot));

      // Helper: lay out a list of SectionChords on a target line starting at
      // `start`, walking right past any occupied or out-of-spacing slots.
      const layout = (used: Set<number>): Map<string, number> => {
        const out = new Map<string, number>();
        let cursor = start;
        for (const m of moving) {
          let s2 = cursor;
          while (s2 < CHORD_ROW_SLOTS && used.has(s2)) s2++;
          if (s2 >= CHORD_ROW_SLOTS) break;
          out.set(m.id, s2);
          used.add(s2);
          cursor = s2 + 1;
        }
        return out;
      };

      if (fromSectionId === toSectionId && fromLineId === toLineId) {
        // Same row: reslot only the moving chords; others stay put. Treat
        // others' slots as occupied to avoid collisions.
        const used = new Set<number>();
        fromSec.chords.forEach((sc) => {
          if (sc.lyricsPlacement?.lineId === fromLineId && !idSet.has(sc.id)) {
            used.add(sc.lyricsPlacement.slotIndex);
          }
        });
        const slotById = layout(used);
        const nextSections = s.sections.map((sec) => {
          if (sec.id !== fromSectionId) return sec;
          return {
            ...sec,
            chords: sec.chords.map((sc) => {
              const ns = slotById.get(sc.id);
              if (ns == null || !sc.lyricsPlacement) return sc;
              return { ...sc, lyricsPlacement: { ...sc.lyricsPlacement, slotIndex: ns } };
            }),
          };
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ sections: nextSections, [SSOT_MODE]: true } as any);
      }

      // Cross-line / cross-section move.
      const toSec = s.sections.find((x) => x.id === toSectionId);
      if (!toSec) return {};
      const used = new Set<number>();
      toSec.chords.forEach((sc) => {
        if (sc.lyricsPlacement?.lineId === toLineId) used.add(sc.lyricsPlacement.slotIndex);
      });
      const slotById = layout(used);
      // Anchors that found a slot get their lyricsPlacement updated; for
      // cross-section, also re-place into the destination's progression.
      const placedIds = new Set(slotById.keys());
      // Build moved SectionChord objects with new lyricsPlacement.
      const movedChords = moving
        .filter((m) => placedIds.has(m.id))
        .map((m) => ({
          ...m,
          lyricsPlacement: { lineId: toLineId, slotIndex: slotById.get(m.id)! },
        }));

      if (fromSectionId === toSectionId) {
        // Same section, different line: just update lyricsPlacement in place.
        const nextSections = s.sections.map((sec) => {
          if (sec.id !== fromSectionId) return sec;
          return {
            ...sec,
            chords: sec.chords.map((sc) => {
              const ns = slotById.get(sc.id);
              if (ns == null || !sc.lyricsPlacement) return sc;
              return { ...sc, lyricsPlacement: { lineId: toLineId, slotIndex: ns } };
            }),
          };
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ sections: nextSections, [SSOT_MODE]: true } as any);
      }

      // Cross-section: remove from source, add fresh SectionChords to target
      // (re-running placeSectionChordInProgression so target section owns the
      // progression placement). Drop from source's section.chords entirely.
      let workingProgression = s.progression;
      let nextSections = s.sections.map((sec) => {
        if (sec.id !== fromSectionId) return sec;
        return { ...sec, chords: sec.chords.filter((sc) => !placedIds.has(sc.id)) };
      });
      // For each moved chord, allocate a fresh SectionChord in the target section.
      for (const mc of movedChords) {
        const targetSec = nextSections.find((x) => x.id === toSectionId);
        if (!targetSec) continue;
        const newId = nanoid();
        const placement = placeSectionChordInProgression(
          workingProgression,
          toSectionId,
          targetSec.chords,
          mc.chord,
          newId,
          mc.lyricsPlacement,
        );
        workingProgression = placement.progression;
        nextSections = nextSections.map((sec) =>
          sec.id !== toSectionId ? sec : { ...sec, chords: [...sec.chords, placement.sectionChord] },
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({
        sections: nextSections,
        progression: workingProgression,
        [SSOT_MODE]: true,
      } as any);
    });
  },

  moveChordsToAdjacentRow: (sourceSectionId, sourceLineId, anchorIds, direction) => {
    const blockCountBefore = get().progression.length;
    let moved = false;
    let movedIds: string[] = [];
    let targetSectionId: string | undefined;
    let targetLineId: string | undefined;

    pushHistory(get);
    set((s) => {
      const srcSecIdx = s.sections.findIndex((x) => x.id === sourceSectionId);
      if (srcSecIdx < 0) return {};
      const srcSec = s.sections[srcSecIdx];
      const lineIdx = srcSec.lines.findIndex((l) => l.id === sourceLineId);
      if (lineIdx < 0) return {};

      const idSet = new Set(anchorIds);
      // anchorId === SectionChord.id under SSOT.
      const moving = srcSec.chords
        .filter((sc) => idSet.has(sc.id) && sc.lyricsPlacement?.lineId === sourceLineId)
        .sort((a, b) => (a.lyricsPlacement!.slotIndex - b.lyricsPlacement!.slotIndex));
      if (!moving.length) return {};

      // Resolve target section + line (auto-cross section boundaries).
      let tgtSecIdx = srcSecIdx;
      let tgtLineId: string;
      let createdLine: LyricLine | null = null;
      const within = srcSec.lines[lineIdx + direction];
      if (within) {
        tgtLineId = within.id;
      } else {
        tgtSecIdx = srcSecIdx + direction;
        const adjSec = s.sections[tgtSecIdx];
        if (!adjSec) return {}; // absolute first/last row of the song
        const adjLine = direction === -1 ? adjSec.lines[adjSec.lines.length - 1] : adjSec.lines[0];
        if (adjLine) {
          tgtLineId = adjLine.id;
        } else {
          createdLine = { id: nanoid(), text: "", chords: [] as ChordAnchor[] };
          tgtLineId = createdLine.id;
        }
      }
      const tgtSec = s.sections[tgtSecIdx];
      const sameSection = tgtSec.id === sourceSectionId;

      // Working sections, with the optionally-created target line appended.
      let workingSections = s.sections;
      if (createdLine) {
        workingSections = workingSections.map((x) =>
          x.id !== tgtSec.id ? x : { ...x, lines: [...x.lines, createdLine!] },
        );
      }

      // Append base: one slot past the last chord already on the target line.
      const occupied = new Set<number>();
      workingSections[tgtSecIdx].chords.forEach((sc) => {
        if (sc.lyricsPlacement?.lineId === tgtLineId && !idSet.has(sc.id)) {
          occupied.add(sc.lyricsPlacement.slotIndex);
        }
      });
      const base = occupied.size ? Math.max(...occupied) + 1 : 0;

      if (sameSection) {
        // Re-slot lyricsPlacement onto the target line and reorder
        // section.chords so the moved chords sit after the target row's
        // existing chords — array order drives both lyric slot order and
        // pattern-block packing.
        const movingIds = new Set(moving.map((m) => m.id));
        let chords = workingSections[srcSecIdx].chords.filter((sc) => !movingIds.has(sc.id));
        const lines = workingSections[srcSecIdx].lines;
        moving.forEach((m, k) => {
          const slot = Math.min(CHORD_ROW_SLOTS - 1, base + k);
          const updated: SectionChord = { ...m, lyricsPlacement: { lineId: tgtLineId, slotIndex: slot } };
          chords = insertSectionChordAtSlot(chords, updated, lines);
        });
        const nextSections = workingSections.map((sec, i) =>
          i === srcSecIdx ? { ...sec, chords } : sec,
        );
        moved = true;
        movedIds = moving.map((m) => m.id);
        targetSectionId = tgtSec.id;
        targetLineId = tgtLineId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ sections: nextSections, [SSOT_MODE]: true } as any);
      }

      // Cross-section: drop from the source, allocate fresh SectionChords in
      // the target section so it owns the progression placement.
      let workingProgression = s.progression;
      let nextSections = workingSections.map((sec) =>
        sec.id !== sourceSectionId
          ? sec
          : { ...sec, chords: sec.chords.filter((sc) => !idSet.has(sc.id)) },
      );
      const freshIds: string[] = [];
      moving.forEach((m, k) => {
        const slot = Math.min(CHORD_ROW_SLOTS - 1, base + k);
        const targetSec = nextSections[tgtSecIdx];
        const placement = placeSectionChordInProgression(
          workingProgression,
          tgtSec.id,
          targetSec.chords,
          m.chord,
          nanoid(),
          { lineId: tgtLineId, slotIndex: slot },
        );
        workingProgression = placement.progression;
        freshIds.push(placement.sectionChord.id);
        nextSections = nextSections.map((sec, i) =>
          i === tgtSecIdx
            ? { ...sec, chords: insertSectionChordAtSlot(sec.chords, placement.sectionChord, sec.lines) }
            : sec,
        );
      });
      moved = true;
      movedIds = freshIds;
      targetSectionId = tgtSec.id;
      targetLineId = tgtLineId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, progression: workingProgression, [SSOT_MODE]: true } as any);
    });

    return {
      moved,
      createdBlock: get().progression.length > blockCountBefore,
      movedIds,
      targetSectionId,
      targetLineId,
    };
  },

  addToBasket: (chords) => set((s) => ({
    basket: [...s.basket, ...chords.map((chord) => ({ id: nanoid(), chord }))],
  })),
  removeFromBasket: (id) => set((s) => ({ basket: s.basket.filter((b) => b.id !== id) })),
  clearBasket: () => set({ basket: [] }),

  // ---- pattern blocks ----
  updatePattern: (id, patch) => set((s) => {
    // SSOT-first: change bars/beatsPerBar on the pattern, then re-bin
    // SectionChords across this section's blocks (spawn continuation if
    // overflow exceeds existing capacity).
    const target = s.progression.find((p) => p.id === id);
    if (!target) return {};
    const sectionId = target.sectionId ?? target.id;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};

    const sectionPatterns = s.progression
      .map((p, i) => ({ p, i }))
      .filter((x) => (x.p.sectionId ?? x.p.id) === sectionId);
    const blocks: PatternBlock[] = sectionPatterns.map((x) =>
      x.p.id === id ? { ...x.p, ...patch, chords: [] } : { ...x.p, chords: [] },
    );
    const blockUsage = blocks.map(() => 0);
    const blockIndexById = new Map(blocks.map((b, i) => [b.id, i]));
    const placementById = new Map<string, { patternId: string; startBeat: number; lengthBeats: number }>();

    for (const sc of sec.chords) {
      const pp = sc.progressionPlacement;
      if (!pp) continue;
      const origIdx = blockIndexById.get(pp.patternId);
      if (origIdx == null) continue; // not in this section
      const want = Math.max(0.5, pp.lengthBeats);
      let placed = false;
      for (let i = origIdx; i < blocks.length; i++) {
        const cap = blocks[i].bars * blocks[i].beatsPerBar;
        if (blockUsage[i] + want <= cap + 1e-9) {
          placementById.set(sc.id, { patternId: blocks[i].id, startBeat: blockUsage[i], lengthBeats: want });
          blockUsage[i] += want;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const ref = blocks[blocks.length - 1];
        const newId = nanoid();
        const newBlock: PatternBlock = {
          id: newId,
          sectionId,
          label: `${ref.label} (cont.)`,
          bars: ref.bars,
          beatsPerBar: ref.beatsPerBar,
          chords: [],
        };
        const cap = newBlock.bars * newBlock.beatsPerBar;
        const placedLen = Math.min(want, cap);
        blocks.push(newBlock);
        blockUsage.push(placedLen);
        blockIndexById.set(newId, blocks.length - 1);
        placementById.set(sc.id, { patternId: newId, startBeat: 0, lengthBeats: placedLen });
      }
    }

    const nextSecChords: SectionChord[] = sec.chords.map((sc) => {
      const np = placementById.get(sc.id);
      if (!np) return sc;
      return { ...sc, progressionPlacement: np };
    });
    const nextSections = s.sections.map((x) =>
      x.id !== sectionId ? x : { ...x, chords: nextSecChords },
    );

    const sectionBlockIds = new Set(sectionPatterns.map((x) => x.p.id));
    const rebuilt: PatternBlock[] = [];
    let inserted = false;
    for (const p of s.progression) {
      if (sectionBlockIds.has(p.id)) {
        if (!inserted) {
          rebuilt.push(...blocks);
          inserted = true;
        }
      } else {
        rebuilt.push(p);
      }
    }
    if (!inserted) rebuilt.push(...blocks);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, progression: rebuilt, [SSOT_MODE]: true } as any);
  }),

  setPatternPlayBeats: (id, playBeats) => { pushHistory(get); return set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== id) return p;
      if (playBeats == null) {
        const { playBeats: _drop, ...rest } = p;
        return rest;
      }
      const cap = p.bars * p.beatsPerBar;
      return { ...p, playBeats: Math.max(0.5, Math.min(playBeats, cap)) };
    }),
  })); },

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
    // B1: assign a default lyricsPlacement so the chord shows up in the
    // Lyrics view immediately. Auto-layout will reflow positions later;
    // for now, drop on the section's first line at the next free slot.
    const firstLine = sec.lines[0];
    const lyricsPlacement: LyricsPlacement | undefined = firstLine
      ? (() => {
          const occupied = new Set<number>();
          sec.chords.forEach((c) => {
            if (c.lyricsPlacement?.lineId === firstLine.id) {
              occupied.add(c.lyricsPlacement.slotIndex);
            }
          });
          const slot = nearestFreeSlot(occupied, 0);
          return slot >= 0 ? { lineId: firstLine.id, slotIndex: slot } : undefined;
        })()
      : undefined;
    let nextProgression = s.progression;
    let sectionChord: SectionChord;
    if (free + 1e-9 >= 0.5) {
      // Append into target pattern at the natural end.
      const placedLen = Math.max(0.5, Math.min(effectiveLen, free));
      sectionChord = {
        id: newId,
        chord,
        lyricsPlacement,
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
        lyricsPlacement,
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
    // SSOT-first: chordId === SectionChord.id. Apply patch to the
    // SectionChord; mirror derivation refreshes line.chords + pattern.chords.
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const totalBeats = pattern.bars * pattern.beatsPerBar;
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      if (!sec.chords.some((sc) => sc.id === chordId)) return sec;
      const othersSum = sec.chords.reduce((sum, sc) => {
        if (sc.id === chordId) return sum;
        const pp = sc.progressionPlacement;
        return pp && pp.patternId === patternId ? sum + pp.lengthBeats : sum;
      }, 0);
      const maxForThis = Math.max(0.5, totalBeats - othersSum);
      return {
        ...sec,
        chords: sec.chords.map((sc) => {
          if (sc.id !== chordId) return sc;
          const next: SectionChord = { ...sc };
          if (patch.chord) next.chord = patch.chord;
          if (patch.lengthBeats != null && next.progressionPlacement) {
            const clamped = Math.max(0.5, Math.min(patch.lengthBeats, maxForThis));
            next.progressionPlacement = { ...next.progressionPlacement, lengthBeats: clamped };
          }
          return next;
        }),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }),

  bulkSetChordOctave: (patternId, chordIds, octave) => set((s) => {
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const idSet = new Set(chordIds);
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      if (!sec.chords.some((sc) => idSet.has(sc.id))) return sec;
      return {
        ...sec,
        chords: sec.chords.map((sc) =>
          idSet.has(sc.id) ? { ...sc, chord: { ...sc.chord, octave } } : sc
        ),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }),

  // SSOT-first: chordId === SectionChord.id. Mutate that chord's
  // progressionPlacement.lengthBeats; mirror derivation re-packs startBeats.
  setPatternChordLength: (patternId, chordId, lengthBeats) => set((s) => {
    // SSOT-first: just update the SectionChord's lengthBeats. Overflow into
    // subsequent blocks (and continuation-block spawning) is handled by the
    // derive step in syncMirrorsFromAllSectionChords.
    const newLen = Math.max(0.5, lengthBeats);
    const sections = s.sections.map((sec) => {
      if (!sec.chords.some((sc) => sc.id === chordId && sc.progressionPlacement?.patternId === patternId)) return sec;
      return {
        ...sec,
        chords: sec.chords.map((sc) =>
          sc.id !== chordId || !sc.progressionPlacement
            ? sc
            : { ...sc, progressionPlacement: { ...sc.progressionPlacement, lengthBeats: newLen } },
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
    const sectionId = sourcePattern.sectionId ?? sourcePattern.id;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};

    // 1) Apply delta to selected SectionChords' progressionPlacement.lengthBeats.
    const idSet = new Set(chordIds);
    const grownSec: SectionChord[] = sec.chords.map((sc) => {
      if (!idSet.has(sc.id) || !sc.progressionPlacement) return sc;
      return {
        ...sc,
        progressionPlacement: {
          ...sc.progressionPlacement,
          lengthBeats: Math.max(0.5, sc.progressionPlacement.lengthBeats + deltaBeats),
        },
      };
    });

    // 2) Walk through SCs assigned to this section's patterns in order; for
    //    each, place into the next available block (in section order),
    //    spawning continuation blocks when needed. Maintain stable order via
    //    section.chords array order.
    const sectionPatterns = s.progression
      .map((p, i) => ({ p, i }))
      .filter((x) => (x.p.sectionId ?? x.p.id) === sectionId);
    const sourcePosInSection = sectionPatterns.findIndex((x) => x.p.id === patternId);
    if (sourcePosInSection < 0) return {};

    // Mutable copy of section's pattern blocks (ordered).
    const blocks: PatternBlock[] = sectionPatterns.map((x) => ({ ...x.p, chords: [] }));
    const blockUsage = blocks.map(() => 0); // beats consumed
    // Track patternId remap as we place each SC.
    const placementById = new Map<string, { patternId: string; startBeat: number; lengthBeats: number }>();

    // We only re-pack SCs that were originally placed in patterns of THIS section.
    // SCs in other sections are left alone.
    // Strategy: walk grownSec (preserves section.chords order). For each SC
    // belonging to this section's blocks, find the lowest-indexed block (>= the
    // SC's original block index) with room.
    const blockIndexById = new Map(blocks.map((b, i) => [b.id, i]));
    for (const sc of grownSec) {
      const pp = sc.progressionPlacement;
      if (!pp) continue;
      const origIdx = blockIndexById.get(pp.patternId);
      if (origIdx == null) continue; // not in this section
      const len = Math.max(0.5, pp.lengthBeats);
      // For SCs originating in source pattern or later, start search at their
      // original block index. For SCs in earlier blocks, leave them in place.
      let searchFrom = origIdx;
      if (origIdx < sourcePosInSection) {
        const cap = blocks[origIdx].bars * blocks[origIdx].beatsPerBar;
        const fits = blockUsage[origIdx] + len <= cap + 1e-9;
        if (fits) {
          placementById.set(sc.id, { patternId: blocks[origIdx].id, startBeat: blockUsage[origIdx], lengthBeats: len });
          blockUsage[origIdx] += len;
          continue;
        }
        searchFrom = origIdx;
      }
      let placed = false;
      for (let i = searchFrom; i < blocks.length; i++) {
        const cap = blocks[i].bars * blocks[i].beatsPerBar;
        if (blockUsage[i] + len <= cap + 1e-9) {
          placementById.set(sc.id, { patternId: blocks[i].id, startBeat: blockUsage[i], lengthBeats: len });
          blockUsage[i] += len;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Spawn continuation block at end of section.
        const ref = blocks[blocks.length - 1];
        const newId = nanoid();
        const newBlock: PatternBlock = {
          id: newId,
          sectionId,
          label: `${ref.label} (cont.)`,
          bars: ref.bars,
          beatsPerBar: ref.beatsPerBar,
          chords: [],
        };
        const cap = newBlock.bars * newBlock.beatsPerBar;
        const placedLen = Math.min(len, cap);
        blocks.push(newBlock);
        blockUsage.push(placedLen);
        blockIndexById.set(newId, blocks.length - 1);
        placementById.set(sc.id, { patternId: newId, startBeat: 0, lengthBeats: placedLen });
      }
    }

    // 3) Rewrite SectionChords with new placements.
    const finalSecChords: SectionChord[] = grownSec.map((sc) => {
      const np = placementById.get(sc.id);
      if (!np) return sc;
      return { ...sc, progressionPlacement: np };
    });

    const nextSections = s.sections.map((x) =>
      x.id !== sectionId ? x : { ...x, chords: finalSecChords },
    );

    // 4) Splice new blocks (which may include new continuation blocks) back
    //    into global progression at the section's original position.
    const sectionBlockIds = new Set(sectionPatterns.map((x) => x.p.id));
    const rebuilt: PatternBlock[] = [];
    let inserted = false;
    for (const p of s.progression) {
      if (sectionBlockIds.has(p.id)) {
        if (!inserted) {
          rebuilt.push(...blocks);
          inserted = true;
        }
      } else {
        rebuilt.push(p);
      }
    }
    if (!inserted) rebuilt.push(...blocks);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, progression: rebuilt, [SSOT_MODE]: true } as any);
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
    // SSOT-first: move a SectionChord from one pattern's group to another's
    // (or reorder within the same pattern). Reposition entry in section.chords
    // and reassign its progressionPlacement.patternId.
    const fromPattern = s.progression.find((p) => p.id === fromPatternId);
    const toPattern = s.progression.find((p) => p.id === toPatternId);
    if (!fromPattern || !toPattern) return {};
    const fromSectionId = fromPattern.sectionId ?? fromPattern.id;
    const toSectionId = toPattern.sectionId ?? toPattern.id;

    // ---- Cross-section move ----
    // Detach the SectionChord from its source section (drops the lyrics
    // anchor, mirroring movePatternChordsTo's cross-section behavior) and
    // re-add it to the target section at a chosen position within
    // `toPatternId`'s SC group. The chord type is preserved.
    if (fromSectionId !== toSectionId) {
      const fromSec = s.sections.find((x) => x.id === fromSectionId);
      const toSec = s.sections.find((x) => x.id === toSectionId);
      if (!fromSec || !toSec) return {};
      const moving = fromSec.chords.find((c) => c.id === chordId);
      if (!moving || !moving.progressionPlacement) return {};
      const newId = nanoid();
      const remapped: SectionChord = {
        id: newId,
        chord: moving.chord,
        progressionPlacement: {
          patternId: toPatternId,
          startBeat: 0,
          lengthBeats: moving.progressionPlacement.lengthBeats,
        },
      };
      // Compute insertion point in target section.chords based on toIndex
      // within the destination pattern's SC group.
      const targetSCs = toSec.chords.filter(
        (c) => c.progressionPlacement?.patternId === toPatternId,
      );
      const insertAt = Math.max(0, Math.min(targetSCs.length, toIndex));
      const anchorBeforeId = insertAt === 0 ? null : targetSCs[insertAt - 1].id;
      const nextToChords: SectionChord[] = [];
      if (anchorBeforeId === null) {
        let inserted = false;
        for (const c of toSec.chords) {
          if (!inserted && c.progressionPlacement?.patternId === toPatternId) {
            nextToChords.push(remapped);
            inserted = true;
          }
          nextToChords.push(c);
        }
        if (!inserted) nextToChords.push(remapped);
      } else {
        let inserted = false;
        for (const c of toSec.chords) {
          nextToChords.push(c);
          if (!inserted && c.id === anchorBeforeId) {
            nextToChords.push(remapped);
            inserted = true;
          }
        }
        if (!inserted) nextToChords.push(remapped);
      }
      const nextSections = s.sections.map((x) => {
        if (x.id === fromSectionId) {
          return { ...x, chords: x.chords.filter((c) => c.id !== chordId) };
        }
        if (x.id === toSectionId) {
          return { ...x, chords: nextToChords };
        }
        return x;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    }

    // ---- Same-section move / reorder ----
    const sectionId = fromSectionId;
    const sec = s.sections.find((x) => x.id === sectionId);
    if (!sec) return {};
    const moving = sec.chords.find((c) => c.id === chordId);
    if (!moving || !moving.progressionPlacement) return {};

    // Snapshot current target-pattern SC ids in section.chords order; figure
    // out where to insert in section.chords based on toIndex within target.
    const targetSCs = sec.chords.filter(
      (c) => c.progressionPlacement?.patternId === toPatternId && c.id !== chordId,
    );
    const insertAt = Math.max(0, Math.min(targetSCs.length, toIndex));
    const anchorBeforeId = insertAt === 0 ? null : targetSCs[insertAt - 1].id;

    // Reassign moved SC's patternId; clear its concrete startBeat (recomputed
    // by deriveMirrorsFromSectionChords).
    const remapped: SectionChord = {
      ...moving,
      progressionPlacement: {
        ...moving.progressionPlacement,
        patternId: toPatternId,
        startBeat: 0,
      },
    };

    // Rebuild section.chords: drop old position, splice into new position.
    const without = sec.chords.filter((c) => c.id !== chordId);
    const nextChords: SectionChord[] = [];
    if (anchorBeforeId === null) {
      // Place before the first target-pattern SC, or at end if none.
      let inserted = false;
      for (const c of without) {
        if (!inserted && c.progressionPlacement?.patternId === toPatternId) {
          nextChords.push(remapped);
          inserted = true;
        }
        nextChords.push(c);
      }
      if (!inserted) nextChords.push(remapped);
    } else {
      let inserted = false;
      for (const c of without) {
        nextChords.push(c);
        if (!inserted && c.id === anchorBeforeId) {
          nextChords.push(remapped);
          inserted = true;
        }
      }
      if (!inserted) nextChords.push(remapped);
    }

    const nextSections = s.sections.map((x) =>
      x.id !== sectionId ? x : { ...x, chords: nextChords },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, [SSOT_MODE]: true } as any);
  }),

  movePatternChordToSlot: (patternId, chordId, slotIndex) => {
    get().reorderPatternChord(patternId, chordId, Math.max(0, slotIndex));
  },

  movePatternChordsToSlot: (patternId, chordIds, slotIndex) => {
    pushHistory(get);
    set((s) => {
      // SSOT-first: contiguously place selected SectionChords (in original
      // order) at slot `slotIndex` within the pattern's SC group.
      const pattern = s.progression.find((p) => p.id === patternId);
      if (!pattern) return {};
      const sectionId = pattern.sectionId ?? pattern.id;
      const sec = s.sections.find((x) => x.id === sectionId);
      if (!sec) return {};
      const idSet = new Set(chordIds);
      const inPattern = sec.chords.filter((c) => c.progressionPlacement?.patternId === patternId);
      const movingOrdered = inPattern.filter((c) => idSet.has(c.id));
      if (!movingOrdered.length) return {};
      const others = inPattern.filter((c) => !idSet.has(c.id));
      const target = Math.max(0, Math.min(others.length, slotIndex));
      const reordered = [...others.slice(0, target), ...movingOrdered, ...others.slice(target)];

      // Splice these back into the original positions held by `inPattern` in section.chords.
      const slotPositions: number[] = [];
      sec.chords.forEach((c, i) => {
        if (c.progressionPlacement?.patternId === patternId) slotPositions.push(i);
      });
      const nextSections = s.sections.map((x) => {
        if (x.id !== sectionId) return x;
        const next = [...x.chords];
        slotPositions.forEach((origIdx, k) => {
          next[origIdx] = reordered[k];
        });
        return { ...x, chords: next };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    });
  },

  // SSOT-first: add a SectionChord assigned to this pattern (or a sibling
  // pattern with room / a fresh continuation block), placed at slotIndex
  // within the pattern's chord order.
  addChordToPatternSlot: (patternId, chord, slotIndex, lengthBeatsOverride) => {
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
      const defaultLen = lengthBeatsOverride ?? getDefaults().defaultChordLengthBeats;
      const totalBeats = target.bars * target.beatsPerBar;
      const usedInTarget = sec.chords.reduce((sum, sc) => {
        const pp = sc.progressionPlacement;
        return pp && pp.patternId === patternId ? sum + pp.lengthBeats : sum;
      }, 0);
      const freeInTarget = totalBeats - usedInTarget;

      // B1: default lyricsPlacement so the chord appears in the Lyrics view.
      const firstLine = sec.lines.find((l) => !l._isChordOverflow);
      const lyricsPlacement: LyricsPlacement | undefined = firstLine
        ? (() => {
            const occupied = new Set<number>();
            sec.chords.forEach((c) => {
              if (c.lyricsPlacement?.lineId === firstLine.id) {
                occupied.add(c.lyricsPlacement.slotIndex);
              }
            });
            const slot = nearestFreeSlot(occupied, 0);
            return slot >= 0 ? { lineId: firstLine.id, slotIndex: slot } : undefined;
          })()
        : undefined;

      let placement: { progression: PatternBlock[]; sectionChord: SectionChord };
      if (freeInTarget + 1e-9 >= 0.5) {
        const placedLen = Math.min(defaultLen, freeInTarget);
        placement = {
          progression: s.progression,
          sectionChord: {
            id: newId,
            chord,
            lyricsPlacement,
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
          lyricsPlacement,
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

  movePatternChord: (patternId, chordId, direction) => {
    // SSOT-first: reorder within the SectionChord array (only those bound to
    // this pattern), then derive mirrors. Identity is preserved (id stable).
    // Item 4: at the edge of a block, hop to the previous/next block when
    // there is enough capacity in the neighbor.
    const sBefore = get();
    const pattern = sBefore.progression.find((p) => p.id === patternId);
    if (!pattern) return;
    const sectionId = pattern.sectionId ?? pattern.id;
    const sec = sBefore.sections.find((x) => x.id === sectionId);
    if (!sec) return;
    const inPattern = sec.chords.filter((c) => c.progressionPlacement?.patternId === patternId);
    const idx = inPattern.findIndex((c) => c.id === chordId);
    if (idx < 0) return;
    const swapWith = idx + direction;
    if (swapWith >= 0 && swapWith < inPattern.length) {
      set((s) => {
        const a = inPattern[idx];
        const b = inPattern[swapWith];
        const nextSections = s.sections.map((x) => {
          if (x.id !== sectionId) return x;
          const next = x.chords.map((c) => (c.id === a.id ? b : c.id === b.id ? a : c));
          return { ...x, chords: next };
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ sections: nextSections, [SSOT_MODE]: true } as any);
      });
      return;
    }
    // Edge — hop into the neighbor block (Item 4). Land at the end of the
    // previous block (moving left) or the start of the next block (moving
    // right). movePatternChordToPatternAt takes a chord INDEX within the
    // destination block; SSOT re-bins/overflows if the neighbor is full.
    const progIdx = sBefore.progression.findIndex((p) => p.id === patternId);
    const neighbor = sBefore.progression[progIdx + direction];
    if (!neighbor) return;
    const owner = sBefore.sections.find((x) => x.id === (neighbor.sectionId ?? neighbor.id));
    const neighborChords = owner ? getPatternChordsViaSSOT(owner, neighbor) : neighbor.chords;
    const toIndex = direction === -1 ? neighborChords.length : 0;
    get().movePatternChordToPatternAt(patternId, neighbor.id, chordId, toIndex);
  },

  removePatternChordsBatch: (patternId, chordIds) => set((s) => {
    // SSOT-first: drop the listed SectionChords (id === SectionChord.id) from
    // their owning section. Mirrors derive automatically.
    const pattern = s.progression.find((p) => p.id === patternId);
    if (!pattern) return {};
    const sectionId = pattern.sectionId ?? pattern.id;
    const idSet = new Set(chordIds);
    const nextSections = s.sections.map((sec) =>
      sec.id !== sectionId ? sec : { ...sec, chords: sec.chords.filter((c) => !idSet.has(c.id)) },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, [SSOT_MODE]: true } as any);
  }),

  shiftPatternChords: (patternId, chordIds, deltaBeats) => set((s) => {
    // SSOT-first: reorder the entries in section.chords that belong to
    // `patternId` by the requested direction. Pattern.chords is derived.
    const idSet = new Set(chordIds);
    const dir = deltaBeats > 0 ? 1 : -1;
    const ownerSec = s.sections.find((sec) =>
      sec.chords.some((sc) => sc.progressionPlacement?.patternId === patternId),
    );
    if (!ownerSec) return {};
    const groupIdx: number[] = [];
    ownerSec.chords.forEach((sc, i) => {
      if (sc.progressionPlacement?.patternId === patternId) groupIdx.push(i);
    });
    if (groupIdx.length < 2) return {};
    const selectedPos = groupIdx
      .map((idx, pos) => (idSet.has(ownerSec.chords[idx].id) ? pos : -1))
      .filter((p) => p >= 0);
    if (!selectedPos.length) return {};
    const order = dir > 0 ? selectedPos.slice().reverse() : selectedPos.slice();
    const newChords = [...ownerSec.chords];
    const isSelectedAtPos = (pos: number) => idSet.has(newChords[groupIdx[pos]].id);
    for (const pos of order) {
      const otherPos = pos + dir;
      if (otherPos < 0 || otherPos >= groupIdx.length) continue;
      if (isSelectedAtPos(otherPos)) continue;
      const a = groupIdx[pos];
      const b = groupIdx[otherPos];
      [newChords[a], newChords[b]] = [newChords[b], newChords[a]];
    }
    const sections = s.sections.map((sec) => sec.id !== ownerSec.id ? sec : { ...sec, chords: newChords });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections, [SSOT_MODE]: true } as any);
  }),

  movePatternChordsTo: (fromPatternId, toPatternId, chordIds) => set((s) => {
    if (fromPatternId === toPatternId) return {};
    const fromPattern = s.progression.find((p) => p.id === fromPatternId);
    const toPattern = s.progression.find((p) => p.id === toPatternId);
    if (!fromPattern || !toPattern) return {};
    const fromSectionId = fromPattern.sectionId ?? fromPattern.id;
    const toSectionId = toPattern.sectionId ?? toPattern.id;
    const idSet = new Set(chordIds);

    if (fromSectionId === toSectionId) {
      // Same section: just reassign progressionPlacement.patternId, keep
      // section.chords order (move SCs to end of target's group to mirror
      // legacy "append at end" semantics).
      const sec = s.sections.find((x) => x.id === fromSectionId);
      if (!sec) return {};
      const moving = sec.chords.filter((c) => idSet.has(c.id) && c.progressionPlacement);
      if (!moving.length) return {};
      const remapped = moving.map((c) => ({
        ...c,
        progressionPlacement: { ...c.progressionPlacement!, patternId: toPatternId, startBeat: 0 },
      }));
      const without = sec.chords.filter((c) => !idSet.has(c.id));
      // Append remapped at the end of target pattern's group.
      const nextChords: SectionChord[] = [];
      let lastTargetIdx = -1;
      without.forEach((c, i) => {
        if (c.progressionPlacement?.patternId === toPatternId) lastTargetIdx = i;
      });
      if (lastTargetIdx < 0) {
        nextChords.push(...without, ...remapped);
      } else {
        nextChords.push(...without.slice(0, lastTargetIdx + 1), ...remapped, ...without.slice(lastTargetIdx + 1));
      }
      const nextSections = s.sections.map((x) =>
        x.id !== fromSectionId ? x : { ...x, chords: nextChords },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ({ sections: nextSections, [SSOT_MODE]: true } as any);
    }

    // Cross-section: remove from source section.chords (drops lyrics anchor
    // too — matches legacy behavior of detaching the lyric mirror), then
    // place fresh SectionChords into the target section using its
    // progression-placement helper.
    const fromSec = s.sections.find((x) => x.id === fromSectionId);
    if (!fromSec) return {};
    const moving = fromSec.chords.filter((c) => idSet.has(c.id));
    if (!moving.length) return {};

    let workingProgression = s.progression;
    let nextSections = s.sections.map((sec) => {
      if (sec.id !== fromSectionId) return sec;
      return { ...sec, chords: sec.chords.filter((c) => !idSet.has(c.id)) };
    });
    for (const m of moving) {
      const toSec = nextSections.find((x) => x.id === toSectionId);
      if (!toSec) continue;
      // Create a fresh SectionChord in target (no lyricsPlacement — cross-section).
      const newId = nanoid();
      const placement = placeSectionChordInProgression(
        workingProgression,
        toSectionId,
        toSec.chords,
        m.chord,
        newId,
      );
      workingProgression = placement.progression;
      nextSections = nextSections.map((sec) =>
        sec.id !== toSectionId ? sec : { ...sec, chords: [...sec.chords, placement.sectionChord] },
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({ sections: nextSections, progression: workingProgression, [SSOT_MODE]: true } as any);
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
  reorderPatternBlockInSection: (sectionId, fromIndex, toIndex) => {
    pushHistory(get);
    set((s) => {
      // Indices into the section's local block list.
      const sectionBlocks = s.progression.filter((p) => (p.sectionId ?? p.id) === sectionId);
      if (fromIndex < 0 || fromIndex >= sectionBlocks.length) return s;
      const clamped = Math.max(0, Math.min(sectionBlocks.length - 1, toIndex));
      if (clamped === fromIndex) return s;
      const reordered = [...sectionBlocks];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(clamped, 0, moved);
      // Rebuild full progression: for each section in section-order, splice
      // in either reordered (this section) or its original ordered blocks.
      const groups = new Map<string, PatternBlock[]>();
      s.progression.forEach((p) => {
        const sid = p.sectionId ?? p.id;
        const arr = groups.get(sid) ?? [];
        arr.push(p);
        groups.set(sid, arr);
      });
      groups.set(sectionId, reordered);
      const progression: PatternBlock[] = [];
      s.sections.forEach((sec) => (groups.get(sec.id) ?? []).forEach((p) => progression.push(p)));
      // Append orphans (sectionId not matching any current section).
      s.progression.forEach((p) => {
        const sid = p.sectionId ?? p.id;
        if (!s.sections.some((sec) => sec.id === sid) && !progression.includes(p)) progression.push(p);
      });
      return { progression };
    });
  },
  removePatternBlock: (patternId) => set((s) => {
    // Drop every SectionChord assigned to this pattern, then remove the
    // pattern block from the progression. Lyric anchors that referenced the
    // pattern go with it so the Lyrics tab stays in sync.
    const target = s.progression.find((p) => p.id === patternId);
    if (!target) return {};
    const sid = target.sectionId ?? target.id;
    const siblings = s.progression.filter((p) => (p.sectionId ?? p.id) === sid);
    if (siblings.length <= 1) return {}; // can't remove the only block
    // Cross-tab: clear playback cursor if it pointed at this block.
    try {
      const pb = usePlaybackStore.getState();
      if (pb.focusedPatternId === patternId) pb.setStartFromChord(null, null);
    } catch { /* ignore */ }
    const nextSections = s.sections.map((sec) => {
      if (sec.id !== sid) return sec;
      return {
        ...sec,
        chords: sec.chords.filter(
          (sc) => sc.progressionPlacement?.patternId !== patternId,
        ),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ({
      sections: nextSections,
      progression: s.progression.filter((p) => p.id !== patternId),
      [SSOT_MODE]: true,
    } as any);
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
    lastLineTextEdit = null;
    const cur = get();
    const prev = undoStack.pop()!;
    redoStack.push(snapshot(cur));
    if (redoStack.length > HISTORY_LIMIT) redoStack.shift();
    set({ sections: prev.sections, progression: prev.progression, pendingCaret: prev.caret });
    lastCaret = prev.caret;
    return true;
  },
  redo: () => {
    if (!redoStack.length) return false;
    lastLineTextEdit = null;
    const cur = get();
    const next = redoStack.pop()!;
    undoStack.push(snapshot(cur));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    set({ sections: next.sections, progression: next.progression, pendingCaret: next.caret });
    lastCaret = next.caret;
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

    if (parsed.version !== 2 && parsed.version !== 3) throw new Error(`Unsupported project version: ${parsed.version}`);
    // Re-validate every chord through parseChord. Any chord whose display
    // can't be re-parsed is rejected — we replace the whole load with a
    // fresh empty section rather than letting malformed strings into the DOM.
    const validateChord = (c: unknown): ChordSymbol | null => {
      if (!c || typeof c !== "object") return null;
      const display = (c as { display?: unknown }).display;
      if (typeof display !== "string") return null;
      const parsed = parseChord(display);
      if (!parsed) return null;
      const raw = c as { octave?: unknown };
      return typeof raw.octave === "number" ? { ...parsed, octave: raw.octave } : parsed;
    };
    let invalidCount = 0;
    const sectionsRaw: Section[] = parsed.sections?.length ? parsed.sections : [makeSection().section];
    const sectionsLoaded: Section[] = sectionsRaw.map((sec) => ({
      ...sec,
      lines: sec.lines.map((l) => {
        const ll = ensureSlotsForLine(l);
        return {
          ...ll,
          chords: ll.chords
            .map((a) => {
              const v = validateChord(a.chord);
              if (!v) { invalidCount++; return null; }
              return { ...a, chord: v };
            })
            .filter((a): a is NonNullable<typeof a> => !!a),
        };
      }),
      chords: (sec.chords ?? [])
        .map((sc) => {
          const v = validateChord(sc.chord);
          if (!v) { invalidCount++; return null; }
          return { ...sc, chord: v };
        })
        .filter((sc): sc is NonNullable<typeof sc> => !!sc),
    }));
    // Self-heal: re-home any SectionChord whose lyricsPlacement points to a
    // line that no longer exists (e.g. an overflow row stripped by a prior
    // save). Such a chord is invisible in Write & Record yet still played and
    // shown in Arrange — and unreachable, so the user can't correct it. Drop
    // it onto the last real row so it becomes visible and editable. This runs
    // unconditionally on load (the Lyrics-tab reflow only fires on a width
    // change, so it can't be relied on to repair existing projects).
    let orphansHealed = 0;
    let collisionsHealed = 0;
    const reconciledSections: Section[] = sectionsLoaded.map((sec) => {
      const validLineIds = new Set(sec.lines.map((l) => l.id));
      // Pre-scan for two repairable defects:
      //  • orphan — a lyric anchor pointing at a line that no longer exists.
      //  • collision — two chords sharing a (line, slot), which renders as
      //    overlapping chips in Write. This is the symptom the user hit when a
      //    chord moved between pattern blocks but kept a stale anchor on its
      //    old row. The first chord (array order) to claim a slot is the
      //    keeper; later occupants are duplicates to repair.
      const keptSlots = new Map<string, Set<number>>();
      const dupIds = new Set<string>();
      let hasOrphan = false;
      for (const sc of sec.chords) {
        const lp = sc.lyricsPlacement;
        if (!lp) continue;
        if (!validLineIds.has(lp.lineId)) { hasOrphan = true; continue; }
        let s = keptSlots.get(lp.lineId);
        if (!s) { s = new Set<number>(); keptSlots.set(lp.lineId, s); }
        if (s.has(lp.slotIndex)) dupIds.add(sc.id);
        else s.add(lp.slotIndex);
      }
      if (!hasOrphan && dupIds.size === 0) return sec;

      const lines = sec.lines.map((l) => ({ ...l, chords: [...l.chords] }));
      const lineById = new Map(lines.map((l) => [l.id, l] as const));
      const homeRow =
        [...lines].reverse().find((l) => !l._isChordOverflow) ?? lines[lines.length - 1] ?? null;
      // Seed occupancy with the keeper slots so re-homed orphans and re-slotted
      // duplicates never land on a slot a valid chord already holds.
      const occupied = new Map<string, Set<number>>();
      for (const [lid, s] of keptSlots) occupied.set(lid, new Set(s));
      const nextFree = (lineId: string) => {
        let s = occupied.get(lineId);
        if (!s) { s = new Set<number>(); occupied.set(lineId, s); }
        let slot = 0;
        while (s.has(slot) && slot < CHORD_ROW_SLOTS - 1) slot++;
        s.add(slot);
        return slot;
      };
      const chords = sec.chords.map((sc) => {
        const lp = sc.lyricsPlacement;
        if (!lp) return sc;
        // Orphan: lyric anchor points at a line that no longer exists.
        if (!validLineIds.has(lp.lineId)) {
          orphansHealed++;
          // Still anchored to a block: leave it unplaced so Write's progression
          // chord row shows it, instead of pinning it onto a lyric line where it
          // would travel with lyric edits. Only a chord with no block home is
          // re-homed to a visible row so it isn't lost entirely.
          if (sc.progressionPlacement) return { ...sc, lyricsPlacement: undefined };
          if (!homeRow) return { ...sc, lyricsPlacement: undefined };
          const slotIndex = Math.min(CHORD_ROW_SLOTS - 1, nextFree(homeRow.id));
          homeRow.chords.push({
            id: sc.id,
            offset: slotIndex,
            slotIndex,
            chord: sc.chord,
            mirrorId: sc.progressionPlacement ? sc.id : undefined,
          });
          return { ...sc, lyricsPlacement: { lineId: homeRow.id, slotIndex } };
        }
        // Collision: a later occupant of an already-claimed (line, slot).
        if (dupIds.has(sc.id)) {
          collisionsHealed++;
          // Block-anchored chords drop the stale anchor (they survive in the
          // progression / Arrange views); pure-lyric chords slide to a free
          // slot on the same line.
          if (sc.progressionPlacement) {
            const ln = lineById.get(lp.lineId);
            if (ln) ln.chords = ln.chords.filter((a) => a.id !== sc.id);
            return { ...sc, lyricsPlacement: undefined };
          }
          const slot = Math.min(CHORD_ROW_SLOTS - 1, nextFree(lp.lineId));
          const a = lineById.get(lp.lineId)?.chords.find((x) => x.id === sc.id);
          if (a) { a.slotIndex = slot; a.offset = slot; }
          return { ...sc, lyricsPlacement: { ...lp, slotIndex: slot } };
        }
        return sc;
      });
      return { ...sec, lines, chords };
    });
    if ((orphansHealed > 0 || collisionsHealed > 0) && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[song.load] repaired ${orphansHealed} orphaned + ${collisionsHealed} colliding chord anchor(s)`);
    }
    const progressionLoaded: PatternBlock[] = parsed.progression?.length ? parsed.progression : [makeSection().pattern];
    const migratedProgression = progressionLoaded.map((p) => ({
      ...p,
      sectionId: p.sectionId ?? p.id,
      chords: repackChords(
        (p.chords as Array<{ chord: ChordSymbol; id: string; startBeat: number; lengthBeats: number; mirrorId?: string }>)
          .map((c) => {
            const v = validateChord(c.chord);
            if (!v) { invalidCount++; return null; }
            return { ...c, chord: v };
          })
          .filter((c): c is { chord: ChordSymbol; id: string; startBeat: number; lengthBeats: number; mirrorId?: string } => !!c),
        p.bars * p.beatsPerBar,
      ),
    }));
    if (invalidCount > 0 && typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[song.load] dropped ${invalidCount} invalid chord(s) from imported file`);
    }
    set({
      meta: { beatsPerBar: 4, beatUnit: 4, ...(parsed.meta ?? get().meta) },
      sections: reconciledSections,
      progression: migratedProgression,
      basket: [],
      suppressCrossTabDeleteWarning: !!parsed.suppressCrossTabDeleteWarning,
      inspirationPhotos: Array.isArray(parsed.inspirationPhotos) ? parsed.inspirationPhotos : [],
    });
    // Sound settings live in their own store but travel with the song JSON.
    useSoundStore.getState().loadFrom(parsed.sound);
    // App background tint also travels with the project.
    const rawTint = parsed.appTint;
    useAppTintStore.getState().setTint(
      typeof rawTint === "string" && (SECTION_COLOR_KEYS as readonly string[]).includes(rawTint)
        ? (rawTint as SectionColor)
        : null,
    );
    const rawBg = parsed.appBackground;
    if (rawBg && typeof rawBg === "object") {
      useAppBackgroundStore.getState().setPattern(
        (PATTERN_KEYS as string[]).includes(rawBg.pattern) ? rawBg.pattern as BackgroundPattern : "none",
      );
      useAppBackgroundStore.getState().setMask(
        (MASK_KEYS as string[]).includes(rawBg.mask) ? rawBg.mask as MaskStyle : "none",
      );
    } else {
      useAppBackgroundStore.getState().setPattern("none");
      useAppBackgroundStore.getState().setMask("none");
    }
    // Surface layout metadata so the UI can offer a friendly auto-format
    // toast when the device width has changed since last save.
    if (parsed.layoutMeta && typeof window !== "undefined") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__lvLastLayoutMeta = parsed.layoutMeta;
        window.dispatchEvent(new CustomEvent("lv-song-loaded", { detail: { layoutMeta: parsed.layoutMeta } }));
      } catch { /* ignore */ }
    }
  },
  toJSON: () => {
    const s = get();
    // Strip transient overflow continuation rows: they are device-specific
    // and regenerated by autoLayoutSection on load. Their SectionChords must
    // first be re-homed onto the parent (preceding non-overflow) line —
    // otherwise the placements dangle on reload: invisible in Write & Record
    // but still played and shown in Arrange (the "phantom chord" bug).
    const cleanedSections: Section[] = s.sections.map((sec) => {
      const parentOf = new Map<string, string>();
      let lastParentId: string | null = null;
      for (const l of sec.lines) {
        if (l._isChordOverflow) {
          if (lastParentId) parentOf.set(l.id, lastParentId);
        } else {
          lastParentId = l.id;
        }
      }
      const lines = sec.lines
        .filter((l) => !l._isChordOverflow)
        .map((l) => ({ ...l, chords: [...l.chords] }));
      const lineById = new Map(lines.map((l) => [l.id, l] as const));
      const chords = sec.chords.map((sc) => {
        const lp = sc.lyricsPlacement;
        if (!lp) return sc;
        const parent = parentOf.get(lp.lineId);
        if (!parent) return sc;
        const pline = lineById.get(parent);
        if (pline && !pline.chords.some((a) => a.id === sc.id)) {
          pline.chords.push({
            id: sc.id,
            offset: lp.slotIndex,
            slotIndex: lp.slotIndex,
            chord: sc.chord,
            mirrorId: sc.progressionPlacement ? sc.id : undefined,
          });
        }
        return { ...sc, lyricsPlacement: { ...lp, lineId: parent } };
      });
      return { ...sec, lines, chords };
    });
    const width = typeof window !== "undefined" ? window.innerWidth : 0;
    return {
      version: 3,
      meta: s.meta,
      sections: cleanedSections,
      progression: s.progression,
      suppressCrossTabDeleteWarning: s.suppressCrossTabDeleteWarning,
      inspirationPhotos: s.inspirationPhotos.length > 0 ? s.inspirationPhotos : undefined,
      sound: useSoundStore.getState().toJSON(),
      appTint: useAppTintStore.getState().tint,
      appBackground: {
        pattern: useAppBackgroundStore.getState().pattern,
        mask: useAppBackgroundStore.getState().mask,
      },
      layoutMeta: width > 0 ? {
        lastEditedScreenWidth: width,
        lastEditedDevice: getDeviceTypeForWidth(width),
        lastEditedAt: Date.now(),
      } : undefined,
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

// Counter-based interaction gate. While > 0, autosave skips writes; on
// release (count returns to 0), it forces one save with the final state.
// Used by the global DragDropContext to avoid persisting per-chord
// intermediate states during a multi-chord drag.
let interactionDepth = 0;
let pendingSaveDuringInteraction = false;
export function beginInteraction() {
  interactionDepth++;
}
export function endInteraction() {
  if (interactionDepth > 0) interactionDepth--;
  if (interactionDepth === 0 && pendingSaveDuringInteraction) {
    pendingSaveDuringInteraction = false;
    try {
      const state = useSongStore.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.toJSON()));
    } catch { notifyStorageQuota(); }
  }
}

export function startAutosave() {
  return useSongStore.subscribe((state) => {
    if (interactionDepth > 0) {
      pendingSaveDuringInteraction = true;
      return;
    }
    try {
      const json = state.toJSON();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
    } catch { notifyStorageQuota(); }
  });
}

/**
 * Warn once when another tab writes the song slot. Both tabs autosave to the
 * same localStorage key (last write wins), so concurrent editing silently
 * overwrites work. `storage` events only fire for writes from *other* tabs.
 */
export function startCrossTabWarning() {
  let warned = false;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || warned) return;
    warned = true;
    toast.warning("This song is open in another tab", {
      id: "cross-tab",
      description:
        "Both tabs save to the same place, so the last one to save wins. Close one tab to avoid losing edits.",
      duration: Infinity,
    });
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** True when the current song holds work worth preserving (title, lyrics, chords,
 *  or inspiration photos). Used to avoid pushing empty drafts into recents. */
export function songHasContent(s = useSongStore.getState()): boolean {
  if (s.meta.title.trim()) return true;
  if (s.inspirationPhotos.length > 0) return true;
  return s.sections.some(
    (sec) => sec.chords.length > 0 || sec.lines.some((l) => l.text.trim().length > 0),
  );
}

/** Snapshot the current song into recents before it gets wiped by a "new song"
 *  flow, so an in-progress idea is always recoverable from the landing page. */
export function commitCurrentSongToRecents() {
  const s = useSongStore.getState();
  if (!songHasContent(s)) return;
  try {
    pushRecent({ name: s.meta.title || "Untitled Song", snapshot: s.toJSON() });
  } catch { /* ignore */ }
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

export async function buildProjectZipBlob(): Promise<Blob> {
  const [{ default: JSZip }, { useRecordingsStore }, { getAudioBlob }, { extFromMime }] = await Promise.all([
    import("jszip"),
    import("@/store/recordings"),
    import("@/lib/audio/blob-store"),
    import("@/lib/audio/waveform"),
  ]);
  const songJson = useSongStore.getState().toJSON() as SerializedSong & { recordings?: { tracks: unknown[] } };
  const recordingsJson = useRecordingsStore.getState().toJSON();
  (songJson as SerializedSong & { recordings?: typeof recordingsJson }).recordings = recordingsJson;
  const zip = new JSZip();
  zip.file("song.json", JSON.stringify(songJson, null, 2));
  const audioFolder = zip.folder("audio");
  if (audioFolder) {
    for (const track of recordingsJson.tracks) {
      for (const clip of track.clips ?? []) {
        const blob = await getAudioBlob(clip.blobId);
        if (blob) {
          audioFolder.file(`${clip.blobId}.${extFromMime(blob.type)}`, blob);
        }
      }
    }
  }
  return zip.generateAsync({ type: "blob" });
}

export async function downloadProjectZip(filename = "song.zip") {
  const out = await buildProjectZipBlob();
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadProjectFromZipFile(file: File): Promise<void> {
  const [{ default: JSZip }, { useRecordingsStore }] = await Promise.all([
    import("jszip"),
    import("@/store/recordings"),
  ]);
  const zip = await JSZip.loadAsync(file);
  const songFile = zip.file("song.json");
  if (!songFile) throw new Error("Missing song.json in archive");
  const songText = await songFile.async("string");
  const data = JSON.parse(songText) as SerializedSong & { recordings?: { tracks: unknown[] } };
  useSongStore.getState().loadFromJSON(data);

  // Restore audio blobs.
  const audioFolder = zip.folder("audio");
  if (audioFolder) {
    const entries: { id: string; blob: Promise<Blob> }[] = [];
    audioFolder.forEach((relativePath, file) => {
      if (file.dir) return;
      const base = relativePath.split("/").pop() || relativePath;
      const id = base.replace(/\.[^.]+$/, "");
      entries.push({ id, blob: file.async("blob") });
    });
    if (entries.length > 0) {
      const { putAudioBlob } = await import("@/lib/audio/blob-store");
      for (const { id, blob } of entries) {
        const b = await blob;
        await putAudioBlob(id, b);
      }
    }
  }

  // Restore recordings store state.
  const recordings = (data as { recordings?: { tracks?: unknown } }).recordings;
  if (recordings && Array.isArray(recordings.tracks)) {
    // Cast to the store's RecTrack[] shape — JSON shape matches at runtime.
    useRecordingsStore.getState().hydrate(recordings.tracks as Parameters<ReturnType<typeof useRecordingsStore.getState>["hydrate"]>[0]);
  } else {
    useRecordingsStore.getState().clear();
  }
}

export async function loadProjectFromFile(file: File): Promise<void> {
  const isZip = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
  if (isZip) {
    await loadProjectFromZipFile(file);
    return;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        useSongStore.getState().loadFromJSON(data);
        // Plain JSON has no recordings — clear them.
        import("@/store/recordings").then((m) => m.useRecordingsStore.getState().clear()).catch(() => { /* noop */ });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
