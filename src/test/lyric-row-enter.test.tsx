import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DragDropContext } from "@hello-pangea/dnd";
import { LyricsTab } from "@/components/lyrics/LyricsTab";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSongStore } from "@/store/song";

function renderTab() {
  return render(
    <ThemeProvider>
      <DragDropContext onDragEnd={() => {}}>
        <LyricsTab />
      </DragDropContext>
    </ThemeProvider>,
  );
}

describe("LineRow Enter splits the lyric line in the UI", () => {
  beforeEach(() => {
    useSongStore.getState().resetSong();
  });

  it("pressing Enter mid-line carries the trailing text to a new line", () => {
    const sec = useSongStore.getState().sections[0];
    const line = sec.lines[0];
    useSongStore.getState().setLineText(sec.id, line.id, "hello world");

    const { container } = renderTab();
    const ta = container.querySelector<HTMLTextAreaElement>(
      `[data-lyric-input="${line.id}"]`,
    )!;
    expect(ta).toBeTruthy();
    ta.focus();
    ta.setSelectionRange(6, 6); // caret before "world"

    fireEvent.keyDown(ta, { key: "Enter" });

    const after = useSongStore.getState().sections[0];
    expect(after.lines.map((l) => l.text)).toEqual(["hello ", "world"]);
  });
});
