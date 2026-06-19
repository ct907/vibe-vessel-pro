import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, withHistoryGroup } from "@/store/song";
import { parseChord } from "@/lib/music/chords";

/**
 * Undo/redo on a GROUP operation (paste / duplicate / multi-delete of N chords)
 * must collapse into a single history step, so one Ctrl+Z reverts the whole
 * group instead of peeling chords off one at a time. The compound chord
 * handlers wrap their per-chord mutations in withHistoryGroup; these tests pin
 * that contract at the store level.
 */

function chord(display: string) {
  const c = parseChord(display);
  if (!c) throw new Error(`unparseable chord: ${display}`);
  return c;
}

const SCREEN_W = 1200;
const SLOT_W = 28;

function chordCount(sectionId: string): number {
  return useSongStore.getState().sections.find((x) => x.id === sectionId)!.chords.length;
}

describe("undo/redo treats a grouped chord operation as one step", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("a grouped paste of 3 chords undoes (and redoes) in a single step", () => {
    const section = useSongStore.getState().sections[0];
    const pattern = useSongStore.getState().progression[0];
    expect(chordCount(section.id)).toBe(0);

    // Mirror what handlePasteIntoBlock does: N inserts + a reflow, all grouped.
    withHistoryGroup(() => {
      [chord("A"), chord("B"), chord("C")].forEach((c, i) => {
        useSongStore.getState().addChordToPatternSlot(pattern.id, c, i);
      });
      useSongStore.getState().autoLayoutSection(section.id, SCREEN_W, SLOT_W);
    });
    expect(chordCount(section.id)).toBe(3);

    // ONE undo removes all three.
    expect(useSongStore.getState().undo()).toBe(true);
    expect(chordCount(section.id)).toBe(0);
    expect(useSongStore.getState().canUndo()).toBe(false);

    // ONE redo restores all three.
    expect(useSongStore.getState().redo()).toBe(true);
    expect(chordCount(section.id)).toBe(3);
  });

  it("without grouping, each insert is its own undo step (the bug being fixed)", () => {
    const section = useSongStore.getState().sections[0];
    const pattern = useSongStore.getState().progression[0];

    [chord("A"), chord("B"), chord("C")].forEach((c, i) => {
      useSongStore.getState().addChordToPatternSlot(pattern.id, c, i);
    });
    expect(chordCount(section.id)).toBe(3);

    // Three separate undo steps are needed to clear them.
    useSongStore.getState().undo();
    expect(chordCount(section.id)).toBe(2);
    useSongStore.getState().undo();
    expect(chordCount(section.id)).toBe(1);
    useSongStore.getState().undo();
    expect(chordCount(section.id)).toBe(0);
  });
});
