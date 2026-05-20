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

const dbg = (...args: unknown[]) => {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("LV_DEBUG_LAYOUT") === "1") {
      // eslint-disable-next-line no-console
      console.log("[layout]", ...args);
    }
  } catch {
    /* ignore */
  }
};

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
 *
 * Also performs a chord-overflow pass: if any single line's chord footprint
 * (sum of widths + spacing) exceeds the viewport's `slotsPerLine` capacity,
 * synthesize empty continuation lines (`_isChordOverflow: true`) and spill
 * the overflow chords onto them.
 */
export function formatChordsAndLyrics(
  section: Section,
  config: LayoutConfig,
): { section: Section; overflowRowsAdded: number; orphansFixed: number } {
  const slotWidth = Math.max(20, config.slotWidth ?? 28);
  // Phase 1.5: device-aware usable width — leave margin for the row's edit
  // affordance (pencil) and avoid edge crowding. Mobile/tablet 80%, desktop 90%.
  const factor = config.screenWidth < 1024 ? 0.8 : 0.9;
  const usableWidth = config.screenWidth * factor;
  const charsPerLine = Math.max(8, Math.floor(usableWidth / CHAR_WIDTH_PX));
  const slotsPerLine = Math.max(2, Math.floor(usableWidth / slotWidth));

  dbg("formatChordsAndLyrics:input", {
    sectionId: section.id,
    screenWidth: config.screenWidth,
    slotWidth,
    charsPerLine,
    slotsPerLine,
    lineCount: section.lines.length,
    chordCount: section.chords.length,
  });

  // 0) Orphan auto-fix.
  const validLineIds = new Set(section.lines.map((l) => l.id));
  const firstLineId = section.lines[0]?.id;
  let orphanCount = 0;
  const sourceChords: SectionChord[] = section.chords.map((sc) => {
    const lp = sc.lyricsPlacement;
    if (!lp) return sc;
    if (validLineIds.has(lp.lineId)) return sc;
    orphanCount += 1;
    if (!firstLineId) return { ...sc, lyricsPlacement: undefined };
    return { ...sc, lyricsPlacement: { lineId: firstLineId, slotIndex: 0 } };
  });
  if (orphanCount > 0) dbg("orphans reassigned:", orphanCount);

  // 1) Drop pre-existing overflow rows so we recompute fresh each pass.
  //    Re-attach their chords to the previous non-overflow row.
  const compactedLines: LyricLine[] = [];
  const overflowReassign = new Map<string, string>(); // overflowLineId -> parentLineId
  let lastParentId: string | null = null;
  section.lines.forEach((l) => {
    if (l._isChordOverflow) {
      if (lastParentId) overflowReassign.set(l.id, lastParentId);
      return;
    }
    compactedLines.push(l);
    lastParentId = l.id;
  });
  const reassignedChords: SectionChord[] = sourceChords.map((sc) => {
    const lp = sc.lyricsPlacement;
    if (!lp) return sc;
    const parent = overflowReassign.get(lp.lineId);
    if (!parent) return sc;
    return { ...sc, lyricsPlacement: { lineId: parent, slotIndex: lp.slotIndex } };
  });

  // 2) Split lyric lines on character width.
  const splitLines: LyricLine[] = [];
  const lineMapping = new Map<string, string[]>();
  compactedLines.forEach((line) => {
    if (line.text.length <= charsPerLine) {
      splitLines.push(line);
      lineMapping.set(line.id, [line.id]);
      return;
    }
    const splits = splitLyricLine(line.text, charsPerLine);
    const ids: string[] = [];
    splits.forEach((text, idx) => {
      const newId = idx === 0 ? line.id : nanoid();
      splitLines.push({ id: newId, text, chords: [] as ChordAnchor[] });
      ids.push(newId);
    });
    lineMapping.set(line.id, ids);
  });

  // 3) Redistribute chord lyricsPlacements across the split lines.
  const remappedChords: SectionChord[] = reassignedChords.map((sc) => {
    const lp = sc.lyricsPlacement;
    if (!lp) return sc;
    const newIds = lineMapping.get(lp.lineId);
    if (!newIds || newIds.length === 1) return sc;
    const original = section.lines.find((l) => l.id === lp.lineId);
    const totalChars = original?.text.length ?? 0;
    const ratio = lp.slotIndex / CHORD_ROW_SLOTS;
    const charPos = Math.floor(ratio * totalChars);
    let acc = 0;
    let target = newIds[newIds.length - 1];
    for (const id of newIds) {
      const len = splitLines.find((l) => l.id === id)?.text.length ?? 0;
      acc += len + 1;
      if (charPos < acc) {
        target = id;
        break;
      }
    }
    return { ...sc, lyricsPlacement: { lineId: target, slotIndex: 0 } };
  });

  // 4) Chord-overflow split: for each line, if chord footprint > slotsPerLine,
  //    synthesize continuation rows and spill chords onto them.
  const SPACING = 1;
  const cap = Math.max(1, Math.min(CHORD_ROW_SLOTS, slotsPerLine));
  const finalLines: LyricLine[] = [];
  const overflowRetarget = new Map<string, string>(); // chordId -> targetLineId
  let overflowRowsAdded = 0;

  // Group chords by line in SSOT order.
  const byLine = new Map<string, SectionChord[]>();
  remappedChords.forEach((c) => {
    const lp = c.lyricsPlacement;
    if (!lp) return;
    const arr = byLine.get(lp.lineId) ?? [];
    arr.push(c);
    byLine.set(lp.lineId, arr);
  });

  splitLines.forEach((line) => {
    finalLines.push(line);
    const lineChords = byLine.get(line.id) ?? [];
    // Walk chords; once a chord won't fit on the current row (with spacing),
    // start a new overflow row.
    let cursor = 0;
    let currentTargetId = line.id;
    for (const sc of lineChords) {
      const w = chordSlotWidth(sc.chord.display);
      if (cursor + w > cap && cursor !== 0) {
        // Spawn a new overflow row.
        const newId = nanoid();
        finalLines.push({
          id: newId,
          text: "",
          chords: [] as ChordAnchor[],
          _isChordOverflow: true,
        });
        overflowRowsAdded += 1;
        currentTargetId = newId;
        cursor = 0;
      }
      if (currentTargetId !== line.id) {
        overflowRetarget.set(sc.id, currentTargetId);
      }
      cursor += w + SPACING;
    }
  });

  // 4.5) Orphan rescue: SectionChords with a progressionPlacement but no
  //      lyricsPlacement are invisible — deriveMirrorsFromSectionChords and the
  //      step-4 overflow pass both skip chords with no placement. Append them
  //      onto fresh _isChordOverflow rows at the end of the section so they
  //      show up as chords in a new chord row.
  const orphanChords = remappedChords.filter(
    (sc) => !sc.lyricsPlacement && !!sc.progressionPlacement,
  );
  const orphanPlacement = new Map<string, string>();
  if (orphanChords.length > 0) {
    let cursor = cap; // force a fresh row on the first chord
    let rescueRowId = "";
    for (const sc of orphanChords) {
      const w = chordSlotWidth(sc.chord.display);
      if (cursor + w > cap) {
        rescueRowId = nanoid();
        finalLines.push({ id: rescueRowId, text: "", chords: [] as ChordAnchor[], _isChordOverflow: true });
        overflowRowsAdded += 1;
        cursor = 0;
      }
      orphanPlacement.set(sc.id, rescueRowId);
      cursor += w + SPACING;
    }
  }

  const retargetedChords = remappedChords.map((sc) => {
    const orphanTarget = orphanPlacement.get(sc.id);
    if (orphanTarget) return { ...sc, lyricsPlacement: { lineId: orphanTarget, slotIndex: 0 } };
    const lp = sc.lyricsPlacement;
    if (!lp) return sc;
    const target = overflowRetarget.get(sc.id);
    if (!target) return sc;
    return { ...sc, lyricsPlacement: { lineId: target, slotIndex: 0 } };
  });

  // 5) Final per-line left-pack pass.
  const finalChords = autoLayoutChordsPerLine(retargetedChords, finalLines, slotsPerLine);

  dbg("formatChordsAndLyrics:output", {
    newLineCount: finalLines.length,
    chordCount: finalChords.length,
    orphansFixed: orphanCount,
    overflowRowsAdded,
  });

  return {
    section: {
      ...section,
      lines: finalLines,
      chords: finalChords,
    },
    overflowRowsAdded,
    orphansFixed: orphanCount + orphanChords.length,
  };
}
