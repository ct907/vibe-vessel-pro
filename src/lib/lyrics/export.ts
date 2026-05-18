import { getSectionDisplayName, type Section, type SectionChord, type SongState } from "@/store/song";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { transposeKey } from "@/lib/music/chords";

/**
 * Render a chord row from the SSOT (`section.chords`) for a given line.
 * Each chord is placed at column = `slotIndex * SLOT_WIDTH`. Returns null
 * if there are no chords on this line.
 */
const SLOT_WIDTH = 4;

function renderChordRow(sectionChords: SectionChord[], lineId: string): string | null {
  const lineChords = sectionChords
    .filter((c) => c.lyricsPlacement?.lineId === lineId)
    .sort((a, b) => (a.lyricsPlacement?.slotIndex ?? 0) - (b.lyricsPlacement?.slotIndex ?? 0));
  if (lineChords.length === 0) return null;
  let out = "";
  for (const c of lineChords) {
    const col = (c.lyricsPlacement?.slotIndex ?? 0) * SLOT_WIDTH;
    if (col > out.length) out += " ".repeat(col - out.length);
    if (out.length > col) out += " "; // overlap fallback
    out += c.chord.display;
  }
  return out.length ? out : null;
}

export function exportLyricsAsText(sections: Section[], meta: SongState["meta"]): string {
  const offsets = computeEffectiveOffsets(sections);
  const modeSuffix = meta.keyMode === "min" ? "min" : "maj";
  const blocks: string[] = [];
  let prev = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const eff = offsets[i];
    const lines: string[] = [];
    if (i > 0 && eff !== prev) {
      const target = transposeKey(meta.keyRoot, eff);
      const signed = eff > 0 ? `+${eff}` : `${eff}`;
      lines.push(`>> Key change: ${target}${modeSuffix} (${signed})`);
    }
    lines.push(`[${getSectionDisplayName(sections, section.id)}]`);
    for (const line of section.lines) {
      const chordRow = renderChordRow(section.chords ?? [], line.id);
      if (chordRow !== null) lines.push(chordRow);
      lines.push(line.text);
    }
    blocks.push(lines.join("\n"));
    prev = eff;
  }
  return blocks.join("\n\n");
}
