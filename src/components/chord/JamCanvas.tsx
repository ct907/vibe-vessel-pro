import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { ChevronLeft, ChevronRight, Delete, Play, Plus, Square, Volume2, X } from "lucide-react";
import { ChordSymbol, MODE_LABEL, chordToMidi, midiToNoteName, nashvilleLadder, transposeChord } from "@/lib/music/chords";
import { effectiveKeyAt } from "@/lib/music/keyChange";
import { playChord, playProgression, stopProgression } from "@/lib/music/audio";
import {
  EMPTY_PREFIX,
  EXT_CYCLE,
  buildJamChord,
  naturalType,
  nextAccidental,
  nextExt,
  nextType,
  normalizeStep,
  recipeLabel,
  stepFromPrefix,
  type JamPrefix,
  type JamStep,
} from "@/lib/music/jam";
import { useSongStore } from "@/store/song";
import { useUIStore, type ChordInputMode } from "@/store/ui";
import { useDefaultsStore } from "@/store/defaults";
import { ChordInputTabs } from "@/components/chord/ChordInputTabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface Props {
  /** Section whose effective key resolves the numbers. */
  sectionId: string;
  /** Eyebrow naming the row or block the chords will land in. */
  targetLabel: string;
  /** Receives the capture in storage form, octave-stamped, in order. */
  onCommit: (chords: ChordSymbol[]) => void;
  onClose: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
}

type Modifier = "accidental" | "ext" | "type";

const ACCIDENTAL_LABEL = { [-1]: "♭", 0: "♮", 1: "♯" } as const;
const TYPE_LABEL = { maj: "maj", min: "min", dim: "dim", aug: "aug", sus4: "sus4", sus2: "sus2" } as const;

/**
 * Jam mode: the T9 Nashville keypad. Number keys capture + audition chords,
 * 8 / 9 / 0 reshape the highlighted one, and # drops the whole capture into
 * the chord row the user tapped. Lives beside the Type tab (ChordInputTabs).
 */
export function JamCanvas({ sectionId, targetLabel, onCommit, onClose, headerRef }: Props) {
  const sections = useSongStore((s) => s.sections);
  const meta = useSongStore((s) => s.meta);
  const chordLength = useDefaultsStore((s) => s.defaultChordLengthBeats);
  const setMode = useUIStore((s) => s.setChordInputMode);
  const setEditorOpen = useUIStore((s) => s.setFocusedEditorOpen);
  const titleId = useId();

  const effective = useMemo(() => effectiveKeyAt(sections, sectionId, meta), [sections, sectionId, meta]);
  const { root: keyRoot, mode: keyMode, offset } = effective;
  const ladder = useMemo(() => nashvilleLadder(keyRoot, keyMode), [keyRoot, keyMode]);

  const [steps, setSteps] = useState<JamStep[]>([]);
  // Index of the highlighted chord; steps.length is the trailing insertion cell.
  const [cursor, setCursor] = useState(0);
  const [prefix, setPrefix] = useState<JamPrefix>(EMPTY_PREFIX);
  const [octave, setOctave] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState<{ then: "close" } | { then: "switch"; to: ChordInputMode } | null>(null);

  const onInsertCell = cursor >= steps.length;
  const current = onInsertCell ? null : steps[cursor];
  const resolve = (s: Omit<JamStep, "id">) => buildJamChord(s, keyRoot, keyMode);

  useEffect(() => {
    setEditorOpen(true);
    return () => {
      setEditorOpen(false);
      stopProgression();
    };
  }, [setEditorOpen]);

  const auditionTimer = useRef<number | null>(null);
  useEffect(() => () => { if (auditionTimer.current) window.clearTimeout(auditionTimer.current); }, []);
  const audition = (s: Omit<JamStep, "id">, debounce = false) => {
    if (auditionTimer.current) window.clearTimeout(auditionTimer.current);
    const chord = resolve(s);
    if (!debounce) { void playChord(chord, 1.2, octave); return; }
    // Rapid 8/9/0 taps would otherwise stack voices on every stop of the cycle.
    auditionTimer.current = window.setTimeout(() => void playChord(chord, 1.2, octave), 150);
  };

  const stopPlaying = () => {
    if (!playing) return;
    stopProgression();
    setPlaying(false);
  };

  const pressDegree = (degree: number) => {
    if (degree > ladder.length) return;
    stopPlaying();
    const at = onInsertCell ? steps.length : cursor + 1;
    const step = onInsertCell
      ? stepFromPrefix(nanoid(), degree, prefix, keyRoot, keyMode)
      : { id: nanoid(), degree, accidental: 0 as const, type: null, ext: 0 as const };
    setSteps((prev) => [...prev.slice(0, at), step, ...prev.slice(at)]);
    setCursor(at);
    setPrefix(EMPTY_PREFIX);
    audition(step);
  };

  const pressModifier = (m: Modifier) => {
    stopPlaying();
    if (!current) {
      setPrefix((p) => ({
        ...p,
        accidental: m === "accidental" ? nextAccidental(p.accidental) : p.accidental,
        type: m === "type" ? nextType(p.type, "maj") : p.type,
        ext: m === "ext" ? EXT_CYCLE[(EXT_CYCLE.indexOf(p.ext) + 1) % EXT_CYCLE.length] : p.ext,
      }));
      return;
    }
    let next: JamStep;
    if (m === "ext") {
      next = { ...current, ext: nextExt(current, keyRoot, keyMode) };
    } else if (m === "accidental") {
      // Borrowed roots change the natural type, so an explicit type that now
      // matches it collapses back to null.
      const accidental = nextAccidental(current.accidental);
      const type = current.type === naturalType(current.degree, accidental, keyRoot, keyMode) ? null : current.type;
      next = normalizeStep({ ...current, accidental, type }, keyRoot, keyMode);
    } else {
      const type = nextType(current.type, naturalType(current.degree, current.accidental, keyRoot, keyMode));
      next = normalizeStep({ ...current, type }, keyRoot, keyMode);
    }
    setSteps((prev) => prev.map((s) => (s.id === next.id ? next : s)));
    audition(next, true);
  };

  const deleteAtCursor = () => {
    stopPlaying();
    if (steps.length === 0) return;
    if (onInsertCell) {
      setSteps((prev) => prev.slice(0, -1));
      setCursor(steps.length - 1);
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== cursor));
    setCursor(Math.max(0, cursor - 1));
  };

  const moveCursor = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(steps.length, cursor + dir));
    setCursor(next);
    if (next < steps.length) audition(steps[next]);
  };

  const play = async () => {
    if (steps.length === 0) return;
    setPlaying(true);
    await playProgression(
      steps.map((s, i) => ({ chord: resolve(s), startBeat: i * chordLength, lengthBeats: chordLength })),
      meta.bpm,
      { octave, onChordStart: (i) => setCursor(i), onEnd: () => setPlaying(false) },
    );
  };

  const captured = () =>
    steps.map((s) => {
      const c = resolve(s);
      return { ...(offset ? transposeChord(c, -offset) : c), octave };
    });

  const commit = () => {
    if (steps.length === 0) return;
    onCommit(captured());
    onClose();
  };

  const requestClose = () => {
    if (steps.length) setPending({ then: "close" });
    else onClose();
  };

  const requestSwitch = (to: ChordInputMode) => {
    if (steps.length) setPending({ then: "switch", to });
    else setMode(to);
  };

  const finishPending = (add: boolean) => {
    if (!pending) return;
    if (add) onCommit(captured());
    setPending(null);
    if (pending.then === "close") onClose();
    else setMode(pending.to);
  };

  // The number row doubles as the keypad on hardware keyboards.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (pending || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
    const k = e.key;
    // A focused button already turns Enter/Space into its own click.
    if ((k === "Enter" || k === " ") && t?.closest("button")) return;
    if (k >= "1" && k <= "7") pressDegree(Number(k));
    else if (k === "8") pressModifier("accidental");
    else if (k === "9") pressModifier("ext");
    else if (k === "0") pressModifier("type");
    else if (k === "*" || k === "Backspace" || k === "Delete") deleteAtCursor();
    else if (k === "#" || k === "Enter") commit();
    else if (k === "ArrowLeft") moveCursor(-1);
    else if (k === "ArrowRight") moveCursor(1);
    else if (k === " " && current) audition(current);
    else if (k === "Escape") requestClose();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Take focus so typed digits don't land in a lyric field that had it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rootRef.current?.focus(); }, []);

  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-jam-cell="${cursor}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cursor, steps.length]);

  const state = current ?? prefix;
  const currentNatural = current ? naturalType(current.degree, current.accidental, keyRoot, keyMode) : null;
  const typeLabel = current ? TYPE_LABEL[current.type ?? currentNatural!] : prefix.type ? TYPE_LABEL[prefix.type] : "—";
  const prefixArmed = prefix.accidental !== 0 || prefix.type !== null || prefix.ext !== 0;
  const prefixText = [prefix.accidental ? ACCIDENTAL_LABEL[prefix.accidental] : "", prefix.type ? TYPE_LABEL[prefix.type] : "", prefix.ext ? String(prefix.ext) : ""].filter(Boolean).join(" ");
  const currentChord = current ? resolve(current) : null;
  const noteNames = currentChord
    ? Array.from(new Set(chordToMidi(currentChord, octave).map((m) => midiToNoteName(m, currentChord.root.includes("b")).replace(/\d+$/, ""))))
    : [];

  // Portaled: an ancestor in the tabs creates a containing block that would
  // otherwise offset this fixed overlay.
  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-jam-canvas
      className="fixed inset-0 z-50 flex flex-col outline-none"
      style={{
        background: "var(--paper-shade)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div ref={headerRef} className="flex items-center gap-2 w-full max-w-md mx-auto px-3 py-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
          >
            {targetLabel} · {keyRoot} {MODE_LABEL[keyMode]}
          </p>
          <h2
            id={titleId}
            className="truncate"
            style={{ fontFamily: "var(--font-display,'Zain',serif)", fontWeight: 600, fontSize: 20, color: "var(--ink)", lineHeight: 1.1 }}
          >
            Add Chords
          </h2>
        </div>
        <ChordInputTabs onRequestChange={requestSwitch} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col w-full max-w-md mx-auto px-3 pb-3 gap-3">
        <div className="lcd-bezel flex flex-1 min-h-[150px]">
          <div className="lcd-glass flex flex-1 min-h-0 flex-col">
            <div className="lcd-band flex shrink-0 items-center justify-between px-3 py-1 text-[11px] uppercase tracking-widest">
              <span className="inline-flex items-center gap-1.5">
                <Volume2 className={cn("h-3.5 w-3.5", playing && "animate-lcd-blink")} aria-hidden />
                {playing ? "Playing" : "Ready"}
              </span>
              <span>{steps.length} chord{steps.length === 1 ? "" : "s"} · Oct {octave}</span>
            </div>

            <div
              ref={stripRef}
              role="listbox"
              aria-label="Captured chords"
              className="flex flex-1 min-h-0 flex-wrap content-start gap-2 overflow-y-auto p-3"
            >
              {steps.map((s, i) => {
                const chord = resolve(s);
                const active = i === cursor;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${chord.display} (${recipeLabel(s)})`}
                    data-jam-cell={i}
                    onClick={() => { setCursor(i); audition(s); }}
                    className={cn("shrink-0 px-2.5 py-1 text-left", active && "lcd-invert")}
                    style={{ border: "2px solid var(--lcd-ink)" }}
                  >
                    <span className="block text-xl leading-tight">{chord.display}</span>
                    <span className="block text-[11px] leading-tight">{recipeLabel(s)}</span>
                  </button>
                );
              })}
              <button
                type="button"
                role="option"
                aria-selected={onInsertCell}
                aria-label="Insertion point"
                data-jam-cell={steps.length}
                onClick={() => setCursor(steps.length)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1 text-xl leading-tight"
                style={{ border: "2px dashed var(--lcd-ink)" }}
              >
                <span className={onInsertCell ? "animate-lcd-blink" : undefined}>+</span>
                {prefixArmed && <span className="text-[11px]">{prefixText}</span>}
              </button>
            </div>

            <div
              className="min-h-[3.4rem] shrink-0 px-3 py-2 text-xs leading-snug uppercase"
              style={{ borderTop: "2px dashed var(--lcd-ink)" }}
              aria-live="polite"
            >
              {current && currentChord ? (
                <>
                  <p>{recipeLabel(current)} → <span className="normal-case">{currentChord.display}</span></p>
                  <p>Notes: <span className="normal-case">{noteNames.join(" ")}</span></p>
                </>
              ) : prefixArmed ? (
                <>
                  <p>Next chord</p>
                  <p>{prefixText}</p>
                </>
              ) : (
                <>
                  <p>Press 1–7 to hear a chord</p>
                  <p>8 ♭/♯ · 9 ext · 0 type</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" aria-label="Previous chord" onClick={() => moveCursor(-1)} className="btn-sculpt-cream inline-flex h-9 w-9 items-center justify-center rounded-lg">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next chord" onClick={() => moveCursor(1)} className="btn-sculpt-cream inline-flex h-9 w-9 items-center justify-center rounded-lg">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="ml-auto flex items-center gap-1" aria-label="Octave">
            <button type="button" aria-label="Decrease octave" onClick={() => setOctave((o) => Math.max(1, o - 1))} className="btn-sculpt-cream h-9 w-8 rounded-lg font-mono-chord font-bold">−</button>
            <span className="min-w-[44px] text-center font-mono-chord text-sm font-bold" style={{ color: "var(--ink)" }}>Oct {octave}</span>
            <button type="button" aria-label="Increase octave" onClick={() => setOctave((o) => Math.min(7, o + 1))} className="btn-sculpt-cream h-9 w-8 rounded-lg font-mono-chord font-bold">+</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 shrink-0" role="group" aria-label="Jam controls">
          <FnKey tone="btn-sculpt-cream" icon={<Play className="h-4 w-4" />} label="Play" ariaLabel="Play capture" disabled={steps.length === 0} onPress={() => void play()} />
          <FnKey tone="btn-sculpt-blue" icon={<Square className="h-4 w-4" />} label="Stop" ariaLabel="Stop" disabled={!playing} onPress={stopPlaying} />
          <FnKey tone="btn-sculpt-destructive" icon={<X className="h-4 w-4" />} label="Cancel" ariaLabel="Cancel" onPress={requestClose} />
          <FnKey
            tone="btn-sculpt-amber"
            icon={<Plus className="h-4 w-4" />}
            label={steps.length ? `Add ${steps.length}` : "Add"}
            ariaLabel={`Add ${steps.length} chords to the row`}
            disabled={steps.length === 0}
            onPress={commit}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 shrink-0" role="group" aria-label="Nashville keypad">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const entry = ladder[d - 1];
            const lit = !!current && current.degree === d;
            return (
              <Key
                key={d}
                glyph={String(d)}
                label={entry?.chord.display ?? "—"}
                caption={entry?.numeral}
                ariaLabel={entry ? `${d}, ${entry.chord.display}` : `${d}, not in this scale`}
                disabled={!entry}
                lit={lit}
                onPress={() => pressDegree(d)}
              />
            );
          })}
          <Key glyph="8" label={ACCIDENTAL_LABEL[state.accidental]} caption="♭ / ♯" ariaLabel={`8, accidental ${ACCIDENTAL_LABEL[state.accidental]}`} lit={state.accidental !== 0} special onPress={() => pressModifier("accidental")} />
          <Key glyph="9" label={state.ext ? String(state.ext) : "—"} caption="ext" ariaLabel={`9, extension ${state.ext || "off"}`} lit={state.ext !== 0} special onPress={() => pressModifier("ext")} />
          <Key glyph="*" label={<Delete className="h-5 w-5" aria-hidden />} caption="delete" ariaLabel="Delete chord" disabled={steps.length === 0} special onPress={deleteAtCursor} />
          <Key glyph="0" label={typeLabel} caption="type" ariaLabel={`0, chord type ${typeLabel}`} lit={!!(current ? current.type : prefix.type)} special onPress={() => pressModifier("type")} />
          <Key
            glyph="#"
            label={steps.length ? `Add ${steps.length}` : "Add"}
            ariaLabel={`#, add ${steps.length} chords`}
            disabled={steps.length === 0}
            special
            onPress={commit}
          />
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {steps.length} captured chord{steps.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They haven't been added to {targetLabel} yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep jamming</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => finishPending(false)}
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction onClick={() => finishPending(true)}>
              Add {steps.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  );
}

interface KeyProps {
  glyph: string;
  label: ReactNode;
  caption?: string;
  ariaLabel: string;
  lit?: boolean;
  disabled?: boolean;
  /** 8 / 9 / 0 / * / # — the function keys, shaded apart from the number keys. */
  special?: boolean;
  onPress: () => void;
}

function FnKey({ tone, icon, label, ariaLabel, disabled, onPress }: {
  tone: string; icon: ReactNode; label: string; ariaLabel: string; disabled?: boolean; onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(tone, "flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl select-none disabled:opacity-40")}
    >
      {icon}
      <span className="text-[11px] font-bold uppercase leading-none tracking-wide">{label}</span>
    </button>
  );
}

function Key({ glyph, label, caption, ariaLabel, lit, disabled, special, onPress }: KeyProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        "btn-sculpt-cream",
        "flex h-[clamp(56px,9dvh,76px)] items-center justify-between gap-2 rounded-xl px-3 select-none disabled:opacity-40",
      )}
      style={{
        ...(special ? { background: "color-mix(in oklch, var(--paper-shade) 80%, var(--cocoa) 20%)" } : null),
        ...(lit ? { outline: "2px solid var(--primary-strong)", boxShadow: "0 0 0 5px var(--primary-halo), var(--shadow-sculpt-cream-rest)" } : null),
      }}
    >
      <span
        className="font-mono-chord text-2xl font-bold leading-none"
        style={{ color: special ? "var(--ink)" : "var(--primary-strong)" }}
      >
        {glyph}
      </span>
      <span className="flex min-w-0 flex-col items-end">
        <span className="truncate font-mono-chord text-base font-semibold leading-tight" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        {caption && (
          <span className="font-mono-chord text-[10px] leading-tight opacity-70" style={{ color: special ? "var(--ink)" : "var(--ink-soft)" }}>
            {caption}
          </span>
        )}
      </span>
    </button>
  );
}
