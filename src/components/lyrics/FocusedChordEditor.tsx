import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChordSymbol, suggestChords, parseChord, parseNashvilleInput, transposeChord } from "@/lib/music/chords";
import { effectiveKeyAt } from "@/lib/music/keyChange";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
  getPatternChordsViaSSOT,
  CHORD_ROW_SLOTS,
  type LyricLine,
} from "@/store/song";
import { useUIStore } from "@/store/ui";
import { useOnboardingStore } from "@/store/onboarding";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PresetList } from "@/components/progressions/PresetList";
import { SlashBassPicker } from "@/components/chord/ChordPickerSheet";

interface LyricsModeProps {
  mode?: "lyrics";
  sectionId: string;
  lineId: string;
  initialSlot: number;
  initialAnchorId?: string;
  onClose: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
}

interface ProgressionModeProps {
  mode: "progression";
  sectionId: string;
  /** Pattern block holding the chord being edited. */
  patternId: string;
  /** SectionChord id (== PatternChord id under SSOT) being edited. */
  chordId: string;
  onClose: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
}

interface ProgressionAddModeProps {
  mode: "progression-add";
  sectionId: string;
  patternId: string;
  atBeat: number;
  onClose: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
}

type Props = LyricsModeProps | ProgressionModeProps | ProgressionAddModeProps;

const SLOT_PX = 28;

const dbg = (...args: unknown[]) => {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("LV_DEBUG_LAYOUT") === "1") {
      // eslint-disable-next-line no-console
      console.log("[editor]", ...args);
    }
  } catch { /* ignore */ }
};

/** Width (in slots) the chord display will occupy. Mirrors chordLayout. */
function chordSlotWidth(display: string): number {
  return display.length <= 3 ? 1 : 2;
}

/**
 * Full-screen overlay for adding or editing a chord.
 *
 * Two modes:
 *  - "lyrics" (default): adds chords to a lyric row, slot-by-slot, with a
 *    full 80-slot preview scroller.
 *  - "progression": replaces the chord family of a single chord in the
 *    progression view (tap-to-edit). Renders a compact preview of the
 *    pattern block instead of the lyric row.
 */
export function FocusedChordEditor(props: Props) {
  const sections = useSongStore((s) => s.sections);
  const placeChordInSlot = useSongStore((s) => s.placeChordInSlot);
  const upsertChordAt = useSongStore((s) => s.upsertChordAt);
  const updatePatternChord = useSongStore((s) => s.updatePatternChord);
  const addChordToPatternSlot = useSongStore((s) => s.addChordToPatternSlot);
  const removePatternChordsBatch = useSongStore((s) => s.removePatternChordsBatch);
  const autoLayoutSection = useSongStore((s) => s.autoLayoutSection);
  const progression = useSongStore((s) => s.progression);

  const isProgression = props.mode === "progression";
  const isProgressionAdd = props.mode === "progression-add";
  const section = sections.find((s) => s.id === props.sectionId);
  const sectionLabel = section ? getSectionDisplayName(sections, section.id) : "";

  // ---- Lyrics-mode state ----
  const lyricsLineId = !isProgression && !isProgressionAdd ? props.lineId : "";
  const lyricsInitialSlot = !isProgression && !isProgressionAdd ? props.initialSlot : 0;
  const lyricsInitialAnchorId = !isProgression && !isProgressionAdd ? props.initialAnchorId : undefined;
  const line: LyricLine | undefined = !isProgression && !isProgressionAdd
    ? section?.lines.find((l) => l.id === lyricsLineId)
    : undefined;

  // ---- Progression-mode lookups ----
  const progPattern = (isProgression || isProgressionAdd)
    ? progression.find((p) => p.id === props.patternId)
    : undefined;
  const progChord = isProgression
    ? section?.chords.find((c) => c.id === props.chordId)
    : undefined;

  const [slot, setSlot] = useState(lyricsInitialSlot);
  const [anchorId, setAnchorId] = useState<string | undefined>(lyricsInitialAnchorId);
  const [query, setQuery] = useState("");
  const [octave, setOctave] = useState(3);
  // Local cursor for progression-add multi-typed-Enter: starts at props.atBeat,
  // bumps after each insert so successive chords land left-to-right.
  const [progAddCursor, setProgAddCursor] = useState(
    isProgressionAdd ? (props as ProgressionAddModeProps).atBeat : 0,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const setEditorOpen = useUIStore((s) => s.setFocusedEditorOpen);

  useEffect(() => {
    setEditorOpen(true);
    dbg("mounted — focusedEditorOpen: true");
    return () => {
      setEditorOpen(false);
      dbg("unmounted — focusedEditorOpen: false");
    };
  }, [setEditorOpen]);

  // Escape closes; Tab/Shift+Tab is trapped inside the dialog since this is a
  // hand-rolled overlay (not Radix) and nothing else should be reachable
  // while it's open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  useEffect(() => {
    if (isProgressionAdd) {
      setQuery("");
    } else if (isProgression) {
      setQuery(progChord ? toSounding(progChord.chord).display : "");
      setOctave(progChord?.chord.octave ?? 3);
    } else {
      const lineChords = section ? getLineChordsViaSSOT(section, lyricsLineId) : [];
      const initialChord = lineChords.find((c) => c.id === lyricsInitialAnchorId)?.chord;
      setQuery(initialChord ? toSounding(initialChord).display : "");
      setOctave(initialChord?.octave ?? 3);
    }
    setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update the chord's octave in the store as the user changes it.
  const octaveInitRef = useRef(true);
  useEffect(() => {
    if (octaveInitRef.current) { octaveInitRef.current = false; return; }
    if (props.mode === "progression") {
      if (!progChord) return;
      updatePatternChord(props.patternId, props.chordId, { chord: { ...progChord.chord, octave } });
    } else if (props.mode !== "progression-add" && anchorId && section) {
      const live = getLineChordsViaSSOT(section, lyricsLineId);
      const cur = live.find((c) => c.id === anchorId);
      if (!cur || cur.slotIndex == null) return;
      upsertChordAt(props.sectionId, lyricsLineId, cur.slotIndex, { ...cur.chord, octave }, anchorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [octave]);

  // Auto-scroll the slot row so the active slot stays visible (lyrics only).
  useEffect(() => {
    if (isProgression) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = slot * SLOT_PX;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    if (target < viewLeft + 40 || target > viewRight - 80) {
      el.scrollTo({ left: Math.max(0, target - el.clientWidth / 2), behavior: "smooth" });
    }
  }, [slot, isProgression]);

  const meta = useSongStore((s) => s.meta);
  const effective = useMemo(
    () => effectiveKeyAt(sections, props.sectionId, meta),
    [sections, props.sectionId, meta],
  );
  const sectionOffset = effective.offset;
  const toSounding = (c: ChordSymbol): ChordSymbol =>
    sectionOffset ? { ...transposeChord(c, sectionOffset), octave: c.octave } : c;
  const toStorage = (c: ChordSymbol): ChordSymbol =>
    sectionOffset ? { ...transposeChord(c, -sectionOffset), octave: c.octave } : c;
  const exact = useMemo(() => parseChord(query.trim()), [query]);
  const nashvilleChords = useMemo(
    () => parseNashvilleInput(query.trim(), effective.root, effective.mode),
    [query, effective.root, effective.mode],
  );
  // A single Nashville number resolves to one chord — surface that chord's root
  // variations in the grid (just like typing the root letter) so the user can
  // pick any quality below the input. Multi-number sequences keep their grouped
  // preview band instead.
  const suggestions = useMemo(
    () =>
      nashvilleChords && nashvilleChords.length === 1
        ? suggestChords(nashvilleChords[0].root)
        : suggestChords(query),
    [query, nashvilleChords],
  );

  const handlePickNashville = (chords: ChordSymbol[]) => {
    if (isProgressionAdd) {
      chords.forEach((chord, i) =>
        addChordToPatternSlot(props.patternId, { ...toStorage(chord), octave }, progAddCursor + i, 4),
      );
      setProgAddCursor((c) => c + chords.length);
      const { enabled: ob, progressionsStep, setProgressionsStep } = useOnboardingStore.getState();
      if (ob && progressionsStep === 2) setProgressionsStep(3);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (isProgression) {
      if (chords[0]) updatePatternChord(props.patternId, props.chordId, { chord: { ...toStorage(chords[0]), octave } });
      props.onClose();
      return;
    }
    if (!line) return;
    if (anchorId && chords[0]) {
      upsertChordAt(props.sectionId, lyricsLineId, slot, { ...toStorage(chords[0]), octave }, anchorId);
      const { enabled: ob, lyricsStep, setLyricsStep } = useOnboardingStore.getState();
      if (ob && lyricsStep === 4) setLyricsStep(5);
      props.onClose();
      return;
    }
    // Insert in forward order; insertSectionChordAtSlot keeps SSOT sorted by slot.
    let cur = slot;
    for (const chord of chords) {
      placeChordInSlot(props.sectionId, lyricsLineId, cur, { ...toStorage(chord), octave });
      cur = Math.min(CHORD_ROW_SLOTS - 1, cur + chordSlotWidth(chord.display) + 1);
    }
    // A bulk entry (several Nashville numbers / a preset at once) can pile more
    // chords onto one row than it can show. Reflow immediately so they space out
    // by the 1-slot rule and spill onto continuation rows, instead of sitting
    // off-screen on one row until the editor closes.
    if (chords.length > 1 && typeof window !== "undefined") {
      autoLayoutSection(props.sectionId, window.innerWidth, 28);
    }
    setSlot(cur);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const handlePick = (chord: ChordSymbol) => {
    const chordWithOctave = { ...toStorage(chord), octave };
    if (isProgressionAdd) {
      addChordToPatternSlot(props.patternId, chordWithOctave, progAddCursor, 4);
      setProgAddCursor((c) => c + 1);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (isProgression) {
      // Replace the chord family of the tapped progression chord.
      updatePatternChord(props.patternId, props.chordId, { chord: chordWithOctave });
      props.onClose();
      return;
    }

    if (!line) return;
    if (anchorId) {
      upsertChordAt(props.sectionId, lyricsLineId, slot, chordWithOctave, anchorId);
      const { enabled: ob, lyricsStep, setLyricsStep } = useOnboardingStore.getState();
      if (ob && lyricsStep === 4) setLyricsStep(5);
      props.onClose();
      return;
    }

    const requestedSlot = slot;
    const placed = placeChordInSlot(props.sectionId, lyricsLineId, requestedSlot, chordWithOctave);
    const placedSlot = placed?.slotIndex ?? requestedSlot;
    const w = chordSlotWidth(chord.display);
    const next = Math.min(CHORD_ROW_SLOTS - 1, placedSlot + w + 1);

    dbg("chord added", { requested: requestedSlot, placedSlot, nextCursor: next });

    if (placedSlot >= CHORD_ROW_SLOTS - 1) {
      toast("Chord row is full — close the editor to auto-fit chords across multiple lines.");
    }

    setSlot(next);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const handlePresetUse = (chords: ChordSymbol[]) => {
    if (chords.length === 0) return;
    if (isProgressionAdd || isProgression) {
      const patternId = (props as ProgressionModeProps | ProgressionAddModeProps).patternId;
      const startSlot = isProgressionAdd ? progAddCursor : 0;
      if (isProgression) {
        const existingIds = progPattern?.chords.map((c) => c.id) ?? [];
        if (existingIds.length > 0) removePatternChordsBatch(patternId, existingIds);
      }
      chords.forEach((chord, i) => {
        addChordToPatternSlot(patternId, { ...toStorage(chord), octave }, startSlot + i, 4);
      });
      if (isProgressionAdd) setProgAddCursor((c) => c + chords.length);
      const { enabled: ob, progressionsStep, setProgressionsStep } = useOnboardingStore.getState();
      if (ob && progressionsStep === 2) setProgressionsStep(3);
      // Replace mode commits one progression and closes; add mode keeps the
      // editor open so the user can keep adding.
      if (isProgression) { props.onClose(); return; }
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    if (!line) return;
    let cur = slot;
    for (const chord of chords) {
      placeChordInSlot(props.sectionId, lyricsLineId, cur, { ...toStorage(chord), octave });
      cur = Math.min(CHORD_ROW_SLOTS - 1, cur + chordSlotWidth(chord.display) + 1);
    }
    // A bulk entry (several Nashville numbers / a preset at once) can pile more
    // chords onto one row than it can show. Reflow immediately so they space out
    // by the 1-slot rule and spill onto continuation rows, instead of sitting
    // off-screen on one row until the editor closes.
    if (chords.length > 1 && typeof window !== "undefined") {
      autoLayoutSection(props.sectionId, window.innerWidth, 28);
    }
    setSlot(cur);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };


  if (!isProgression && !isProgressionAdd && !line) return null;
  if (isProgression && (!progPattern || !progChord)) return null;
  if (isProgressionAdd && !progPattern) return null;

  // Build preview slot map for lyrics mode.
  const liveChords = !isProgression && !isProgressionAdd && section
    ? getLineChordsViaSSOT(section, lyricsLineId)
    : [];
  const slotMap: (typeof liveChords[number] | undefined)[] = new Array(CHORD_ROW_SLOTS).fill(undefined);
  if (!isProgression && !isProgressionAdd) {
    liveChords.forEach((c) => {
      const s = c.slotIndex;
      if (s != null && s >= 0 && s < CHORD_ROW_SLOTS) slotMap[s] = c;
    });
  }

  const headerEyebrow = isProgressionAdd
    ? `Add chord to ${sectionLabel}`
    : isProgression
    ? `Editing chord · ${toSounding(progChord!.chord).display}`
    : `Slot ${slot + 1} of ${CHORD_ROW_SLOTS} ${anchorId ? "· editing" : "· adding"}`;
  const headerTitle = isProgressionAdd
    ? "Add Chord"
    : isProgression
    ? `Edit Chord in ${sectionLabel}`
    : `Add Chords to ${sectionLabel}`;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close chord editor"
        onClick={props.onClose}
        className="absolute inset-0 bg-black/60"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative m-4 flex flex-1 flex-col rounded-lg overflow-hidden"
        style={{ background: "var(--ink-soft)", boxShadow: "var(--shadow-paper)" }}
      >
        {/* HEADER */}
        <div
          ref={props.headerRef}
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ background: "var(--paper-shade)" }}
        >
          <button
            type="button"
            onClick={props.onClose}
            className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 w-8 shrink-0"
            aria-label="Close chord editor"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p
              className="truncate"
              style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
            >
              {headerEyebrow}
            </p>
            <h2
              id={titleId}
              className="truncate"
              style={{ fontFamily: "var(--font-display,'Zain',serif)", fontWeight: 600, fontSize: 20, color: "var(--ink)", lineHeight: 1.1 }}
            >
              {headerTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-semibold shrink-0"
          >
            Done
          </button>
        </div>

        {/* PREVIEW */}
        {!isProgression && !isProgressionAdd && liveChords.length > 0 && (
          <div className="px-3 py-2 shrink-0" style={{ background: "var(--paper-shade)" }}>
            <p
              className="mb-1"
              style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
            >
              Preview · scroll horizontally to see full row
            </p>
            <div
              ref={scrollerRef}
              className="overflow-x-auto rounded-sm"
              style={{ minHeight: 32, background: "var(--paper-shade)" }}
            >
              <div
                className="flex items-stretch"
                style={{ minWidth: CHORD_ROW_SLOTS * SLOT_PX }}
              >
                {slotMap.map((c, i) => (
                  <div
                    key={i}
                    className={cn(
                      "shrink-0 h-8 flex items-center justify-center px-0.5",
                      "w-7",
                    )}
                    style={{
                      width: SLOT_PX,
                      borderLeft: i > 0 ? "1px solid color-mix(in oklch, var(--ink) 8%, transparent)" : undefined,
                      background: i === slot ? "color-mix(in oklch, var(--primary) 18%, transparent)" : undefined,
                      boxShadow: i === slot ? "inset 0 0 0 1px var(--primary-strong)" : undefined,
                      borderRadius: i === slot ? 2 : undefined,
                    }}
                  >
                    {c && (
                      <span className="font-mono-chord text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--ink)" }}>
                        {toSounding(c.chord).display}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p
              className="mt-1 truncate"
              style={{
                fontFamily: "var(--font-display,'Zain',serif)",
                fontSize: 16,
                color: "var(--ink)",
                background: "var(--paper-shade-soft)",
                padding: "6px 10px",
                borderRadius: 6,
                marginTop: 6,
              }}
            >
              {line!.text || (
                <span style={{ fontStyle: "italic", opacity: 0.6 }}>(empty lyric line)</span>
              )}
            </p>
          </div>
        )}

        {isProgression && progChord && progPattern && (() => {
          const progSorted = section
            ? getPatternChordsViaSSOT(section, progPattern)
            : [...progPattern.chords].sort((a, b) => a.startBeat - b.startBeat);
          return (
          <div className="px-3 py-2 shrink-0" style={{ background: "var(--paper-shade)" }}>
            <p
              className="mb-1"
              style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
            >
              Preview · scroll horizontally to see full row
            </p>
            <div
              ref={scrollerRef}
              className="overflow-x-auto rounded-sm"
              style={{ minHeight: 36, background: "var(--paper-shade)" }}
            >
              <div className="flex items-stretch gap-1 py-1">
                {progSorted.map((c) => {
                  const isActive = c.id === props.chordId;
                  const sounding = toSounding(c.chord);
                  return (
                    <span
                      key={c.id}
                      className="shrink-0 inline-flex items-center justify-center rounded-md px-2 py-1 font-mono-chord text-[12px] font-semibold whitespace-nowrap"
                      style={{
                        background: isActive ? "color-mix(in oklch, var(--primary) 18%, transparent)" : "var(--paper-card)",
                        boxShadow: isActive ? "inset 0 0 0 1px var(--primary-strong)" : undefined,
                        color: "var(--ink)",
                      }}
                    >
                      {sounding.display}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          );
        })()}


        {/* Reorder controls — operate on the chord currently being edited. */}
        {!isProgressionAdd && (isProgression || liveChords.length > 0) && (() => {
          const moveChordToSlot = useSongStore.getState().moveChordToSlot;
          const movePatternChord = useSongStore.getState().movePatternChord;
          const canReorder = isProgression
            ? !!progChord
            : !!anchorId;
          const onMove = (dir: -1 | 1) => {
            if (isProgression) {
              if (!progChord) return;
              movePatternChord(props.patternId, props.chordId, dir);
            } else {
              if (!anchorId || !section) return;
              const live = getLineChordsViaSSOT(section, lyricsLineId);
              const cur = live.find((c) => c.id === anchorId);
              if (!cur || cur.slotIndex == null) return;
              const target = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, cur.slotIndex + dir));
              if (target === cur.slotIndex) return;
              moveChordToSlot(props.sectionId, lyricsLineId, anchorId, target);
            }
          };
          return (
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <span style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontSize: 11, color: "var(--cocoa-foreground)", opacity: 0.7 }}>Reorder this chord</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 w-8 disabled:opacity-30"
                  disabled={!canReorder}
                  onClick={() => onMove(-1)}
                  aria-label="Move chord left"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 w-8 disabled:opacity-30"
                  disabled={!canReorder}
                  onClick={() => onMove(1)}
                  aria-label="Move chord right"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })()}

        <div className="px-3 py-3 shrink-0 flex items-center gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a chord… e.g. Bbm9, Fmaj7"
            style={{
              flex: "1 1 0%",
              minWidth: 0,
              background: "var(--paper-card)",
              boxShadow: "var(--shadow-sculpt-cream-rest)",
              border: 0,
              borderRadius: 8,
              padding: "10px 14px",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              fontSize: 15,
              color: "var(--ink)",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sculpt-cream-press)"; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sculpt-cream-rest)"; }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (nashvilleChords) { e.preventDefault(); handlePickNashville(nashvilleChords); return; }
                if (exact) { e.preventDefault(); handlePick(exact); return; }
              } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                e.preventDefault();
                const dir: -1 | 1 = e.key === "ArrowLeft" ? -1 : 1;
                if (isProgression) {
                  useSongStore.getState().movePatternChord(props.patternId, props.chordId, dir);
                } else if (anchorId && section) {
                  const live = getLineChordsViaSSOT(section, lyricsLineId);
                  const cur = live.find((c) => c.id === anchorId);
                  if (cur && cur.slotIndex != null) {
                    const target = Math.max(0, Math.min(CHORD_ROW_SLOTS - 1, cur.slotIndex + dir));
                    useSongStore.getState().moveChordToSlot(props.sectionId, lyricsLineId, anchorId, target);
                  }
                }
              }
            }}
          />
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setOctave((o) => Math.max(1, o - 1))}
              aria-label="Decrease octave"
              style={{
                padding: "10px 10px",
                borderRadius: 8,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: 15,
                background: "var(--paper-card)",
                color: "var(--ink-soft)",
                boxShadow: "var(--shadow-sculpt-cream-rest)",
                border: "none",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >−</button>
            <span style={{
              minWidth: 28,
              textAlign: "center" as const,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--paper-card)",
            }}>{octave}</span>
            <button
              type="button"
              onClick={() => setOctave((o) => Math.min(7, o + 1))}
              aria-label="Increase octave"
              style={{
                padding: "10px 10px",
                borderRadius: 8,
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: 15,
                background: "var(--paper-card)",
                color: "var(--ink-soft)",
                boxShadow: "var(--shadow-sculpt-cream-rest)",
                border: "none",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >+</button>
          </div>
        </div>
        <div className="px-3 pb-2 shrink-0" style={{ borderBottom: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}>
          <SlashBassPicker query={query} onChange={setQuery} />
        </div>

        {/* NASHVILLE NUMBERS — a typed multi-number sequence (e.g. 4 5 3 6)
            groups its chords here, directly under the input. A single number
            instead populates the variations grid below. */}
        {nashvilleChords && nashvilleChords.length > 1 && (
          <button
            type="button"
            onClick={() => handlePickNashville(nashvilleChords)}
            className="mx-3 mt-2 mb-1 flex items-center flex-wrap gap-1.5 px-3 py-2 shrink-0 rounded-lg hover:brightness-95 active:scale-[0.99] transition-all text-left"
            style={{ background: "var(--paper-shade)" }}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Nashville</span>
            {nashvilleChords.map((c, i) => (
              <span
                key={i}
                className="font-mono-chord font-semibold px-2 py-0.5 rounded-md text-sm noise-texture-chip"
                style={getChordColorClasses(c).style}
              >
                {c.display}
              </span>
            ))}
            <span className="text-[10px] text-muted-foreground ml-auto">↩ Add {nashvilleChords.length}</span>
          </button>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3" style={{ background: "var(--ink-soft)" }}>
          {!query.trim() && (
            <p className="text-sm text-muted-foreground mb-3">
              Type a root letter (A–G) for variations, or a full chord like{" "}
              <code className="font-mono-chord">Fmaj7</code>. Or type Nashville numbers like <code className="font-mono-chord">2 5 1</code>.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s) => {
              const colors = getChordColorClasses(s.symbol);
              return (
                <div
                  key={s.symbol.display}
                  style={colors.style}
                  className={cn(
                    colors.className,
                    "noise-texture-chip group flex items-center justify-between gap-2 rounded-md border-none text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handlePick(s.symbol)}
                    className="min-w-0 flex-1 px-3 py-3 text-left bg-transparent border-0"
                  >
                    <div className="font-mono-chord font-semibold">{s.symbol.display}</div>
                    <div className="text-xs opacity-80 truncate">{s.label}</div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Preview ${s.symbol.display}`}
                    onClick={() => void playChord(s.symbol, undefined, octave)}
                    className="rounded-full p-2 mr-2 shrink-0 bg-black/10 hover:bg-black/20"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {(isProgressionAdd || (!isProgression && !anchorId)) && (
            <div className="mt-4" style={{ borderTop: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}>
              <PresetList onUse={handlePresetUse} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
