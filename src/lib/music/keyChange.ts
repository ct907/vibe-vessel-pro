import type { Section, SongState } from "@/store/song";
import { transposeKey, type Mode } from "./chords";

/**
 * Running-key inheritance: every section's effective semitone offset is
 * the most recent explicit declaration at or before it, or 0 if none.
 */
export function computeEffectiveOffsets(sections: Section[]): number[] {
  let running = 0;
  return sections.map((s) => {
    if (typeof s.keyChangeRootOffset === "number") running = s.keyChangeRootOffset;
    return running;
  });
}

export interface EffectiveKey {
  root: string;
  mode: Mode;
  offset: number;
}

export function effectiveKeyAt(
  sections: Section[],
  sectionId: string,
  meta: SongState["meta"],
): EffectiveKey {
  const offsets = computeEffectiveOffsets(sections);
  const idx = sections.findIndex((s) => s.id === sectionId);
  const offset = idx >= 0 ? offsets[idx] : 0;
  return { root: transposeKey(meta.keyRoot, offset), mode: meta.keyMode, offset };
}
