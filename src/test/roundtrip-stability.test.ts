import { describe, it, expect } from "vitest";
import { useSongStore, getLineChordsViaSSOT, getPatternChordsViaSSOT } from "@/store/song";
import dreamon from "./dreamon-song.json";

type Fp = {
  ssotLyric: string[];
  ssotProg: string[];
  renderedLyric: string[];
  renderedProg: string[];
};

function fingerprint(): Fp {
  const s = useSongStore.getState();
  const ssotLyric: string[] = [];
  const ssotProg: string[] = [];
  const renderedLyric: string[] = [];
  const renderedProg: string[] = [];
  for (const sec of s.sections) {
    for (const sc of sec.chords) {
      if (sc.lyricsPlacement)
        ssotLyric.push(`${sec.id}|${sc.id}|${sc.chord.display}|${sc.lyricsPlacement.lineId}|${sc.lyricsPlacement.slotIndex}`);
      if (sc.progressionPlacement)
        ssotProg.push(`${sec.id}|${sc.id}|${sc.chord.display}|${sc.progressionPlacement.patternId}`);
    }
    for (const line of sec.lines) {
      for (const a of getLineChordsViaSSOT(sec, line.id))
        renderedLyric.push(`${sec.id}|${a.id}|${a.chord.display}|${line.id}|${a.slotIndex ?? 0}`);
    }
    const pats = s.progression.filter((p) => (p.sectionId ?? p.id) === sec.id);
    for (const p of pats) {
      for (const pc of getPatternChordsViaSSOT(sec, p))
        renderedProg.push(`${sec.id}|${pc.id}|${pc.chord.display}|${p.id}`);
    }
  }
  return {
    ssotLyric: ssotLyric.sort(),
    ssotProg: ssotProg.sort(),
    renderedLyric: renderedLyric.sort(),
    renderedProg: renderedProg.sort(),
  };
}

function dups(arr: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const x of arr) (seen.has(x) ? d : seen).add(x);
  return [...d];
}

describe("save → reload roundtrip stability", () => {
  it("rendered chords match the SSOT after load (no ghosts)", () => {
    useSongStore.getState().loadFromJSON(dreamon);
    const fp = fingerprint();
    // Every rendered lyric anchor must correspond to an SSOT lyric placement.
    const ssotLyricKeys = new Set(fp.ssotLyric.map((k) => k.split("|").slice(0, 3).join("|")));
    const ghostLyric = fp.renderedLyric.filter(
      (k) => !ssotLyricKeys.has(k.split("|").slice(0, 3).join("|")),
    );
    expect(ghostLyric, "ghost lyric anchors not backed by SSOT").toEqual([]);
    expect(dups(fp.renderedLyric), "duplicate rendered lyric anchors").toEqual([]);
    expect(dups(fp.renderedProg), "duplicate rendered progression chords").toEqual([]);
  });

  it("is idempotent across toJSON → loadFromJSON", () => {
    useSongStore.getState().loadFromJSON(dreamon);
    const before = fingerprint();
    const saved = useSongStore.getState().toJSON();
    useSongStore.getState().loadFromJSON(saved);
    const after = fingerprint();
    expect(after.ssotLyric, "SSOT lyric placements drifted across save/reload").toEqual(before.ssotLyric);
    expect(after.ssotProg, "SSOT progression placements drifted across save/reload").toEqual(before.ssotProg);
    expect(after.renderedLyric, "rendered lyric chords drifted").toEqual(before.renderedLyric);
    expect(after.renderedProg, "rendered progression chords drifted").toEqual(before.renderedProg);
  });
});
