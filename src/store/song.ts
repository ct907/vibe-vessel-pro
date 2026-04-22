import { create } from "zustand";
import { nanoid } from "nanoid";
import { ChordSymbol, transposeChord, transposeKey, Mode } from "@/lib/music/chords";

// ---------- Types ----------

export interface ChordAnchor {
  id: string;
  /** Legacy: character offset within the lyric line (kept for migration). */
  offset: number;
  /** New: column position in the chord row (in monospace cells). Independent from lyric text. */
  chordCol?: number;
  chord: ChordSymbol;
  /** Optional: id of the corresponding pattern chord this is mirrored to. */
  mirrorId?: string;
}

export interface LyricLine {
  id: string;
  text: string;
  chords: ChordAnchor[];
  /** Number of cursor cells in the chord row (>= max chord col + 1). */
  chordRowLen?: number;
}

export type SectionType = "verse" | "chorus" | "bridge" | "intro" | "outro" | "pre-chorus" | "custom";

export interface Section {
  id: string;
  label: string;
  type: SectionType;
  collapsed: boolean;
  lines: LyricLine[];
  /** Optional notes/comment for this section. */
  comment?: string;
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
  pasteChordsAt: (
    sectionId: string, lineId: string, atCol: number,
    chords: { chord: ChordSymbol; relCol: number; widthCh: number }[],
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
  reorderPatternChord: (patternId: string, chordId: string, toIndex: number) => void;
  movePatternChordToPatternAt: (fromPatternId: string, toPatternId: string, chordId: string, toIndex: number) => void;
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
  version: 2;
  meta: SongState["meta"];
  sections: Section[];
  progression: PatternBlock[];
  suppressCrossTabDeleteWarning?: boolean;
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
  return {
    section: {
      id,
      type,
      label: finalLabel,
      collapsed: false,
      lines: [initialLine()],
    },
    pattern: {
      id,
      sectionId: id,
      label: finalLabel,
      bars: 4,
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
  const len = 2;
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

// ---------- Store ----------

const seed = makeSection("verse");

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

export const useSongStore = create<SongState>((set, get) => ({
  meta: { title: "Untitled Song", keyRoot: "C", keyMode: "maj", bpm: 92 },
  sections: [seed.section],
  basket: [],
  progression: [seed.pattern],
  suppressCrossTabDeleteWarning: false,
  setSuppressCrossTabDeleteWarning: (v) => set({ suppressCrossTabDeleteWarning: v }),

  setTitle: (title) => set((s) => ({ meta: { ...s.meta, title } })),
  setKey: (keyRoot, keyMode) => set((s) => ({ meta: { ...s.meta, keyRoot, keyMode } })),
  setBpm: (bpm) => set((s) => ({ meta: { ...s.meta, bpm: Math.max(40, Math.min(220, bpm)) } })),

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
        // Chord row is now decoupled from lyric text; just update the text.
        lines: sec.lines.map((l) => (l.id === id ? { ...l, text } : l)),
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

  removeChordAnchor: (sectionId, lineId, anchorId) => { pushHistory(get); return set((s) => {
    let mirrorId: string | undefined;
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          const removed = l.chords.find((c) => c.id === anchorId);
          mirrorId = removed?.mirrorId;
          return { ...l, chords: l.chords.filter((c) => c.id !== anchorId) };
        }),
      };
    });
    const progression = mirrorId
      ? s.progression.map((p) =>
          p.id !== sectionId ? p : { ...p, chords: p.chords.filter((c) => c.id !== mirrorId) },
        )
      : s.progression;
    return { sections, progression };
  }); },

  removeChordAnchorsBatch: (sectionId, lineId, anchorIds) => { pushHistory(get); return set((s) => {
    const idSet = new Set(anchorIds);
    const mirrorIds = new Set<string>();
    const sections = s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => {
          if (l.id !== lineId) return l;
          l.chords.forEach((c) => { if (idSet.has(c.id) && c.mirrorId) mirrorIds.add(c.mirrorId); });
          return { ...l, chords: l.chords.filter((c) => !idSet.has(c.id)) };
        }),
      };
    });
    const progression = mirrorIds.size
      ? s.progression.map((p) => p.id !== sectionId ? p : { ...p, chords: p.chords.filter((c) => !mirrorIds.has(c.id)) })
      : s.progression;
    return { sections, progression };
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

  // Add chord into pattern; mirror it back as an anchor at end of last lyric line of bound section.
  addChordToPattern: (patternId, chord, atBeat, lengthBeats = 4) => set((s) => {
    const newPcId = nanoid();
    let createdAnchorId: string | null = null;

    // 1) Create the anchor in the bound section's last line
    const sections = s.sections.map((sec) => {
      if (sec.id !== patternId) return sec;
      const lines = [...sec.lines];
      if (!lines.length) lines.push(initialLine());
      const lastIdx = lines.length - 1;
      const last = lines[lastIdx];
      const newAnchorId = nanoid();
      createdAnchorId = newAnchorId;
      const nextCol = (last.chordRowLen ?? 0) > 0
        ? (last.chordRowLen ?? 0) + 1
        : 0;
      lines[lastIdx] = {
        ...last,
        chords: [...last.chords, { id: newAnchorId, offset: nextCol, chordCol: nextCol, chord, mirrorId: newPcId }]
          .sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0)),
        chordRowLen: nextCol + 1,
      };
      return { ...sec, lines };
    });

    // 2) Add the pattern chord with the back-link, then re-pack left-aligned.
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const start = Math.max(0, Math.min(totalBeats - 1, atBeat));
      const pc: PatternChord = {
        id: newPcId,
        chord,
        startBeat: start,
        lengthBeats: Math.max(0.5, Math.min(lengthBeats, totalBeats)),
        mirrorId: createdAnchorId ?? undefined,
      };
      // Append at end so it packs after existing chords.
      const lastEnd = p.chords.length
        ? Math.max(...p.chords.map((c) => c.startBeat + c.lengthBeats))
        : 0;
      const merged = [...p.chords, { ...pc, startBeat: lastEnd }];
      return { ...p, chords: repackChords(merged, totalBeats) };
    });

    return { sections, progression };
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

  setPatternChordLength: (patternId, chordId, lengthBeats) => set((s) => {
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      // Compute the maximum length this chord can have without bumping siblings off the grid:
      // total - (sum of other chords' lengths).
      const othersSum = p.chords.reduce((sum, c) => sum + (c.id === chordId ? 0 : c.lengthBeats), 0);
      const maxForThis = Math.max(0.5, totalBeats - othersSum);
      const next = p.chords.map((c) =>
        c.id === chordId
          ? { ...c, lengthBeats: Math.max(0.5, Math.min(lengthBeats, maxForThis)) }
          : c,
      );
      return { ...p, chords: repackChords(next, totalBeats) };
    });
    return { progression };
  }),

  reorderPatternChord: (patternId, chordId, toIndex) => set((s) => {
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const fromIdx = sorted.findIndex((c) => c.id === chordId);
      if (fromIdx < 0) return p;
      const [moved] = sorted.splice(fromIdx, 1);
      let insertAt = Math.max(0, Math.min(sorted.length, toIndex));
      // Removing from before the target shifts the target index left by one.
      if (toIndex > fromIdx) insertAt = Math.max(0, insertAt - 1);
      sorted.splice(insertAt, 0, moved);
      // Reassign startBeats so repack (which sorts by startBeat) preserves new order.
      let cursor = 0;
      const reseq = sorted.map((c) => {
        const next = { ...c, startBeat: cursor };
        cursor += c.lengthBeats;
        return next;
      });
      return { ...p, chords: repackChords(reseq, totalBeats) };
    });
    const updatedPattern = progression.find((p) => p.id === patternId);
    const sections = updatedPattern ? syncAnchorsFromPattern(s.sections, updatedPattern) : s.sections;
    return { progression, sections };
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

  removePatternChord: (patternId, chordId) => set((s) => {
    let mirrorAnchorId: string | undefined;
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const found = p.chords.find((c) => c.id === chordId);
      mirrorAnchorId = found?.mirrorId;
      const totalBeats = p.bars * p.beatsPerBar;
      return { ...p, chords: repackChords(p.chords.filter((c) => c.id !== chordId), totalBeats) };
    });
    const sections = mirrorAnchorId
      ? s.sections.map((sec) => {
          if (sec.id !== patternId) return sec;
          return {
            ...sec,
            lines: sec.lines.map((l) => ({
              ...l,
              chords: l.chords.filter((a) => a.id !== mirrorAnchorId),
            })),
          };
        })
      : s.sections;
    return { progression, sections };
  }),

  movePatternChord: (patternId, chordId, direction) => set((s) => {
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const idx = sorted.findIndex((c) => c.id === chordId);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return p;
      [sorted[idx], sorted[swapWith]] = [sorted[swapWith], sorted[idx]];
      // Reassign startBeats so repack (which sorts by startBeat) preserves the swap.
      let cursor = 0;
      const reseq = sorted.map((c) => {
        const next = { ...c, startBeat: cursor };
        cursor += c.lengthBeats;
        return next;
      });
      return { ...p, chords: repackChords(reseq, totalBeats) };
    });
    const updatedPattern = progression.find((p) => p.id === patternId);
    const sections = updatedPattern ? syncAnchorsFromPattern(s.sections, updatedPattern) : s.sections;
    return { progression, sections };
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
        bars: ref.bars,
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
  replacePatternChords: (patternId, chords) => set((s) => {
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      // Preserve length structure, swap chord identities. Detach mirror links.
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const next = sorted.map((c, i) => ({
        ...c,
        chord: chords[i] ?? c.chord,
        mirrorId: undefined,
      }));
      return { ...p, chords: repackChords(next, p.bars * p.beatsPerBar) };
    });
    return { progression };
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
      };
      // Take first v1 pattern (if any) and bind its id to the new section.
      const firstPattern: PatternBlock = v1Progression?.[0]
        ? { ...v1Progression[0], id: sectionId, label: "Verse" }
        : { id: sectionId, label: "Verse", bars: 4, beatsPerBar: 4, chords: [] };
      // any extra v1 patterns become their own bare sections
      const extras = (v1Progression?.slice(1) ?? []).map((p, i) => {
        const sid = nanoid();
        const sec: Section = { id: sid, type: "custom", label: p.label || `Section ${i + 2}`, collapsed: false, lines: [initialLine()] };
        const pat: PatternBlock = { ...p, id: sid };
        return { sec, pat };
      });
      set({
        meta: parsed.meta ?? get().meta,
        sections: [section, ...extras.map((e) => e.sec)],
        progression: [firstPattern, ...extras.map((e) => e.pat)],
        basket: [],
      });
      return;
    }

    if (parsed.version !== 2) return;
    const sectionsLoaded: Section[] = parsed.sections?.length ? parsed.sections : [makeSection().section];
    const progressionLoaded: PatternBlock[] = parsed.progression?.length ? parsed.progression : [makeSection().pattern];
    // Migrate legacy patterns: if no sectionId, fall back to id (1:1 pairing).
    const migratedProgression = progressionLoaded.map((p) => ({
      ...p,
      sectionId: p.sectionId ?? p.id,
      chords: repackChords(p.chords, p.bars * p.beatsPerBar),
    }));
    set({
      meta: parsed.meta ?? get().meta,
      sections: sectionsLoaded,
      progression: migratedProgression,
      basket: [],
      suppressCrossTabDeleteWarning: !!parsed.suppressCrossTabDeleteWarning,
    });
  },
  toJSON: () => {
    const s = get();
    return {
      version: 2,
      meta: s.meta,
      sections: s.sections,
      progression: s.progression,
      suppressCrossTabDeleteWarning: s.suppressCrossTabDeleteWarning,
    };
  },
}));

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
