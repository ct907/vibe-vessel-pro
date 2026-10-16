import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { ChordSymbol, suggestChords, parseChord, parseNashvilleInput, transposeChord } from "@/lib/music/chords";
import { effectiveKeyAt } from "@/lib/music/keyChange";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
  CHORD_ROW_SLOTS,
  type LyricLine,
} from "@/store/song";
import { useUIStore } from "@/store/ui";
import { useOnboardingStore } from "@/store/onboarding";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
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
 * Mobile chord entry. The "type" view is a short, non-modal sheet docked above
 * the keyboard so the tapped row stays visible; "Browse Popular Progressions"
 * swaps it for a full-height modal.
 *
 * Modes:
 *  - "lyrics" (default): adds chords to a lyric row, slot-by-slot. Taps on
 *    other slots/chords retarget the open sheet.
 *  - "progression": replaces the chord family of a single chord in the
 *    progression view (tap-to-edit).
 *  - "progression-add": adds chords to an empty progression slot.
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
  const [view, setView] = useState<"type" | "browse">("type");
  const [previewed, setPreviewed] = useState<string | null>(null);
  const [kbOffset, setKbOffset] = useState(0);
  const [obstruct, setObstruct] = useState(0);
  // Local cursor for progression-add multi-typed-Enter: starts at props.atBeat,
  // bumps after each insert so successive chords land left-to-right.
  const [progAddCursor, setProgAddCursor] = useState(
    isProgressionAdd ? (props as ProgressionAddModeProps).atBeat : 0,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const setEditorOpen = useUIStore((s) => s.setFocusedEditorOpen);
  const setEditorTarget = useUIStore((s) => s.setFocusedEditorTarget);

  useEffect(() => {
    setEditorOpen(true);
    dbg("mounted — focusedEditorOpen: true");
    return () => {
      setEditorOpen(false);
      setEditorTarget(null);
      dbg("unmounted — focusedEditorOpen: false");
    };
  }, [setEditorOpen, setEditorTarget]);

  // Escape backs out of the browse modal first, then closes the editor.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (view === "browse") setView("type");
      else props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.onClose, view]);

  // The sheet is non-modal, so taps on other slots/chords change the target
  // props while it stays mounted — re-seed whenever the target changes.
  const seedKey = isProgressionAdd
    ? `add:${props.patternId}:${props.atBeat}`
    : isProgression
    ? `prog:${props.chordId}`
    : `lyrics:${lyricsLineId}:${lyricsInitialSlot}:${lyricsInitialAnchorId ?? ""}`;

  useEffect(() => {
    if (isProgressionAdd) {
      setProgAddCursor(props.atBeat);
      setQuery("");
      setOctave(3);
    } else if (isProgression) {
      setQuery(progChord ? toSounding(progChord.chord).display : "");
      setOctave(progChord?.chord.octave ?? 3);
    } else {
      setSlot(lyricsInitialSlot);
      setAnchorId(lyricsInitialAnchorId);
      const lineChords = section ? getLineChordsViaSSOT(section, lyricsLineId) : [];
      const initialChord = lineChords.find((c) => c.id === lyricsInitialAnchorId)?.chord;
      setQuery(initialChord ? toSounding(initialChord).display : "");
      setOctave(initialChord?.octave ?? 3);
    }
    setView("type");
    setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  useEffect(() => setPreviewed(null), [query]);

  // Publish the targeted slot/chord so the song rows can highlight it.
  useEffect(() => {
    if (isProgressionAdd) setEditorTarget({ patternId: props.patternId, slotIndex: progAddCursor });
    else if (isProgression) setEditorTarget({ patternId: props.patternId, chordId: props.chordId });
    else setEditorTarget({ lineId: lyricsLineId, slotIndex: slot, chordId: anchorId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, slot, anchorId, progAddCursor]);

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

  // Dock above the on-screen keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKbOffset(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Publish how much of the page the sheet covers so the page can pad its
  // bottom edge and the target row can be scrolled clear of it.
  useEffect(() => {
    const root = document.documentElement;
    const el = sheetRef.current;
    if (view !== "type" || !el) {
      root.style.removeProperty("--chord-sheet-h");
      setObstruct(0);
      return;
    }
    const apply = () => {
      const h = el.offsetHeight + kbOffset;
      root.style.setProperty("--chord-sheet-h", `${h}px`);
      setObstruct(h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--chord-sheet-h");
    };
  }, [view, kbOffset]);

  // Keep the targeted row visible above the sheet.
  useEffect(() => {
    if (view !== "type" || !obstruct) return;
    const selector = isProgression
      ? `[data-pattern-chord="${props.chordId}"]`
      : isProgressionAdd
      ? `[data-pattern-block="${props.patternId}"]`
      : `[data-line-id="${lyricsLineId}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const limit = window.innerHeight - obstruct - 12;
    if (rect.bottom > limit) window.scrollBy({ top: rect.bottom - limit, behavior: "smooth" });
    else if (rect.top < 96) window.scrollBy({ top: rect.top - 96, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, obstruct, view]);

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
      setView("type");
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
    setView("type");
    setSlot(cur);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };


  if (!isProgression && !isProgressionAdd && !line) return null;
  if (isProgression && (!progPattern || !progChord)) return null;
  if (isProgressionAdd && !progPattern) return null;

  const isAdding = isProgressionAdd || (!isProgression && !anchorId);
  const showControls = !isAdding || query.trim().length > 0;

  const blockIdx = isProgression || isProgressionAdd
    ? progression
        .filter((p) => (p.sectionId ?? p.id) === props.sectionId)
        .findIndex((p) => p.id === props.patternId)
    : section
    ? section.lines.findIndex((l) => l.id === lyricsLineId)
    : -1;
  const headerEyebrow = `${sectionLabel}${blockIdx >= 0 ? ` block ${blockIdx + 1}` : ""}`;

  const stepBtnStyle: CSSProperties = {
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
  };

  const renderHeader = (title: string) => (
    <div
      ref={props.headerRef}
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{ background: "var(--paper-shade)" }}
    >
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
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={props.onClose}
        className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-8 px-4 text-sm font-semibold shrink-0"
      >
        Done
      </button>
    </div>
  );

  if (view === "browse") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col">
        <button
          type="button"
          aria-label="Back to typing chords"
          onClick={() => setView("type")}
          className="h-3 shrink-0 bg-black/60"
        />
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-t-xl"
          style={{ background: "var(--paper-shade)", boxShadow: "var(--shadow-paper)" }}
        >
          {renderHeader("Browse Popular Progressions")}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3" style={{ background: "var(--ink-soft)" }}>
            <PresetList heading="" onUse={handlePresetUse} />
          </div>
          <div className="px-3 py-2 shrink-0" style={{ background: "var(--cocoa-deep)" }}>
            <button
              type="button"
              onClick={() => {
                setView("type");
                setTimeout(() => inputRef.current?.focus(), 30);
              }}
              className="btn-sculpt-cocoa inline-flex items-center gap-1 rounded-lg h-8 px-3 text-sm font-semibold"
            >
              Type In Chords
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-labelledby={titleId}
      className="fixed inset-x-0 z-50 flex flex-col overflow-hidden rounded-t-xl"
      style={{
        bottom: kbOffset,
        maxHeight: "60dvh",
        background: "var(--paper-shade)",
        boxShadow: "var(--shadow-paper)",
      }}
    >
      {renderHeader(isAdding ? "Add Chords" : "Edit Chord")}

      {/* NASHVILLE NUMBERS — a typed multi-number sequence (e.g. 4 5 3 6)
          groups its chords here. A single number instead populates the
          variations strip below. */}
      {nashvilleChords && nashvilleChords.length > 1 && (
        <button
          type="button"
          onClick={() => handlePickNashville(nashvilleChords)}
          className="mx-3 mb-2 flex items-center flex-wrap gap-1.5 px-3 py-2 shrink-0 rounded-lg active:scale-[0.99] transition-all text-left"
          style={{ background: "var(--paper-card)" }}
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

      {showControls && suggestions.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto px-3 pb-2 shrink-0"
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s) => {
            const colors = getChordColorClasses(s.symbol);
            const isPreviewed = previewed === s.symbol.display;
            return (
              <div
                key={s.symbol.display}
                style={colors.style}
                className={`${colors.className} noise-texture-chip flex shrink-0 items-stretch rounded-md border-none ${isPreviewed ? "ring-2 ring-[var(--primary-strong)]" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Preview ${s.symbol.display}`}
                  onClick={() => {
                    setPreviewed(s.symbol.display);
                    void playChord(s.symbol, undefined, octave);
                  }}
                  className="min-w-0 py-2 pl-3 pr-2 text-left bg-transparent border-0"
                >
                  <span className="block font-mono-chord text-sm font-semibold leading-tight">{s.symbol.display}</span>
                  <span className="block whitespace-nowrap font-mono-chord text-[10px] opacity-80 leading-tight">{s.label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Add ${s.symbol.display}`}
                  onClick={() => handlePick(s.symbol)}
                  className="flex items-center px-2 bg-transparent border-0"
                >
                  <Plus className="h-5 w-5 opacity-70" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-3 pb-3 shrink-0 flex items-center gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type A Chord e.g. Bbm9 or 4"
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
        {showControls && (
          <>
            <SlashBassPicker query={query} onChange={setQuery} />
            <div className="flex items-center gap-0.5 shrink-0" onMouseDown={(e) => e.preventDefault()}>
              <button type="button" onClick={() => setOctave((o) => Math.max(1, o - 1))} aria-label="Decrease octave" style={stepBtnStyle}>−</button>
              <span style={{ minWidth: 24, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                {octave}
              </span>
              <button type="button" onClick={() => setOctave((o) => Math.min(7, o + 1))} aria-label="Increase octave" style={stepBtnStyle}>+</button>
            </div>
          </>
        )}
      </div>

      {isAdding && (
        <div className="px-3 py-2 shrink-0" style={{ background: "var(--cocoa-deep)" }}>
          <button
            type="button"
            onClick={() => setView("browse")}
            className="btn-sculpt-cocoa inline-flex items-center gap-1 rounded-lg h-8 px-3 text-sm font-semibold"
          >
            Browse Popular Progressions
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
