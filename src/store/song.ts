import { create } from "zustand";
import { nanoid } from "nanoid";
import { ChordSymbol, transposeChord, transposeKey, Mode } from "@/lib/music/chords";

// ---------- Types ----------

export interface ChordAnchor {
  id: string;
  /** character offset within the lyric line (0..text.length) */
  offset: number;
  chord: ChordSymbol;
  /** Optional: id of the corresponding pattern chord this is mirrored to. */
  mirrorId?: string;
}

export interface LyricLine {
  id: string;
  text: string;
  chords: ChordAnchor[];
}

export type SectionType = "verse" | "chorus" | "bridge" | "intro" | "outro" | "pre-chorus" | "custom";

export interface Section {
  id: string;
  label: string;
  type: SectionType;
  collapsed: boolean;
  lines: LyricLine[];
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
  updateSection: (id: string, patch: Partial<Pick<Section, "label" | "type" | "collapsed">>) => void;
  removeSection: (id: string) => void;
  duplicateSection: (id: string) => string | null;
  moveSection: (id: string, direction: -1 | 1) => void;
  toggleSectionCollapsed: (id: string) => void;

  // ---- lyrics (line-level) ----
  addLine: (sectionId: string, afterId?: string) => string;
  removeLine: (sectionId: string, id: string) => void;
  setLineText: (sectionId: string, id: string, text: string) => void;
  upsertChordAt: (sectionId: string, lineId: string, offset: number, chord: ChordSymbol, anchorId?: string) => void;
  removeChordAnchor: (sectionId: string, lineId: string, anchorId: string) => void;
  removeChordAnchorsBatch: (sectionId: string, lineId: string, anchorIds: string[]) => void;
  shiftChordAnchors: (sectionId: string, lineId: string, anchorIds: string[], deltaChars: number) => void;

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
        lines: sec.lines.map((l) => {
          if (l.id !== id) return l;
          const max = text.length;
          return { ...l, text, chords: l.chords.map((c) => ({ ...c, offset: Math.min(c.offset, max) })) };
        }),
      };
    }),
  })),

  // Add or replace a chord anchor; mirror to bound pattern block.
  upsertChordAt: (sectionId, lineId, offset, chord, anchorId) => set((s) => {
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
          if (anchorId) {
            chords = chords.map((c) => {
              if (c.id !== anchorId) return c;
              prevMirrorId = c.mirrorId;
              updatedAnchorId = c.id;
              return { ...c, chord, offset };
            });
          } else {
            const existing = chords.findIndex((c) => c.offset === offset);
            if (existing >= 0) {
              prevMirrorId = chords[existing].mirrorId;
              updatedAnchorId = chords[existing].id;
              chords[existing] = { ...chords[existing], chord };
            } else {
              const newId = nanoid();
              createdAnchorId = newId;
              chords.push({ id: newId, offset, chord });
            }
          }
          chords.sort((a, b) => a.offset - b.offset);
          return { ...l, chords };
        }),
      };
    });

    // Mirror to pattern
    let progression = s.progression;
    if (createdAnchorId) {
      progression = s.progression.map((p) => {
        if (p.id !== sectionId) return p;
        const placed = placeMirroredChord(p, chord, createdAnchorId!);
        // back-link the anchor with the new pattern chord id
        const newPcId = placed.chordId;
        return placed.pattern;
      });
      // Now write the mirrorId back onto the anchor we just created
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
      // Replace chord on the mirrored pattern chord (keep its position/length)
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

  shiftChordAnchors: (sectionId, lineId, anchorIds, deltaChars) => set((s) => {
    const idSet = new Set(anchorIds);
    return {
      sections: s.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          lines: sec.lines.map((l) => {
            if (l.id !== lineId) return l;
            const max = l.text.length;
            const chords = l.chords.map((c) => idSet.has(c.id)
              ? { ...c, offset: Math.max(0, Math.min(max, c.offset + deltaChars)) }
              : c).sort((a, b) => a.offset - b.offset);
            return { ...l, chords };
          }),
        };
      }),
    };
  }),

  // ---- basket ----
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
      lines[lastIdx] = {
        ...last,
        chords: [...last.chords, { id: newAnchorId, offset: last.text.length, chord, mirrorId: newPcId }]
          .sort((a, b) => a.offset - b.offset),
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
