import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";
import { useUIStore } from "@/store/ui";

vi.mock("@/lib/music/audio", async (orig) => ({
  ...(await orig<typeof import("@/lib/music/audio")>()),
  playChord: vi.fn(async () => {}),
  playProgression: vi.fn(async () => ({ stop: () => {} })),
  stopProgression: vi.fn(),
}));

// jsdom has no layout APIs.
Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

function openAddChords() {
  render(
    <ThemeProvider>
      <DragDropContext onDragEnd={() => {}}>
        <LyricsTab />
      </DragDropContext>
    </ThemeProvider>,
  );
  act(() => useUIStore.getState().setChordPickerRequest(true));
}

const jamOpen = () => document.querySelector("[data-jam-canvas]") !== null;

describe("Add Chords input mode", () => {
  beforeEach(() => {
    localStorage.clear();
    useSongStore.getState().resetSong();
    useUIStore.setState({ chordInputMode: "type" });
  });

  it("defaults to Type", () => {
    openAddChords();
    expect(jamOpen()).toBe(false);
    expect(screen.getByRole("tab", { name: "Type" })).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs swaps the editor and remembers the choice", () => {
    openAddChords();
    fireEvent.click(screen.getByRole("tab", { name: "Jam" }));
    expect(jamOpen()).toBe(true);
    expect(JSON.parse(localStorage.getItem("felt:ui:v1")!).state).toEqual({ chordInputMode: "jam" });
    fireEvent.click(screen.getByRole("tab", { name: "Type" }));
    expect(jamOpen()).toBe(false);
    expect(useUIStore.getState().chordInputMode).toBe("type");
  });

  it("opens the last-used mode", () => {
    useUIStore.setState({ chordInputMode: "jam" });
    openAddChords();
    expect(jamOpen()).toBe(true);
  });

  it("Jam commits into the row the picker targeted", () => {
    useUIStore.setState({ chordInputMode: "jam" });
    openAddChords();
    fireEvent.click(screen.getByRole("button", { name: /^1, / }));
    fireEvent.click(screen.getByRole("button", { name: /^5, / }));
    fireEvent.click(screen.getByRole("button", { name: /^Add 2 chords/ }));
    expect(jamOpen()).toBe(false);
    const sec = useSongStore.getState().sections.at(-1)!;
    const line = sec.lines.at(-1)!;
    expect(getLineChordsViaSSOT(sec, line.id).map((c) => c.chord.display)).toEqual(["C", "G"]);
  });

  it("editing an existing chord ignores Jam and shows no tabs", () => {
    const sec = useSongStore.getState().sections[0];
    const line = sec.lines[0];
    const placed = useSongStore.getState().placeChordInSlot(sec.id, line.id, 0, { root: "C", quality: "maj", display: "C" });
    useUIStore.setState({ chordInputMode: "jam" });
    render(
      <ThemeProvider>
        <DragDropContext onDragEnd={() => {}}>
          <LyricsTab />
        </DragDropContext>
      </ThemeProvider>,
    );
    const chip = document.querySelector(`[data-chip-anchor="${placed!.id}"]`);
    expect(chip).not.toBeNull();
    fireEvent.contextMenu(chip!);
    expect(screen.getByText("Edit Chord")).toBeInTheDocument();
    expect(jamOpen()).toBe(false);
    expect(screen.queryByRole("tab", { name: "Jam" })).toBeNull();
  });
});
