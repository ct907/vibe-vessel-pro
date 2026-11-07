import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import { ThemeProvider } from "@/hooks/use-theme";
import { useSongStore, getLineChordsViaSSOT } from "@/store/song";
import { useUIStore } from "@/store/ui";
import { commitCurrentSongToRecents } from "@/lib/recent-projects";

vi.mock("@/lib/recent-projects", () => ({
  commitCurrentSongToRecents: vi.fn(async () => {}),
  currentSongHasContent: () => false,
  listRecent: vi.fn(async () => []),
  openRecentSong: vi.fn(),
  removeRecent: vi.fn(async () => {}),
  restoreRecent: vi.fn(async () => {}),
  songDisplayName: () => "",
}));

vi.mock("@/lib/music/audio", () => ({
  playChord: vi.fn(async () => {}),
  playProgression: vi.fn(async () => ({ stop: () => {} })),
  stopProgression: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

function renderHome() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<p>the editor</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const press = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const firstLineChords = () => {
  const sec = useSongStore.getState().sections[0];
  return getLineChordsViaSSOT(sec, sec.lines[0].id).map((c) => c.chord.display);
};

describe("Jam from the homepage", () => {
  beforeEach(() => {
    vi.mocked(commitCurrentSongToRecents).mockClear();
    useSongStore.getState().resetSong();
    useUIStore.setState({ mode: "arrange" });
  });

  it("opens the Jam canvas from a Jam card and closes back to the homepage", () => {
    renderHome();
    expect(document.querySelector("[data-jam-canvas]")).toBeNull();
    fireEvent.click(screen.getByText(/to Jam$/));
    expect(document.querySelector("[data-jam-canvas]")).not.toBeNull();
    press(/^Close$/);
    expect(document.querySelector("[data-jam-canvas]")).toBeNull();
    expect(screen.queryByText("the editor")).toBeNull();
  });

  it("Add Chords puts the capture in a brand-new song and opens the editor", () => {
    useSongStore.getState().setTitle("Old song");
    const oldId = useSongStore.getState().meta.songId;
    renderHome();
    // Landing saves the live song once on mount; only Add's save counts below.
    vi.mocked(commitCurrentSongToRecents).mockClear();
    fireEvent.click(screen.getByText(/to Jam$/));
    press(/^1, /); press(/^5, /); press(/^6, /); press(/^4, /);
    press(/^Add 4 chords to a new song/);

    expect(commitCurrentSongToRecents).toHaveBeenCalledTimes(1);
    expect(screen.getByText("the editor")).toBeInTheDocument();
    const { meta } = useSongStore.getState();
    expect(meta.songId).not.toBe(oldId);
    expect(meta.title).toBe("");
    expect(useSongStore.getState().meta.title).not.toBe("Old song");
    expect(meta.keyRoot).toBe("C");
    expect(firstLineChords()).toEqual(["C", "G", "Am", "F"]);
    expect(useUIStore.getState().mode).toBe("write");
  });

  it("a key change at the start becomes the new song's key", () => {
    renderHome();
    fireEvent.click(screen.getByText(/to Jam$/));
    press("Key change");
    press("Key of D");
    press(/^1, /); press(/^4, /); press(/^5, /);
    press(/^Add 3 chords/);

    expect(useSongStore.getState().meta.keyRoot).toBe("D");
    expect(firstLineChords()).toEqual(["D", "G", "A"]);
  });

  it("a mid-capture key change is kept as plain chords in the song's first key", () => {
    renderHome();
    fireEvent.click(screen.getByText(/to Jam$/));
    press(/^1, /); press(/^5, /);
    press("Key change");
    press("Key of G");
    press(/^1, /); press(/^5, /);
    press(/^Add 4 chords/);

    expect(useSongStore.getState().meta.keyRoot).toBe("C");
    expect(firstLineChords()).toEqual(["C", "G", "G", "D"]);
  });
});
