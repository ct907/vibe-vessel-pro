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
  id: string; // SAME id as its bound section
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
  toggleSectionCollapsed: (id: string) => void;
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
  /** Move selected chords by one slot in chord-list order, ignoring spaces.
   *  direction = +1: snap each selected chord to just after its right neighbor (after that neighbor's last trailing space).
   *  direction = -1: snap each selected chord to just before its left neighbor (before that neighbor's leading space).
   */
  moveSelectedChordsByOrder: (sectionId: string, lineId: string, anchorIds: string[], direction: -1 | 1) => void;
  /** Move a single chord anchor to another (section,line,col). Mirror link is detached. */
  moveChordAnchor: (
    fromSectionId: string, fromLineId: string, anchorId: string,
    toSectionId: string, toLineId: string, toCol: number,
  ) => void;
  /** Paste a list of chord shapes at the given column (no anchorId reuse). */
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

  // ---- persistence ----
  loadFromJSON: (data: unknown) => void;
  toJSON: () => SerializedSong;
}

export interface SerializedSong {
  version: 2;
  meta: SongState["meta"];
  sections: Section[];
  progression: PatternBlock[];
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
 * Place a new chord into a pattern with default 2-beat length, expanding bars
 * (or creating a new mirror pattern would be too disruptive — we just expand
 * bars on the bound block, capped at 32).
 * Returns the created PatternChord id.
 */
function placeMirroredChord(pattern: PatternBlock, chord: ChordSymbol, mirrorId: string): { pattern: PatternBlock; chordId: string } {
  const len = 2;
  let next = pattern;
  let start = nextFreeBeat(next);
  let total = next.bars * next.beatsPerBar;
  if (start + len > total) {
    // grow bars to fit, cap at 32 bars
    const neededBars = Math.min(32, Math.ceil((start + len) / next.beatsPerBar));
    next = { ...next, bars: neededBars };
    total = next.bars * next.beatsPerBar;
    if (start + len > total) {
      // still no room; clamp into last beat
      start = Math.max(0, total - len);
    }
  }
  const id = nanoid();
  const pc: PatternChord = {
    id,
    chord,
    startBeat: start,
    lengthBeats: Math.min(len, total - start),
    mirrorId,
  };
  return {
    pattern: { ...next, chords: [...next.chords, pc].sort((a, b) => a.startBeat - b.startBeat) },
    chordId: id,
  };
}

// ---------- Store ----------

const seed = makeSection("verse");

export const useSongStore = create<SongState>((set, get) => ({
  meta: { title: "Untitled Song", keyRoot: "C", keyMode: "maj", bpm: 92 },
  sections: [seed.section],
  basket: [],
  progression: [seed.pattern],

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
      ? s.progression.map((p) => (p.id === id ? { ...p, label: patch.label! } : p))
      : s.progression,
  })),
  removeSection: (id) => set((s) => {
    if (s.sections.length <= 1) return s;
    return {
      sections: s.sections.filter((sec) => sec.id !== id),
      progression: s.progression.filter((p) => p.id !== id),
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
      : { id: newId, label: newSection.label, bars: 4, beatsPerBar: 4, chords: [] };

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
    // mirror order in progression
    const pIdx = s.progression.findIndex((p) => p.id === id);
    const pSwap = s.progression.findIndex((p) => p.id === sections[idx].id); // after swap, idx now holds previous swap section
    const progression = [...s.progression];
    if (pIdx >= 0 && pSwap >= 0) {
      [progression[pIdx], progression[pSwap]] = [progression[pSwap], progression[pIdx]];
    }
    return { sections, progression };
  }),
  toggleSectionCollapsed: (id) => set((s) => ({
    sections: s.sections.map((sec) => (sec.id === id ? { ...sec, collapsed: !sec.collapsed } : sec)),
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
      const removed = sec.lines.find((l) => l.id === id);
      // Also unlink any mirrored pattern chords (they remain in the pattern; user can edit/delete there).
      return { ...sec, lines: sec.lines.filter((l) => l.id !== id) };
    }),
    // Detach mirror links on the bound pattern for orphaned anchor ids
    progression: (() => {
      const sec = s.sections.find((x) => x.id === sectionId);
      const removed = sec?.lines.find((l) => l.id === id);
      if (!removed?.chords.length) return s.progression;
      const anchorIds = new Set(removed.chords.map((a) => a.id));
      return s.progression.map((p) =>
        p.id !== sectionId
          ? p
          : { ...p, chords: p.chords.map((c) => (c.mirrorId && anchorIds.has(c.mirrorId) ? { ...c, mirrorId: undefined } : c)) },
      );
    })(),
  })),
  setLineText: (sectionId, id, text) => set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        // Chord row is now decoupled from lyric text; just update the text.
        lines: sec.lines.map((l) => (l.id === id ? { ...l, text } : l)),
      };
    }),
  })),

  setChordRowLen: (sectionId, id, len) => set((s) => ({
    sections: s.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        lines: sec.lines.map((l) => (l.id === id ? { ...l, chordRowLen: Math.max(0, len) } : l)),
      };
    }),
  })),

  insertChordSpaceAt: (sectionId, lineId, col) => set((s) => ({
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
  })),

  removeChordCellAt: (sectionId, lineId, col) => {
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
  upsertChordAt: (sectionId, lineId, col, chord, anchorId) => set((s) => {
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

    // Mirror to pattern (unchanged)
    let progression = s.progression;
    if (createdAnchorId) {
      progression = s.progression.map((p) => {
        if (p.id !== sectionId) return p;
        const placed = placeMirroredChord(p, chord, createdAnchorId!);
        return placed.pattern;
      });
      const newPcByPattern = new Map<string, string>();
      progression.forEach((p) => {
        if (p.id === sectionId) {
          const pc = p.chords.find((c) => c.mirrorId === createdAnchorId);
          if (pc) newPcByPattern.set(p.id, pc.id);
        }
      });
      const pcId = newPcByPattern.get(sectionId);
      if (pcId) {
        for (const sec of sections) {
          if (sec.id !== sectionId) continue;
          for (const ln of sec.lines) {
            const a = ln.chords.find((x) => x.id === createdAnchorId);
            if (a) a.mirrorId = pcId;
          }
        }
      }
    } else if (updatedAnchorId && prevMirrorId) {
      progression = s.progression.map((p) =>
        p.id !== sectionId
          ? p
          : { ...p, chords: p.chords.map((c) => (c.id === prevMirrorId ? { ...c, chord } : c)) },
      );
    }

    return { sections, progression };
  }),

  removeChordAnchor: (sectionId, lineId, anchorId) => set((s) => {
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
  }),

  removeChordAnchorsBatch: (sectionId, lineId, anchorIds) => set((s) => {
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
  }),

  shiftChordAnchors: (sectionId, lineId, anchorIds, deltaCols) => set((s) => {
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
  }),

  moveSelectedChordsByOrder: (sectionId, lineId, anchorIds, direction) => set((s) => {
    const idSet = new Set(anchorIds);
    return {
      sections: s.sections.map((sec) => {
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
                // Find first non-selected neighbor to the right.
                const right = work.slice(idx + 1).find((c) => !idSet.has(c.id));
                if (!right) continue;
                const rCol = right.chordCol ?? right.offset ?? 0;
                const rWidth = Math.max(1, right.chord.display.length);
                // Place selected just after right neighbor's chip + 1 trailing space.
                const newCol = rCol + rWidth + 1;
                // Shift the right neighbor leftward into the slot vacated.
                const shift = newCol - rCol; // positive = right shift; we want to swap positions.
                // Compute new positions: right neighbor moves to curCol; selected moves after right neighbor's new end.
                const rightNewCol = curCol;
                const selNewCol = rightNewCol + rWidth + 1;
                work[idx] = { ...cur, chordCol: selNewCol, offset: selNewCol };
                const rIdx = work.findIndex((c) => c.id === right.id);
                work[rIdx] = { ...right, chordCol: rightNewCol, offset: rightNewCol };
              } else {
                const left = [...work.slice(0, idx)].reverse().find((c) => !idSet.has(c.id));
                if (!left) continue;
                const lCol = left.chordCol ?? left.offset ?? 0;
                const lWidth = Math.max(1, left.chord.display.length);
                // Swap: selected takes left's old col; left moves to selected's old col.
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
      }),
    };
  }),

  moveChordAnchor: (fromSectionId, fromLineId, anchorId, toSectionId, toLineId, toCol) => set((s) => {
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

    // The dropped chord visually occupies its display width; reserve that
    // many cells plus 4ch of breathing room so chips don't overlap when
    // re-arranged via drag.
    const reservedWidth = Math.max(1, movedChord.display.length) + 4;

    // Same row: shift this anchor's column, pushing colliding chords aside.
    if (fromSectionId === toSectionId && fromLineId === toLineId) {
      return {
        sections: s.sections.map((sec) => sec.id !== fromSectionId ? sec : {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== fromLineId) return l;
            // Compute push needed for any non-moved chord that overlaps the
            // [toCol, toCol+reservedWidth) zone.
            const others = l.chords.filter((c) => c.id !== anchorId);
            const collision = others.find((c) => {
              const cc = c.chordCol ?? c.offset ?? 0;
              const cEnd = cc + Math.max(1, c.chord.display.length);
              return cc < toCol + reservedWidth && cEnd > toCol;
            });
            const push = collision ? (toCol + reservedWidth) - (collision.chordCol ?? collision.offset ?? 0) : 0;
            const chords = l.chords.map((c) => {
              if (c.id === anchorId) return { ...c, chordCol: toCol, offset: toCol };
              const cc = c.chordCol ?? c.offset ?? 0;
              if (push > 0 && cc >= toCol) return { ...c, chordCol: cc + push, offset: cc + push };
              return c;
            }).sort((a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0));
            const minLen = chords.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + Math.max(1, c.chord.display.length) + 1), toCol + reservedWidth);
            return { ...l, chords, chordRowLen: Math.max(l.chordRowLen ?? 0, minLen) };
          }),
        }),
      };
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
              const cEnd = cc + Math.max(1, c.chord.display.length);
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
            const minLen = chords.reduce((m, c) => Math.max(m, (c.chordCol ?? c.offset ?? 0) + Math.max(1, c.chord.display.length) + 1), toCol + reservedWidth);
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
  }),

  pasteChordsAt: (sectionId, lineId, atCol, items) => set((s) => ({
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
  })),

  addToBasket: (chords) => set((s) => ({
    basket: [...s.basket, ...chords.map((chord) => ({ id: nanoid(), chord }))],
  })),
  removeFromBasket: (id) => set((s) => ({ basket: s.basket.filter((b) => b.id !== id) })),
  clearBasket: () => set({ basket: [] }),

  // ---- pattern blocks ----
  updatePattern: (id, patch) => set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch } as PatternBlock;
      const total = next.bars * next.beatsPerBar;
      // clip chord positions/lengths to new size
      next.chords = p.chords
        .map((c) => ({
          ...c,
          startBeat: Math.min(c.startBeat, Math.max(0, total - 1)),
          lengthBeats: Math.max(1, Math.min(c.lengthBeats, total - Math.min(c.startBeat, total - 1))),
        }))
        .sort((a, b) => a.startBeat - b.startBeat);
      return next;
    }),
  })),

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

    // 2) Add the pattern chord with the back-link
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const start = Math.max(0, Math.min(totalBeats - 1, Math.round(atBeat)));
      const pc: PatternChord = {
        id: newPcId,
        chord,
        startBeat: start,
        lengthBeats: Math.max(1, Math.min(lengthBeats, totalBeats - start)),
        mirrorId: createdAnchorId ?? undefined,
      };
      return { ...p, chords: [...p.chords, pc].sort((a, b) => a.startBeat - b.startBeat) };
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
        next.startBeat = Math.max(0, Math.min(totalBeats - 1, next.startBeat));
        next.lengthBeats = Math.max(1, Math.min(next.lengthBeats, totalBeats - next.startBeat));
        if (patch.chord) newChord = patch.chord;
        return next;
      }).sort((a, b) => a.startBeat - b.startBeat);
      return { ...p, chords };
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

  removePatternChord: (patternId, chordId) => set((s) => {
    let mirrorAnchorId: string | undefined;
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const found = p.chords.find((c) => c.id === chordId);
      mirrorAnchorId = found?.mirrorId;
      return { ...p, chords: p.chords.filter((c) => c.id !== chordId) };
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

  movePatternChord: (patternId, chordId, direction) => set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const idx = sorted.findIndex((c) => c.id === chordId);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return p;
      const a = sorted[idx];
      const b = sorted[swapWith];
      const updated = sorted.map((c) => {
        if (c.id === a.id) return { ...c, startBeat: b.startBeat };
        if (c.id === b.id) return { ...c, startBeat: a.startBeat };
        return c;
      }).sort((x, y) => x.startBeat - y.startBeat);
      return { ...p, chords: updated };
    }),
  })),

  removePatternChordsBatch: (patternId, chordIds) => set((s) => {
    const idSet = new Set(chordIds);
    const mirrorAnchorIds = new Set<string>();
    const progression = s.progression.map((p) => {
      if (p.id !== patternId) return p;
      p.chords.forEach((c) => { if (idSet.has(c.id) && c.mirrorId) mirrorAnchorIds.add(c.mirrorId); });
      return { ...p, chords: p.chords.filter((c) => !idSet.has(c.id)) };
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
    return {
      progression: s.progression.map((p) => {
        if (p.id !== patternId) return p;
        const totalBeats = p.bars * p.beatsPerBar;
        const selected = p.chords.filter((c) => idSet.has(c.id));
        if (!selected.length) return p;
        const minStart = Math.min(...selected.map((c) => c.startBeat));
        const maxEnd = Math.max(...selected.map((c) => c.startBeat + c.lengthBeats));
        let d = deltaBeats;
        if (minStart + d < 0) d = -minStart;
        if (maxEnd + d > totalBeats) d = totalBeats - maxEnd;
        if (d === 0) return p;
        const chords = p.chords.map((c) => idSet.has(c.id) ? { ...c, startBeat: c.startBeat + d } : c)
          .sort((a, b) => a.startBeat - b.startBeat);
        return { ...p, chords };
      }),
    };
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
    target.chords.sort((a, b) => a.startBeat - b.startBeat);

    const progression = s.progression.map((p) => {
      if (p.id === fromPatternId) return { ...p, chords: p.chords.filter((c) => !idSet.has(c.id)) };
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

  loadFromJSON: (data) => {
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
    set({
      meta: parsed.meta ?? get().meta,
      sections: parsed.sections?.length ? parsed.sections : [makeSection().section],
      progression: parsed.progression?.length ? parsed.progression : [makeSection().pattern],
      basket: [],
    });
  },
  toJSON: () => {
    const s = get();
    return { version: 2, meta: s.meta, sections: s.sections, progression: s.progression };
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
