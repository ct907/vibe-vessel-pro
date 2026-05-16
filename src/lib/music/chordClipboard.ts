import { makeChordFromInput, type ChordSymbol } from "@/lib/music/chords";

export interface ChordClip {
  chord: ChordSymbol;
  relCol: number;
  widthCh: number;
}

export interface ParseResult {
  /** Successfully parsed clips, in input order. */
  clips: ChordClip[];
  /** Tokens that failed to parse (preserved for toast display). */
  invalidTokens: string[];
  /** Total tokens detected in the input. */
  totalTokens: number;
}

/**
 * Tokenize and parse chord text from the clipboard or any user input.
 *
 * Returns the parse result WITHOUT mutating any caller state. Callers should
 * inspect `invalidTokens` and refuse the paste (or warn the user) when any
 * token failed — this avoids silent partial pastes where stray tokens get
 * dropped without the user noticing.
 */
export function parseChordTextStrict(text: string): ParseResult {
  const tokens = text
    .split(/[\s,;|\n\r\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const clips: ChordClip[] = [];
  const invalidTokens: string[] = [];
  let cursor = 0;
  for (const tok of tokens) {
    const c = makeChordFromInput(tok);
    if (!c) {
      invalidTokens.push(tok);
      continue;
    }
    const w = Math.max(1, c.display.length) + 1;
    clips.push({ chord: c, relCol: cursor, widthCh: w });
    cursor += w;
  }
  return { clips, invalidTokens, totalTokens: tokens.length };
}
