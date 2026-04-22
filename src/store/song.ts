import { create } from "zustand";
import { nanoid } from "nanoid";
import { ChordSymbol, transposeChord, transposeKey, Mode } from "@/lib/music/chords";

export interface ChordAnchor {
  id: string;
  /** character offset within the lyric line (0..text.length) */
  offset: number;
  chord: ChordSymbol;
}

export interface LyricLine {
  id: string;
  text: string;
  chords: ChordAnchor[];
}

export interface PatternChord {
  id: string;
  chord: ChordSymbol;
  /** start beat within the pattern */
  startBeat: number;
  /** length in beats */
  lengthBeats: number;
}

export interface PatternBlock {
  id: string;
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
    keyRoot: string;   // e.g. "C"
    keyMode: Mode;     // "maj" | "min"
    bpm: number;
  };
  lyrics: LyricLine[];
  basket: BasketItem[];
  progression: PatternBlock[];

  // ---- actions ----
  setTitle: (t: string) => void;
  setKey: (root: string, mode: Mode) => void;
  setBpm: (bpm: number) => void;
  transposeSong: (semitones: number) => void;

  // lyrics
  addLine: (afterId?: string) => string;
  removeLine: (id: string) => void;
  setLineText: (id: string, text: string) => void;
  upsertChordAt: (lineId: string, offset: number, chord: ChordSymbol, anchorId?: string) => void;
  removeChordAnchor: (lineId: string, anchorId: string) => void;

  // basket
  addToBasket: (chords: ChordSymbol[]) => void;
  removeFromBasket: (id: string) => void;
  clearBasket: () => void;

  // progression
  addPattern: (label?: string) => string;
  updatePattern: (id: string, patch: Partial<Omit<PatternBlock, "id" | "chords">>) => void;
  removePattern: (id: string) => void;
  addChordToPattern: (patternId: string, chord: ChordSymbol, atBeat: number, lengthBeats?: number) => void;
  updatePatternChord: (patternId: string, chordId: string, patch: Partial<Omit<PatternChord, "id">>) => void;
  removePatternChord: (patternId: string, chordId: string) => void;
  movePatternChord: (patternId: string, chordId: string, direction: -1 | 1) => void;

  // hydrate / replace whole state
  loadFromJSON: (data: unknown) => void;
  toJSON: () => SerializedSong;
}

export interface SerializedSong {
  version: 1;
  meta: SongState["meta"];
  lyrics: LyricLine[];
  progression: PatternBlock[];
}

const initialLine = (): LyricLine => ({ id: nanoid(), text: "", chords: [] });

const initialPattern = (label = "Verse"): PatternBlock => ({
  id: nanoid(),
  label,
  bars: 4,
  beatsPerBar: 4,
  chords: [],
});

export const useSongStore = create<SongState>((set, get) => ({
  meta: { title: "Untitled Song", keyRoot: "C", keyMode: "maj", bpm: 92 },
  lyrics: [initialLine()],
  basket: [],
  progression: [initialPattern()],

  setTitle: (title) => set((s) => ({ meta: { ...s.meta, title } })),
  setKey: (keyRoot, keyMode) => set((s) => ({ meta: { ...s.meta, keyRoot, keyMode } })),
  setBpm: (bpm) => set((s) => ({ meta: { ...s.meta, bpm: Math.max(40, Math.min(220, bpm)) } })),

  transposeSong: (semitones) => set((s) => ({
    meta: { ...s.meta, keyRoot: transposeKey(s.meta.keyRoot, semitones) },
    lyrics: s.lyrics.map((l) => ({
      ...l,
      chords: l.chords.map((a) => ({ ...a, chord: transposeChord(a.chord, semitones) })),
    })),
    progression: s.progression.map((p) => ({
      ...p,
      chords: p.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, semitones) })),
    })),
  })),

  addLine: (afterId) => {
    const newLine = initialLine();
    set((s) => {
      if (!afterId) return { lyrics: [...s.lyrics, newLine] };
      const idx = s.lyrics.findIndex((l) => l.id === afterId);
      const lyrics = [...s.lyrics];
      lyrics.splice(idx + 1, 0, newLine);
      return { lyrics };
    });
    return newLine.id;
  },
  removeLine: (id) => set((s) => ({
    lyrics: s.lyrics.length > 1 ? s.lyrics.filter((l) => l.id !== id) : s.lyrics,
  })),
  setLineText: (id, text) => set((s) => ({
    lyrics: s.lyrics.map((l) => {
      if (l.id !== id) return l;
      // clamp anchor offsets to new text length
      const max = text.length;
      return { ...l, text, chords: l.chords.map((c) => ({ ...c, offset: Math.min(c.offset, max) })) };
    }),
  })),

  upsertChordAt: (lineId, offset, chord, anchorId) => set((s) => ({
    lyrics: s.lyrics.map((l) => {
      if (l.id !== lineId) return l;
      let chords = [...l.chords];
      if (anchorId) {
        chords = chords.map((c) => (c.id === anchorId ? { ...c, chord, offset } : c));
      } else {
        // replace existing anchor at the same offset, else add
        const existing = chords.findIndex((c) => c.offset === offset);
        if (existing >= 0) chords[existing] = { ...chords[existing], chord };
        else chords.push({ id: nanoid(), offset, chord });
      }
      chords.sort((a, b) => a.offset - b.offset);
      return { ...l, chords };
    }),
  })),
  removeChordAnchor: (lineId, anchorId) => set((s) => ({
    lyrics: s.lyrics.map((l) =>
      l.id === lineId ? { ...l, chords: l.chords.filter((c) => c.id !== anchorId) } : l,
    ),
  })),

  addToBasket: (chords) => set((s) => ({
    basket: [...s.basket, ...chords.map((chord) => ({ id: nanoid(), chord }))],
  })),
  removeFromBasket: (id) => set((s) => ({ basket: s.basket.filter((b) => b.id !== id) })),
  clearBasket: () => set({ basket: [] }),

  addPattern: (label) => {
    const p = initialPattern(label ?? `Section ${get().progression.length + 1}`);
    set((s) => ({ progression: [...s.progression, p] }));
    return p.id;
  },
  updatePattern: (id, patch) => set((s) => ({
    progression: s.progression.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  })),
  removePattern: (id) => set((s) => ({
    progression: s.progression.length > 1 ? s.progression.filter((p) => p.id !== id) : s.progression,
  })),

  addChordToPattern: (patternId, chord, atBeat, lengthBeats = 4) => set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const start = Math.max(0, Math.min(totalBeats - 1, Math.round(atBeat)));
      const newChord: PatternChord = {
        id: nanoid(),
        chord,
        startBeat: start,
        lengthBeats: Math.max(1, Math.min(lengthBeats, totalBeats - start)),
      };
      return { ...p, chords: [...p.chords, newChord].sort((a, b) => a.startBeat - b.startBeat) };
    }),
  })),
  updatePatternChord: (patternId, chordId, patch) => set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const totalBeats = p.bars * p.beatsPerBar;
      const chords = p.chords.map((c) => {
        if (c.id !== chordId) return c;
        const next = { ...c, ...patch };
        next.startBeat = Math.max(0, Math.min(totalBeats - 1, next.startBeat));
        next.lengthBeats = Math.max(1, Math.min(next.lengthBeats, totalBeats - next.startBeat));
        return next;
      }).sort((a, b) => a.startBeat - b.startBeat);
      return { ...p, chords };
    }),
  })),
  removePatternChord: (patternId, chordId) => set((s) => ({
    progression: s.progression.map((p) =>
      p.id === patternId ? { ...p, chords: p.chords.filter((c) => c.id !== chordId) } : p,
    ),
  })),
  movePatternChord: (patternId, chordId, direction) => set((s) => ({
    progression: s.progression.map((p) => {
      if (p.id !== patternId) return p;
      const sorted = [...p.chords].sort((a, b) => a.startBeat - b.startBeat);
      const idx = sorted.findIndex((c) => c.id === chordId);
      const swapWith = idx + direction;
      if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return p;
      const a = sorted[idx];
      const b = sorted[swapWith];
      // swap their start beats (keeping their lengths)
      const updated = sorted.map((c) => {
        if (c.id === a.id) return { ...c, startBeat: b.startBeat };
        if (c.id === b.id) return { ...c, startBeat: a.startBeat };
        return c;
      }).sort((x, y) => x.startBeat - y.startBeat);
      return { ...p, chords: updated };
    }),
  })),

  loadFromJSON: (data) => {
    const parsed = data as SerializedSong;
    if (!parsed || parsed.version !== 1) return;
    set({
      meta: parsed.meta,
      lyrics: parsed.lyrics?.length ? parsed.lyrics : [initialLine()],
      progression: parsed.progression?.length ? parsed.progression : [initialPattern()],
      basket: [],
    });
  },
  toJSON: () => {
    const s = get();
    return { version: 1, meta: s.meta, lyrics: s.lyrics, progression: s.progression };
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
