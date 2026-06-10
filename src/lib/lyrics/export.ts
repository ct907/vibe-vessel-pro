import { getSectionDisplayName, type Section, type SectionChord, type SectionType, type SongState } from "@/store/song";
import { computeEffectiveOffsets } from "@/lib/music/keyChange";
import { transposeKey } from "@/lib/music/chords";

const SLOT_WIDTH = 4;

// ── plain-text helpers ────────────────────────────────────────────────────────

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

// ── ChordPro export ───────────────────────────────────────────────────────────

const CHORDPRO_DIRECTIVE: Partial<Record<SectionType, [string, string]>> = {
  verse: ["start_of_verse", "end_of_verse"],
  chorus: ["start_of_chorus", "end_of_chorus"],
  bridge: ["start_of_bridge", "end_of_bridge"],
};

function inlineChords(text: string, sectionChords: SectionChord[], lineId: string): string {
  const lineChords = sectionChords
    .filter((c) => c.lyricsPlacement?.lineId === lineId)
    .sort((a, b) => (a.lyricsPlacement?.slotIndex ?? 0) - (b.lyricsPlacement?.slotIndex ?? 0));
  if (lineChords.length === 0) return text;
  let result = text;
  let delta = 0;
  for (const c of lineChords) {
    const col = (c.lyricsPlacement?.slotIndex ?? 0) * SLOT_WIDTH;
    const pos = Math.min(col + delta, result.length);
    const marker = `[${c.chord.display}]`;
    result = result.slice(0, pos) + marker + result.slice(pos);
    delta += marker.length;
  }
  return result;
}

export function exportLyricsAsChordPro(sections: Section[], meta: SongState["meta"]): string {
  const offsets = computeEffectiveOffsets(sections);
  const minorSuffix = meta.keyMode === "min" ? "m" : "";
  const baseKey = transposeKey(meta.keyRoot, 0);

  const header: string[] = [];
  if (meta.title) header.push(`{title: ${meta.title}}`);
  header.push(`{key: ${baseKey}${minorSuffix}}`);
  header.push(`{tempo: ${meta.bpm}}`);

  const blocks: string[] = [header.join("\n")];
  let prev = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const eff = offsets[i];
    const displayName = getSectionDisplayName(sections, section.id);
    const lines: string[] = [];

    if (i > 0 && eff !== prev) {
      const target = transposeKey(meta.keyRoot, eff);
      lines.push(`{key: ${target}${minorSuffix}}`);
    }

    const directive = CHORDPRO_DIRECTIVE[section.type];
    if (directive) {
      lines.push(`{${directive[0]}: ${displayName}}`);
    } else {
      lines.push(`{comment: ${displayName}}`);
    }

    for (const line of section.lines) {
      lines.push(inlineChords(line.text, section.chords ?? [], line.id));
    }

    if (directive) lines.push(`{${directive[1]}}`);

    blocks.push(lines.join("\n"));
    prev = eff;
  }

  return blocks.join("\n\n");
}
