import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, type PatternBlock } from "@/store/song";
import dreamon from "./dreamon-song.json";

/**
 * Chord-overflow continuation rows (`_isChordOverflow`) are transient visual
 * wraps of one line's chord row — regenerated on every reflow and stripped by
 * toJSON. They used to render as fully editable lyric lines, so a lyric typed
 * there was silently lost on the next reflow/save.
 *
 * Per product decision, editing a continuation row now PROMOTES it into a real,
 * persistent lyric line with its own pattern block (user intervention beats the
 * layout model). These tests pin that contract.
 */
const sectionBlocks = (sectionId: string): PatternBlock[] =>
  useSongStore.getState().progression.filter((p) => (p.sectionId ?? p.id) === sectionId);

// Force narrow-viewport wrapping; return the first section that gained an overflow row.
function forceOverflow(): { sectionId: string; overflowId: string } | null {
  for (const sec of useSongStore.getState().sections) {
    useSongStore.getState().autoLayoutSection(sec.id, 200, 28);
  }
  for (const sec of useSongStore.getState().sections) {
    const overflow = sec.lines.find((l) => l._isChordOverflow);
    if (overflow) return { sectionId: sec.id, overflowId: overflow.id };
  }
  return null;
}

describe("chord-overflow continuation row promotion", () => {
  beforeEach(() => {
    useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(dreamon)));
  });

  it("typing a lyric promotes the row to a real line with its own block", () => {
    const found = forceOverflow();
    expect(found, "expected the narrow layout to spawn an overflow row").toBeTruthy();
    const { sectionId, overflowId } = found!;
    const beforeChordCount = useSongStore.getState().sections.find((s) => s.id === sectionId)!.chords.length;

    useSongStore.getState().setLineText(sectionId, overflowId, "new lyric");

    const sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
    const line = sec.lines.find((l) => l.id === overflowId)!;
    expect(line._isChordOverflow).toBeFalsy();
    expect(line.text).toBe("new lyric");
    // Owns its own block now; blocks stay 1:1 with non-overflow lines (Issue 1).
    expect(sectionBlocks(sectionId).some((p) => p.lineId === overflowId)).toBe(true);
    const nonOverflow = sec.lines.filter((l) => !l._isChordOverflow);
    expect(sectionBlocks(sectionId).length).toBe(nonOverflow.length);
    // No chord lost or duplicated.
    expect(sec.chords.length).toBe(beforeChordCount);
  });

  it("the promoted line and its lyric survive a reflow", () => {
    const { sectionId, overflowId } = forceOverflow()!;
    useSongStore.getState().setLineText(sectionId, overflowId, "kept");
    for (const sec of useSongStore.getState().sections) {
      useSongStore.getState().autoLayoutSection(sec.id, 200, 28);
    }
    const line = useSongStore.getState().sections.find((s) => s.id === sectionId)!.lines.find((l) => l.id === overflowId)!;
    expect(line._isChordOverflow).toBeFalsy();
    expect(line.text).toBe("kept");
    expect(sectionBlocks(sectionId).some((p) => p.lineId === overflowId)).toBe(true);
  });

  it("the promoted line and its block survive a save/load roundtrip", () => {
    const { sectionId, overflowId } = forceOverflow()!;
    useSongStore.getState().setLineText(sectionId, overflowId, "persist");
    useSongStore.getState().loadFromJSON(useSongStore.getState().toJSON());

    const line = useSongStore.getState().sections.find((s) => s.id === sectionId)!.lines.find((l) => l.id === overflowId);
    expect(line?._isChordOverflow).toBeFalsy();
    expect(line?.text).toBe("persist");
    expect(sectionBlocks(sectionId).some((p) => p.lineId === overflowId)).toBe(true);
  });

  it("an un-edited continuation row stays transient and blockless", () => {
    const { sectionId, overflowId } = forceOverflow()!;
    const sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
    expect(sec.lines.find((l) => l.id === overflowId)!._isChordOverflow).toBe(true);
    expect(sectionBlocks(sectionId).some((p) => p.lineId === overflowId)).toBe(false);
  });
});
