import { getSectionDisplayName, type Section } from "@/store/song";

/**
 * Render a chord row by placing each chord's display string at its column
 * position, padding with spaces. Returns null if the line has no chord content.
 */
function renderChordRow(line: Section["lines"][number]): string | null {
  if (line.chords.length === 0 && (line.chordRowLen ?? 0) === 0) return null;
  const sorted = [...line.chords].sort(
    (a, b) => (a.chordCol ?? a.offset ?? 0) - (b.chordCol ?? b.offset ?? 0),
  );
  let out = "";
  for (const a of sorted) {
    const col = a.chordCol ?? a.offset ?? 0;
    if (col > out.length) out += " ".repeat(col - out.length);
    // If the previous chord overlaps this column, ensure at least one space.
    if (out.length > col) out += " ";
    out += a.chord.display;
  }
  return out.length ? out : null;
}

export function exportLyricsAsText(sections: Section[]): string {
  const blocks: string[] = [];
  for (const section of sections) {
    const title = `[${getSectionDisplayName(sections, section.id)}]`;
    const lines: string[] = [title];
    for (const line of section.lines) {
      const chordRow = renderChordRow(line);
      if (chordRow !== null) lines.push(chordRow);
      lines.push(line.text);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
