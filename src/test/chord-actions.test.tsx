import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, within } from "@testing-library/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { WriteStickyBar } from "@/components/write/WriteStickyBar";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSongStore } from "@/store/song";
import { useUIStore } from "@/store/ui";

vi.mock("@/lib/music/audio", async (orig) => ({
  ...(await orig<typeof import("@/lib/music/audio")>()),
  playChord: vi.fn(async () => {}),
  holdChord: vi.fn(async () => () => {}),
  playProgression: vi.fn(async () => ({ stop: () => {} })),
  stopProgression: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

function renderWithChords(...displays: string[]) {
  const song = useSongStore.getState();
  const sec = song.sections[0];
  const line = sec.lines[0];
  const ids = displays.map((display, i) =>
    song.placeChordInSlot(sec.id, line.id, i * 2, { root: display, quality: "maj", display })!.id,
  );
  render(
    <ThemeProvider>
      <DragDropContext onDragEnd={() => {}}>
        <LyricsTab />
      </DragDropContext>
    </ThemeProvider>,
  );
  return ids;
}

const chipButton = (id: string) =>
  document.querySelector(`[data-chip-anchor="${id}"] button`) as HTMLElement;

describe("contextual chord actions", () => {
  beforeEach(() => {
    localStorage.clear();
    useSongStore.getState().resetSong();
    useUIStore.setState({ multiSelectMode: false, chordToolbarOpen: false, toolbarExpanded: false });
  });

  it("the sticky bar only offers Record Voice and Add Lyrics Section", () => {
    render(<WriteStickyBar />);
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Record voice", "Add lyrics section"]);
  });

  it("tapping a chord shows Edit, Move, Select and Delete under it", () => {
    const [id] = renderWithChords("C");
    expect(screen.queryByRole("toolbar", { name: "Chord actions" })).toBeNull();
    fireEvent.click(chipButton(id));
    const popup = screen.getByRole("toolbar", { name: "Chord actions" });
    const labelled = within(popup).getAllByRole("button").map((b) => b.textContent).filter(Boolean);
    expect(labelled).toEqual([
      "Edit",
      "Move",
      "Select",
      "Delete",
    ]);
  });

  it("Move opens the move menu without multi-select", () => {
    const [id] = renderWithChords("C");
    fireEvent.click(chipButton(id));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(useUIStore.getState().toolbarExpanded).toBe(true);
    expect(useUIStore.getState().multiSelectMode).toBe(false);
  });

  it("Select opens the move menu in multi-select with the chord already picked", () => {
    const [first, second] = renderWithChords("C", "G");
    fireEvent.click(chipButton(first));
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    expect(useUIStore.getState().toolbarExpanded).toBe(true);
    expect(useUIStore.getState().multiSelectMode).toBe(true);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(chipButton(second));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("closing the move menu leaves multi-select", () => {
    const [id] = renderWithChords("C");
    fireEvent.click(chipButton(id));
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(useUIStore.getState().multiSelectMode).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useUIStore.getState().toolbarExpanded).toBe(false);
    expect(useUIStore.getState().multiSelectMode).toBe(false);
  });
});
