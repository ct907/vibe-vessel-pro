import { create } from "zustand";
import type { ChordSymbol } from "@/lib/music/chords";

export interface TranscribedChord {
  id: string;
  chord: ChordSymbol;
  startSec: number;
  endSec: number;
  confidence: number;
}

export type TranscribeStatus = "idle" | "transcribing" | "done";

/**
 * Ephemeral per-take chord-transcription state. Lives outside the song store
 * because detected chords aren't part of the song until the user drags them
 * onto a lyric row. Shared so the lyrics drag-end handler can resolve a
 * dragged chip's chord by id.
 */
interface TranscriptionState {
  status: Record<string, TranscribeStatus>;
  chords: Record<string, TranscribedChord[]>;
  /** When on, new takes are transcribed automatically as they land in the strip. */
  autoTranscribe: boolean;
  setAutoTranscribe: (on: boolean) => void;
  setStatus: (takeId: string, status: TranscribeStatus) => void;
  setChords: (takeId: string, chords: TranscribedChord[]) => void;
  removeChordById: (chordId: string) => void;
  findChord: (chordId: string) => TranscribedChord | undefined;
  clearTake: (takeId: string) => void;
}

const AUTO_TRANSCRIBE_KEY = "songwriters-notebook:auto-transcribe:v1";

function loadAutoTranscribe(): boolean {
  try {
    return localStorage.getItem(AUTO_TRANSCRIBE_KEY) === "1";
  } catch {
    return false;
  }
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  status: {},
  chords: {},
  autoTranscribe: loadAutoTranscribe(),
  setAutoTranscribe: (on) => {
    set({ autoTranscribe: on });
    try {
      localStorage.setItem(AUTO_TRANSCRIBE_KEY, on ? "1" : "0");
    } catch { /* ignore */ }
  },
  setStatus: (takeId, status) => set((s) => ({ status: { ...s.status, [takeId]: status } })),
  setChords: (takeId, chords) => set((s) => ({ chords: { ...s.chords, [takeId]: chords } })),
  removeChordById: (chordId) =>
    set((s) => {
      const next: Record<string, TranscribedChord[]> = {};
      for (const [takeId, list] of Object.entries(s.chords)) {
        next[takeId] = list.filter((c) => c.id !== chordId);
      }
      return { chords: next };
    }),
  findChord: (chordId) => {
    for (const list of Object.values(get().chords)) {
      const found = list.find((c) => c.id === chordId);
      if (found) return found;
    }
    return undefined;
  },
  clearTake: (takeId) =>
    set((s) => {
      const status = { ...s.status };
      delete status[takeId];
      const chords = { ...s.chords };
      delete chords[takeId];
      return { status, chords };
    }),
}));
