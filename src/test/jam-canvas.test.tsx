import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, within } from "@testing-library/react";
import { JamCanvas } from "@/components/chord/JamCanvas";
import { useSongStore } from "@/store/song";
import { useUIStore } from "@/store/ui";
import type { ChordSymbol } from "@/lib/music/chords";

vi.mock("@/lib/music/audio", () => ({
  playChord: vi.fn(async () => {}),
  playProgression: vi.fn(async () => ({ stop: () => {} })),
  stopProgression: vi.fn(),
}));

// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

function setup() {
  const sectionId = useSongStore.getState().sections[0].id;
  const onCommit = vi.fn<(chords: ChordSymbol[]) => void>();
  const onClose = vi.fn();
  render(<JamCanvas sectionId={sectionId} targetLabel="Verse line 1" onCommit={onCommit} onClose={onClose} />);
  const press = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));
  const strip = () =>
    within(screen.getByRole("listbox", { name: "Captured chords" }))
      .getAllByRole("option")
      .filter((o) => o.getAttribute("aria-label") !== "Insertion point")
      .map((o) => o.textContent);
  const selected = () =>
    within(screen.getByRole("listbox", { name: "Captured chords" }))
      .getAllByRole("option")
      .find((o) => o.getAttribute("aria-selected") === "true");
  return { onCommit, onClose, press, strip, selected };
}

describe("JamCanvas", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
    useSongStore.setState((s) => ({ meta: { ...s.meta, keyRoot: "C", keyMode: "maj" } }));
    useUIStore.setState({ chordInputMode: "jam" });
  });

  it("shows each degree's chord beside its number", () => {
    setup();
    expect(screen.getByRole("button", { name: "2, Dm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7, Bdim" })).toBeInTheDocument();
  });

  it("captures number presses in order with the cursor on the newest", () => {
    const { press, strip, selected } = setup();
    press(/^1, /); press(/^5, /); press(/^6, /);
    expect(strip()).toEqual(["C1", "G5", "Am6"]);
    expect(selected()?.textContent).toBe("Am6");
  });

  it("9 / 8 / 0 edit only the highlighted chord, and the keycaps follow the cursor", () => {
    const { press, strip } = setup();
    press(/^1, /); press(/^5, /);
    press(/^9, /);
    expect(strip()).toEqual(["C1", "G75"]);
    expect(screen.getByRole("button", { name: /^9, extension 7/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "C (1)" }));
    expect(screen.getByRole("button", { name: /^9, extension off/ })).toBeInTheDocument();
    press(/^0, /);
    expect(strip()).toEqual(["Cm1", "G75"]);
    press(/^8, /);
    expect(strip()).toEqual(["Bm♭1", "G75"]);
  });

  it("8 on the insertion cell arms a prefix the next number consumes", () => {
    const { press, strip } = setup();
    press(/^8, /);
    press(/^7, /);
    expect(strip()).toEqual(["Bb♭7"]);
  });

  it("* deletes the highlighted chord", () => {
    const { press, strip } = setup();
    press(/^1, /); press(/^4, /);
    press(/Delete chord/);
    expect(strip()).toEqual(["C1"]);
  });

  it("the number row works as the keypad", () => {
    const { strip } = setup();
    const focused = document.activeElement!;
    expect(focused).toHaveAttribute("data-jam-canvas");
    fireEvent.keyDown(focused, { key: "6" });
    fireEvent.keyDown(focused, { key: "4" });
    fireEvent.keyDown(focused, { key: "9" });
    expect(strip()).toEqual(["Am6", "Fmaj74"]);
  });

  it("# commits storage-form, octave-stamped chords, then closes", () => {
    const { press, onCommit, onClose } = setup();
    press(/^2, /); press(/^5, /); press(/^1, /);
    press(/^Add 3 chords/);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].map((c) => [c.display, c.octave])).toEqual([["Dm", 3], ["G", 3], ["C", 3]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stores chords relative to the song key under a section key change", () => {
    const sec = useSongStore.getState().sections[0];
    useSongStore.setState((s) => ({
      sections: s.sections.map((x) => (x.id === sec.id ? { ...x, keyChangeRootOffset: 2 } : x)),
    }));
    const { press, onCommit } = setup();
    expect(screen.getByRole("button", { name: "1, D" })).toBeInTheDocument();
    press(/^5, /);
    press(/^Add 1 chords/);
    expect(onCommit.mock.calls[0][0][0].display).toBe("G");
  });

  it("asks before discarding a capture on close", () => {
    const { press, onClose } = setup();
    press(/^1, /);
    press(/Close jam mode/);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching to Type with a capture can add it first and keeps the wrapper open", () => {
    const { press, onCommit, onClose } = setup();
    press(/^1, /);
    fireEvent.click(screen.getByRole("tab", { name: "Type" }));
    expect(useUIStore.getState().chordInputMode).toBe("jam");
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(useUIStore.getState().chordInputMode).toBe("type");
  });

  it("switches straight away when nothing is captured", () => {
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Type" }));
    expect(useUIStore.getState().chordInputMode).toBe("type");
  });
});
