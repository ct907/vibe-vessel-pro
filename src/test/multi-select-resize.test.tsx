import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { ProgressionsTab } from "@/components/progressions/ProgressionsTab";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSongStore } from "@/store/song";

// Clicking a chord also auditions it; jsdom has no real AudioContext.
vi.mock("@/lib/music/audio", () => ({ playChord: vi.fn() }));

/**
 * Resizing a multi-chord selection in Arrange used to leave chords out of the
 * resize (or drop the resize entirely) whenever the user's first click was a
 * plain click (setting the "active" chord) followed by Ctrl+click(s) to add
 * more chords: the active chord was never folded into the multi-selection,
 * and clicking the multi-select toolbar's own buttons fired a document-level
 * "click outside clears selection" listener before the button's onClick ran,
 * wiping the selection out from under it.
 */
const C = { root: "C", quality: "maj", display: "C", octave: 3 } as const;
const D = { root: "D", quality: "maj", display: "D", octave: 3 } as const;

function renderTab() {
  return render(
    <ThemeProvider>
      <DragDropContext onDragEnd={() => {}}>
        <ProgressionsTab />
      </DragDropContext>
    </ThemeProvider>,
  );
}

describe("Arrange multi-select resize", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("resizes every chord in a mixed active+multi-select, not just the multi-selected ones", () => {
    const sectionId = useSongStore.getState().sections[0].id;
    const lineId = useSongStore.getState().sections[0].lines[0].id;
    useSongStore.getState().setLineText(sectionId, lineId, "one two");
    const c = useSongStore.getState().placeChordInSlot(sectionId, lineId, 0, C)!;
    const d = useSongStore.getState().placeChordInSlot(sectionId, lineId, 1, D)!;

    renderTab();

    const cEl = document.querySelector<HTMLElement>(`[data-pattern-chord="${c.id}"]`)!;
    const dEl = document.querySelector<HTMLElement>(`[data-pattern-chord="${d.id}"]`)!;
    expect(cEl).toBeTruthy();
    expect(dEl).toBeTruthy();

    // Plain click C: sets it as the lone "active" chord (no modifier).
    fireEvent.click(cEl);
    // Ctrl+click D: starts a multi-select — C should be folded in automatically.
    fireEvent.click(dEl, { ctrlKey: true });

    expect(screen.getAllByText("2 selected").length).toBeGreaterThan(0);

    const resizeBtn = screen.getByLabelText("Extend beat length");
    // Real browsers fire pointerdown before click; the multi-select toolbar
    // must survive the document-level outside-click-clears-selection listener.
    fireEvent.pointerDown(resizeBtn);
    fireEvent.click(resizeBtn);

    const sec = useSongStore.getState().sections.find((s) => s.id === sectionId)!;
    expect(sec.chords.find((x) => x.id === c.id)!.progressionPlacement!.lengthBeats).toBe(4.5);
    expect(sec.chords.find((x) => x.id === d.id)!.progressionPlacement!.lengthBeats).toBe(4.5);
  });
});
