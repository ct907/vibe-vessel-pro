import { describe, it, expect, beforeEach } from "vitest";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";
import { parseChord } from "@/lib/music/chords";

/**
 * Lyric line split / merge tests.
 *
 * Covers the text-editor behaviors added so Enter splits a line at the caret
 * (carrying trailing text + chords to a new line) and Backspace at column 0
 * merges a line onto the end of the previous one. The contract:
 *   1. splitLine: text before the caret stays; text after moves to a new line.
 *   2. Chords whose anchored word is before the caret stay; the rest move.
 *   3. mergeLineUp: previous line's text + chords, then the current line's,
 *      with the caret index reported at the join.
 *   4. Both are single, reversible undo steps.
 *   5. Chord identity (and progression mirrors) survive a split→merge round-trip.
 */

function chord(display: string) {
  const c = parseChord(display);
  if (!c) throw new Error(`unparseable chord: ${display}`);
  return c;
}

function section0() {
  return useSongStore.getState().sections[0];
}

describe("lyric split / merge", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("splitLine moves the text after the caret onto a new line", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];
    store.setLineText(sec.id, line.id, "hello world");

    const res = store.splitLine(sec.id, line.id, 6); // caret before "world"
    expect(res?.newLineId).toBeTruthy();

    const after = section0();
    expect(after.lines.map((l) => l.text)).toEqual(["hello ", "world"]);
    expect(after.lines[1].id).toBe(res!.newLineId);
  });

  it("splitLine keeps pre-caret chords and moves post-caret chords", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];
    store.setLineText(sec.id, line.id, "hello world");
    // One chord on each word.
    store.placeChordInSlot(sec.id, line.id, 0, chord("C"));
    store.placeChordInSlot(sec.id, line.id, 5, chord("G"));

    const res = useSongStore.getState().splitLine(sec.id, line.id, 6);
    const after = section0();
    const first = getLineChordsViaSSOT(after, line.id);
    const second = getLineChordsViaSSOT(after, res!.newLineId);
    expect(first.map((c) => c.chord.display)).toEqual(["C"]);
    expect(second.map((c) => c.chord.display)).toEqual(["G"]);
  });

  it("splitLine at caret 0 pushes all content down, at end leaves a blank line", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];

    store.setLineText(sec.id, line.id, "lyric");
    const atStart = useSongStore.getState().splitLine(sec.id, line.id, 0);
    let after = section0();
    expect(after.lines.map((l) => l.text)).toEqual(["", "lyric"]);

    // Split the "lyric" line at its end → trailing blank line.
    const lyricLineId = atStart!.newLineId;
    useSongStore.getState().splitLine(sec.id, lyricLineId, 5);
    after = section0();
    expect(after.lines.map((l) => l.text)).toEqual(["", "lyric", ""]);
  });

  it("mergeLineUp concatenates onto the previous line and reports the join caret", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];
    store.setLineText(sec.id, line.id, "hello ");
    const res = useSongStore.getState().splitLine(sec.id, line.id, 6);
    useSongStore.getState().setLineText(sec.id, res!.newLineId, "world");

    const merge = useSongStore.getState().mergeLineUp(sec.id, res!.newLineId);
    expect(merge).toEqual({ prevLineId: line.id, caretIndex: 6 });

    const after = section0();
    expect(after.lines.map((l) => l.text)).toEqual(["hello world"]);
  });

  it("mergeLineUp returns null for the first line", () => {
    const sec = section0();
    expect(useSongStore.getState().mergeLineUp(sec.id, sec.lines[0].id)).toBeNull();
  });

  it("splitLine is a single reversible undo step", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];
    store.setLineText(sec.id, line.id, "one two");

    useSongStore.getState().splitLine(sec.id, line.id, 4);
    expect(section0().lines).toHaveLength(2);

    useSongStore.getState().undo();
    const after = section0();
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0].text).toBe("one two");
  });

  it("chords survive a split → merge round-trip in order", () => {
    const store = useSongStore.getState();
    const sec = section0();
    const line = sec.lines[0];
    store.setLineText(sec.id, line.id, "hello world");
    store.placeChordInSlot(sec.id, line.id, 0, chord("C"));
    store.placeChordInSlot(sec.id, line.id, 5, chord("G"));

    const res = useSongStore.getState().splitLine(sec.id, line.id, 6);
    useSongStore.getState().mergeLineUp(sec.id, res!.newLineId);

    const after = section0();
    expect(after.lines).toHaveLength(1);
    const chords = getLineChordsViaSSOT(after, line.id);
    expect(chords.map((c) => c.chord.display)).toEqual(["C", "G"]);
  });
});
