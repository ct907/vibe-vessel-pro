import { nanoid } from "nanoid";
import {
  CHORD_ROW_SLOTS,
  type Section,
  type LyricLine,
  type SectionChord,
  type ChordAnchor,
} from "@/store/song";

/**
 * Auto-layout engine for the lyrics chord row.
 *
 * Goal: ensure every chord on a line is visible at the user's current viewport
 * by (a) splitting long lyric lines at word boundaries to fit `charsPerLine`
 * and (b) repacking each line's chords left-to-right within `slotsPerLine`.
 *
 * The engine is purely positional — chord identity, ordering across the
 * section's `chords: SectionChord[]` array (the SSOT) is preserved. Only
 * `lyricsPlacement.lineId` and `lyricsPlacement.slotIndex` are recomputed.
 */

const CHAR_WIDTH_PX = 8;

export interface LayoutConfig {
  /** Effective render width for the chord row, in CSS px. */
  screenWidth: number;
  /** Slot width (28 default, 48 if user expanded slots). */
  slotWidth?: number;
}

/** How many slots a chord visually occupies. Short chords = 1; longer = 2. */
function chordSlotWidth(display: string): number {
  return display.length <= 3 ? 1 : 2;
}

/**
 * Split `text` so each piece's length is ≤ `maxChars`. Splits at spaces; if a
 * single word exceeds `maxChars`, it is force-split mid-word.
 */
export function splitLyricLine(text: string, maxChars: number): string[] {
  if (maxChars <= 0) return [text];
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [text];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (w.length > maxChars) {
      // Force-split the over-long word.
      const re = new RegExp(`.{1,${maxChars}}`, "g");
      const chunks = w.match(re) ?? [w];
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1];
    } else {
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * Re-pack chord positions on each line, left-to-right, with 1 spacing slot
 * between chords. Wraps to slot 0 if a chord doesn't fit (last-resort overlap;
 * the caller should have already split lines so this is rare).
 */
function autoLayoutChordsPerLine(
  chords: SectionChord[],
  lines: LyricLine[],
  slotsPerLine: number,
): SectionChord[] {
  const SPACING = 1;
  const cap = Math.max(1, Math.min(CHORD_ROW_SLOTS, slotsPerLine));
  // Group chords with lyricsPlacement by lineId, preserving SSOT order.
  const byLine = new Map<string, SectionChord[]>();
  chords.forEach((c) => {
    const lp = c.lyricsPlacement;
    if (!lp) return;
    const arr = byLine.get(lp.lineId) ?? [];
    arr.push(c);
    byLine.set(lp.lineId, arr);
  });
  // Build a quick lookup for the new placement of each id.
  const newPlacement = new Map<string, { lineId: string; slotIndex: number }>();
  lines.forEach((line) => {
    const lineChords = byLine.get(line.id) ?? [];
    let cursor = 0;
    for (const sc of lineChords) {
      const w = chordSlotWidth(sc.chord.display);
      if (cursor + w > cap && cursor !== 0) {
        // Wrap (shouldn't happen often after line-splitting); reset to 0.
        cursor = 0;
      }
      newPlacement.set(sc.id, { lineId: line.id, slotIndex: cursor });
      cursor += w + SPACING;
    }
  });
  return chords.map((c) => {
    const np = newPlacement.get(c.id);
    if (!np || !c.lyricsPlacement) return c;
    return { ...c, lyricsPlacement: np };
  });
}

/**
 * A4 entry point. Returns a new section with re-split lines and re-laid-out
 * chord positions. `section.chords` retains SSOT order; only its
 * `lyricsPlacement` fields and `section.lines` change.
 */
export function formatChordsAndLyrics(
  section: Section,
  config: LayoutConfig,
): Section {
  const slotWidth = Math.max(20, config.slotWidth ?? 28);
  const charsPerLine = Math.max(8, Math.floor(config.screenWidth / CHAR_WIDTH_PX));
  const slotsPerLine = Math.max(2, Math.floor(config.screenWidth / slotWidth));

  // 1) Split lines.
  const newLines: LyricLine[] = [];
  const lineMapping = new Map<string, string[]>();
  section.lines.forEach((line) => {
    if (line.text.length <= charsPerLine) {
      newLines.push(line);
      lineMapping.set(line.id, [line.id]);
      return;
    }
    const splits = splitLyricLine(line.text, charsPerLine);
    const ids: string[] = [];
    splits.forEach((text, idx) => {
      // Reuse the original id for the first slice so anchors that were already
      // bound to it stay attached without an extra remap step.
      const newId = idx === 0 ? line.id : nanoid();
      // Each split line starts with no legacy anchors — line.chords is a
      // legacy mirror that gets rebuilt by the SSOT inversion path. Leaving
      // it empty here means the SSOT-mode setter will derive correct anchors.
      newLines.push({ id: newId, text, chords: [] as ChordAnchor[] });
      ids.push(newId);
    });
    lineMapping.set(line.id, ids);
  });

  // 2) Redistribute chord lyricsPlacements across the split lines, then
  //    auto-layout positions per line.
  const remappedChords: SectionChord[] = section.chords.map((sc) => {
    const lp = sc.lyricsPlacement;
    if (!lp) return sc;
    const newIds = lineMapping.get(lp.lineId);
    if (!newIds || newIds.length === 1) {
      return sc;
    }
    // Estimate which split this chord belongs to using the chord's slot
    // position relative to the original (pre-split) line's character length.
    const original = section.lines.find((l) => l.id === lp.lineId);
    const totalChars = original?.text.length ?? 0;
    const ratio = lp.slotIndex / CHORD_ROW_SLOTS;
    const charPos = Math.floor(ratio * totalChars);
    let acc = 0;
    let target = newIds[newIds.length - 1];
    for (const id of newIds) {
      const len = newLines.find((l) => l.id === id)?.text.length ?? 0;
      acc += len + 1; // +1 for the implicit space we split on
      if (charPos < acc) {
        target = id;
        break;
      }
    }
    return { ...sc, lyricsPlacement: { lineId: target, slotIndex: 0 } };
  });

  const finalChords = autoLayoutChordsPerLine(remappedChords, newLines, slotsPerLine);

  return {
    ...section,
    lines: newLines,
    chords: finalChords,
  };
}
