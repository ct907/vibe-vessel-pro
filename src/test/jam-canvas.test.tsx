import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, within, act } from "@testing-library/react";
import { JamCanvas } from "@/components/chord/JamCanvas";
import { useSongStore } from "@/store/song";
import { useUIStore } from "@/store/ui";
import type { ChordSymbol, Mode } from "@/lib/music/chords";
import { toast, type Action } from "sonner";

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("@/lib/music/audio", () => ({
  playChord: vi.fn(async () => {}),
  playProgression: vi.fn(async () => ({ stop: () => {} })),
  stopProgression: vi.fn(),
}));

// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

function setup({ standalone = false } = {}) {
  const sectionId = useSongStore.getState().sections[0].id;
  const onCommit = vi.fn<(chords: ChordSymbol[], key: { root: string; mode: Mode }) => void>();
  const onClose = vi.fn();
  render(
    <JamCanvas
      sectionId={standalone ? undefined : sectionId}
      targetLabel={standalone ? "New song" : "Verse line 1"}
      onCommit={onCommit}
      onClose={onClose}
    />,
  );
  const press = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));
  const options = () => within(screen.getByRole("listbox", { name: "Captured chords" })).getAllByRole("option");
  const strip = () =>
    options()
      .filter((o) => o.getAttribute("aria-label") !== "Insertion point" && !o.getAttribute("aria-label")?.startsWith("Key change to"))
      .map((o) => o.textContent);
  const keyCells = () => options().filter((o) => o.getAttribute("aria-label")?.startsWith("Key change to")).map((o) => o.textContent);
  const selected = () =>
    within(screen.getByRole("listbox", { name: "Captured chords" }))
      .getAllByRole("option")
      .find((o) => o.getAttribute("aria-selected") === "true");
  return { onCommit, onClose, press, strip, keyCells, selected };
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

  it("the header close button closes straight away when nothing is captured", () => {
    const { press, onClose } = setup();
    press(/^Close$/);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Clear removes every chord and Undo brings them back", () => {
    vi.mocked(toast).mockClear();
    const { press, strip } = setup();
    const clear = screen.getByRole("button", { name: "Clear all chords" });
    expect(clear).toBeDisabled();
    press(/^1, /); press(/^5, /); press(/^6, /);
    expect(clear).toBeEnabled();
    fireEvent.click(clear);
    expect(strip()).toEqual([]);
    expect(clear).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Add 0 chords/ })).toBeDisabled();
    const [message, data] = vi.mocked(toast).mock.calls[0];
    expect(message).toBe("Cleared 3 chords");
    const action = data?.action as Action;
    act(() => action.onClick({} as React.MouseEvent<HTMLButtonElement>));
    expect(strip()).toEqual(["C1", "G5", "Am6"]);
  });

  it("Clear does not close the canvas", () => {
    const { press, onClose } = setup();
    press(/^1, /);
    press(/^Clear all chords/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Play needs a capture and Stop needs something playing", async () => {
    const audio = await import("@/lib/music/audio");
    const { press } = setup();
    const play = screen.getByRole("button", { name: "Play capture" });
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(play).toBeDisabled();
    expect(stop).toBeDisabled();
    press(/^1, /); press(/^5, /);
    expect(play).toBeEnabled();
    fireEvent.click(play);
    expect(audio.playProgression).toHaveBeenCalledTimes(1);
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    expect(audio.stopProgression).toHaveBeenCalled();
    expect(stop).toBeDisabled();
  });

  it("the # key adds the capture just like the Add key", () => {
    const { press, onCommit, onClose } = setup();
    press(/^2, /); press(/^5, /);
    press(/^#, add 2 chords/);
    expect(onCommit.mock.calls[0][0].map((c) => c.display)).toEqual(["Dm", "G"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding a capture on close", () => {
    const { press, onClose } = setup();
    press(/^1, /);
    press(/^Close$/);
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

  describe("key change", () => {
    const toggle = () => fireEvent.click(screen.getByRole("button", { name: "Key change" }));
    const pickKey = (root: string) => fireEvent.click(screen.getByRole("button", { name: `Key of ${root}` }));

    it("the toggle adds a key-change object and opens the 12-key list", () => {
      const { press, keyCells } = setup();
      press(/^1, /);
      toggle();
      expect(keyCells()).toEqual(["KeyC"]);
      expect(screen.getByRole("group", { name: "Choose the new key" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^Key of / })).toHaveLength(12);
      expect(screen.getByRole("button", { name: "Key of C" })).toHaveAttribute("aria-pressed", "true");
    });

    it("picking a key re-labels the number pad and new chords use it", () => {
      const { press, strip } = setup();
      press(/^1, /);
      toggle();
      pickKey("G");
      expect(screen.queryByRole("group", { name: "Choose the new key" })).toBeNull();
      expect(screen.getByRole("button", { name: "1, G" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "5, D" })).toBeInTheDocument();
      press(/^1, /); press(/^5, /);
      expect(strip()).toEqual(["C1", "G1", "D5"]);
    });

    it("chords before the key change keep their key", () => {
      const { press, strip } = setup();
      press(/^1, /); press(/^5, /);
      toggle(); pickKey("D");
      press(/^1, /);
      expect(strip()).toEqual(["C1", "G5", "D1"]);
    });

    it("an armed prefix applies in the new key", () => {
      const { press, strip } = setup();
      toggle(); pickKey("G");
      press(/^8, /); press(/^7, /);
      expect(strip()).toEqual(["F♭7"]);
    });

    it("pressing the toggle again removes the key change", () => {
      const { press, keyCells, strip } = setup();
      press(/^1, /);
      toggle(); pickKey("G");
      expect(keyCells()).toEqual(["KeyG"]);
      toggle();
      expect(keyCells()).toEqual([]);
      expect(strip()).toEqual(["C1"]);
      expect(screen.getByRole("button", { name: "1, C" })).toBeInTheDocument();
    });

    it("tapping the key object reopens the list", () => {
      const { press } = setup();
      press(/^1, /);
      toggle(); pickKey("G");
      fireEvent.click(screen.getByRole("option", { name: "Key change to G" }));
      expect(screen.getByRole("button", { name: "Key of G" })).toHaveAttribute("aria-pressed", "true");
    });

    it("commits the chords only, with the key at the first chord", () => {
      const { press, onCommit } = setup();
      press(/^1, /);
      toggle(); pickKey("G");
      press(/^5, /);
      press(/^Add 2 chords/);
      const [chords, key] = onCommit.mock.calls[0];
      expect(chords.map((c) => c.display)).toEqual(["C", "D"]);
      expect(key).toEqual({ root: "C", mode: "maj" });
    });

    it("a key change alone is not a chord to add", () => {
      const { onClose } = setup();
      toggle(); pickKey("G");
      expect(screen.getByRole("button", { name: /^Add 0 chords/ })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Clear removes key changes too", () => {
      const { press, keyCells } = setup();
      press(/^1, /); toggle(); pickKey("G");
      press(/^Clear all chords/);
      expect(keyCells()).toEqual([]);
    });

    it("the K key toggles it from the keyboard", () => {
      const { keyCells } = setup();
      fireEvent.keyDown(document.activeElement!, { key: "k" });
      expect(keyCells()).toEqual(["KeyC"]);
    });
  });

  describe("standalone (homepage Jam)", () => {
    it("has no Type tab, is titled Jam and starts in C major", () => {
      setup({ standalone: true });
      expect(screen.queryByRole("tab", { name: "Jam" })).toBeNull();
      expect(screen.getByRole("heading", { name: "Jam" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "1, C" })).toBeInTheDocument();
    });

    it("Add commits chords for a new song and reports the key they started in", () => {
      const { press, onCommit, onClose } = setup({ standalone: true });
      press(/^1, /); press(/^5, /);
      press(/^Add 2 chords to a new song/);
      expect(onCommit.mock.calls[0][0].map((c) => c.display)).toEqual(["C", "G"]);
      expect(onCommit.mock.calls[0][1]).toEqual({ root: "C", mode: "maj" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("a key change before the first chord becomes the new song's key", () => {
      const { press, onCommit } = setup({ standalone: true });
      fireEvent.click(screen.getByRole("button", { name: "Key change" }));
      fireEvent.click(screen.getByRole("button", { name: "Key of D" }));
      press(/^1, /); press(/^4, /); press(/^5, /);
      press(/^Add 3 chords/);
      expect(onCommit.mock.calls[0][0].map((c) => c.display)).toEqual(["D", "G", "A"]);
      expect(onCommit.mock.calls[0][1]).toEqual({ root: "D", mode: "maj" });
    });
  });
});
