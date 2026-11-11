import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Delete, Play, Plus, Square, Trash2, Volume2, X } from "lucide-react";
import { ChordSymbol, MODE_LABEL, chordToMidi, midiToNoteName, nashvilleLadder, rootToPc, transposeChord } from "@/lib/music/chords";
import type { Mode } from "@/lib/music/chords";
import { effectiveKeyAt } from "@/lib/music/keyChange";
import { playChord, playProgression, stopProgression } from "@/lib/music/audio";
import {
  EMPTY_PREFIX,
  EXT_CYCLE,
  KEY_ROOTS,
  buildJamChord,
  isKeyChange,
  keyRootBefore,
  naturalType,
  nextAccidental,
  nextExt,
  nextType,
  normalizeStep,
  recipeLabel,
  stepFromPrefix,
  type JamItem,
  type JamKeyChange,
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
import { useSidePanel, useDockedPanelWidth, useBottomDock, JAM_BOTTOM_DOCK_H } from "@/hooks/use-side-panel";

interface Props {
  /** Section whose effective key resolves the numbers. Omitted = standalone Jam (new song, key of C). */
  sectionId?: string;
  /** Eyebrow naming the row or block the chords will land in. */
  targetLabel: string;
  /**
   * Receives the capture's chords in storage form, octave-stamped, in order.
   * `key` is the key in effect at the first chord (a standalone Jam uses it as the new song's key).
   */
  onCommit: (chords: ChordSymbol[], key: { root: string; mode: Mode }) => void;
  onClose: () => void;
  headerRef?: RefObject<HTMLDivElement | null>;
  /** The row or block being edited, scrolled clear of the keypad when it docks under the song. */
  targetSelector?: string;
}

type Modifier = "accidental" | "ext" | "type";

const ACCIDENTAL_LABEL = { [-1]: "♭", 0: "♮", 1: "♯" } as const;
const TYPE_LABEL = { maj: "maj", min: "min", dim: "dim", aug: "aug", sus4: "sus4", sus2: "sus2" } as const;
const LIT_STYLE = { outline: "2px solid var(--primary-strong)", boxShadow: "0 0 0 5px var(--primary-halo), var(--shadow-sculpt-cream-rest)" } as const;
const STANDALONE_KEY = { root: "C", mode: "maj" as Mode, offset: 0 };

/**
 * Jam mode: the T9 Nashville keypad. Number keys capture + audition chords,
 * 8 / 9 / 0 reshape the highlighted one, and # drops the whole capture into
 * the chord row the user tapped. Lives beside the Type tab (ChordInputTabs).
 */
export function JamCanvas({ sectionId, targetLabel, onCommit, onClose, headerRef, targetSelector }: Props) {
  const sections = useSongStore((s) => s.sections);
  const meta = useSongStore((s) => s.meta);
  const chordLength = useDefaultsStore((s) => s.defaultChordLengthBeats);
  const setMode = useUIStore((s) => s.setChordInputMode);
  const setEditorOpen = useUIStore((s) => s.setFocusedEditorOpen);
  const titleId = useId();
  // Inside the editor on wide screens the keypad docks beside the song; the homepage Jam stays full-screen.
  const panelW = useDockedPanelWidth();
  const side = panelW > 0 && !!sectionId;
  // Portrait tablets: the keypad docks under the song, which is scrolled clear of it.
  const bottom = useBottomDock() && !!sectionId;
  useSidePanel(side, panelW);
  useEffect(() => {
    if (!bottom) return;
    const root = document.documentElement;
    root.style.setProperty("--chord-sheet-h", `${JAM_BOTTOM_DOCK_H}px`);
    const id = window.setTimeout(() => {
      const el = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const limit = window.innerHeight - JAM_BOTTOM_DOCK_H - 12;
      if (rect.bottom > limit) window.scrollBy({ top: rect.bottom - limit, behavior: "smooth" });
      else if (rect.top < 96) window.scrollBy({ top: rect.top - 96, behavior: "smooth" });
    }, 60);
    return () => {
      window.clearTimeout(id);
      root.style.removeProperty("--chord-sheet-h");
    };
  }, [bottom, targetSelector]);

  const effective = useMemo(
    () => (sectionId ? effectiveKeyAt(sections, sectionId, meta) : STANDALONE_KEY),
    [sections, sectionId, meta],
  );
  const { root: baseRoot, mode: keyMode, offset } = effective;

  const [items, setItems] = useState<JamItem[]>([]);
  // Index of the highlighted cell; items.length is the trailing insertion cell.
  const [cursor, setCursor] = useState(0);
  const [prefix, setPrefix] = useState<JamPrefix>(EMPTY_PREFIX);
  const [octave, setOctave] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [pickingKey, setPickingKey] = useState(false);
  const [pending, setPending] = useState<{ then: "close" } | { then: "switch"; to: ChordInputMode } | null>(null);

  const cell = items[cursor];
  const onInsertCell = cursor >= items.length;
  const onKeyCell = !!cell && isKeyChange(cell);
  const current = cell && !isKeyChange(cell) ? cell : null;
  const picking = pickingKey && onKeyCell;
  const insertPos = onInsertCell ? items.length : cursor + 1;
  const keyAt = (pos: number) => keyRootBefore(items, pos, baseRoot);
  // The key the number pad plays in: whatever is in effect where a new chord would land.
  const activeRoot = keyAt(insertPos);
  const ladder = useMemo(() => nashvilleLadder(activeRoot, keyMode), [activeRoot, keyMode]);
  const chordIdx = items.flatMap((it, i) => (isKeyChange(it) ? [] : [i]));
  const chordCount = chordIdx.length;
  const resolveAt = (s: Omit<JamStep, "id">, pos: number) => buildJamChord(s, keyAt(pos), keyMode);

  useEffect(() => {
    setEditorOpen(true);
    return () => {
      setEditorOpen(false);
      stopProgression();
    };
  }, [setEditorOpen]);

  const auditionTimer = useRef<number | null>(null);
  useEffect(() => () => { if (auditionTimer.current) window.clearTimeout(auditionTimer.current); }, []);
  const audition = (chord: ChordSymbol, debounce = false) => {
    if (auditionTimer.current) window.clearTimeout(auditionTimer.current);
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
    setPickingKey(false);
    const at = insertPos;
    // With no chord highlighted (insertion cell or a key-change object) an armed
    // prefix applies to the new chord, as on the T9 hardware.
    const step = current
      ? { id: nanoid(), degree, accidental: 0 as const, type: null, ext: 0 as const }
      : stepFromPrefix(nanoid(), degree, prefix, activeRoot, keyMode);
    setItems((prev) => [...prev.slice(0, at), step, ...prev.slice(at)]);
    setCursor(at);
    setPrefix(EMPTY_PREFIX);
    audition(buildJamChord(step, activeRoot, keyMode));
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
    const root = keyAt(cursor);
    let next: JamStep;
    if (m === "ext") {
      next = { ...current, ext: nextExt(current, root, keyMode) };
    } else if (m === "accidental") {
      // Borrowed roots change the natural type, so an explicit type that now
      // matches it collapses back to null.
      const accidental = nextAccidental(current.accidental);
      const type = current.type === naturalType(current.degree, accidental, root, keyMode) ? null : current.type;
      next = normalizeStep({ ...current, accidental, type }, root, keyMode);
    } else {
      const type = nextType(current.type, naturalType(current.degree, current.accidental, root, keyMode));
      next = normalizeStep({ ...current, type }, root, keyMode);
    }
    setItems((prev) => prev.map((s) => (s.id === next.id ? next : s)));
    audition(buildJamChord(next, root, keyMode), true);
  };

  const deleteAtCursor = () => {
    stopPlaying();
    setPickingKey(false);
    if (items.length === 0) return;
    if (onInsertCell) {
      setItems((prev) => prev.slice(0, -1));
      setCursor(items.length - 1);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== cursor));
    setCursor(Math.max(0, cursor - 1));
  };

  const clearAll = () => {
    if (items.length === 0) return;
    stopPlaying();
    setPickingKey(false);
    const saved = { items, cursor };
    setItems([]);
    setCursor(0);
    setPrefix(EMPTY_PREFIX);
    toast(chordCount ? `Cleared ${chordCount} chord${chordCount === 1 ? "" : "s"}` : "Cleared the capture", {
      action: { label: "Undo", onClick: () => { setItems(saved.items); setCursor(saved.cursor); } },
    });
  };

  // Adds a key-change object after the cursor and opens the key list; pressed
  // again on that object it removes it.
  const toggleKeyChange = () => {
    if (onKeyCell) { deleteAtCursor(); return; }
    stopPlaying();
    const item: JamKeyChange = { id: nanoid(), kind: "key", root: activeRoot };
    setItems((prev) => [...prev.slice(0, insertPos), item, ...prev.slice(insertPos)]);
    setCursor(insertPos);
    setPickingKey(true);
  };

  const pickKey = (root: string) => {
    if (!cell || !isKeyChange(cell)) return;
    setItems((prev) => prev.map((it) => (it.id === cell.id ? { ...it, root } : it)));
    setPickingKey(false);
    audition(buildJamChord({ degree: 1, accidental: 0, type: null, ext: 0 }, root, keyMode));
  };

  const moveCursor = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(items.length, cursor + dir));
    setCursor(next);
    setPickingKey(false);
    const it = items[next];
    if (it && !isKeyChange(it)) audition(resolveAt(it, next));
  };

  const play = async () => {
    if (chordCount === 0) return;
    setPlaying(true);
    await playProgression(
      chordIdx.map((idx, n) => ({ chord: resolveAt(items[idx] as JamStep, idx), startBeat: n * chordLength, lengthBeats: chordLength })),
      meta.bpm,
      { octave, onChordStart: (n) => setCursor(chordIdx[n]), onEnd: () => setPlaying(false) },
    );
  };

  const captured = () => ({
    chords: chordIdx.map((i) => {
      const c = resolveAt(items[i] as JamStep, i);
      return { ...(offset ? transposeChord(c, -offset) : c), octave };
    }),
    key: { root: keyAt(chordIdx[0] ?? 0), mode: keyMode },
  });

  const commit = () => {
    if (chordCount === 0) return;
    const { chords, key } = captured();
    onCommit(chords, key);
    onClose();
  };

  const requestClose = () => {
    if (chordCount) setPending({ then: "close" });
    else onClose();
  };

  const requestSwitch = (to: ChordInputMode) => {
    if (chordCount) setPending({ then: "switch", to });
    else setMode(to);
  };

  const finishPending = (add: boolean) => {
    if (!pending) return;
    if (add) {
      const { chords, key } = captured();
      onCommit(chords, key);
    }
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
    else if (k === "k" || k === "K") toggleKeyChange();
    else if (k === " " && current) audition(resolveAt(current, cursor));
    else if (k === "Escape") { if (picking) setPickingKey(false); else requestClose(); }
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
  }, [cursor, items.length]);

  const state = current ?? prefix;
  const currentNatural = current ? naturalType(current.degree, current.accidental, keyAt(cursor), keyMode) : null;
  const typeLabel = current ? TYPE_LABEL[current.type ?? currentNatural!] : prefix.type ? TYPE_LABEL[prefix.type] : "—";
  const prefixArmed = prefix.accidental !== 0 || prefix.type !== null || prefix.ext !== 0;
  const prefixText = [prefix.accidental ? ACCIDENTAL_LABEL[prefix.accidental] : "", prefix.type ? TYPE_LABEL[prefix.type] : "", prefix.ext ? String(prefix.ext) : ""].filter(Boolean).join(" ");
  const currentChord = current ? resolveAt(current, cursor) : null;
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
      aria-modal={side || bottom ? undefined : "true"}
      aria-labelledby={titleId}
      data-jam-canvas
      className={cn("fixed z-50 flex flex-col outline-none", side ? "inset-y-0 right-0 border-l shadow-lg" : bottom ? "inset-x-0 bottom-0 rounded-t-2xl border-t shadow-lg" : "inset-0")}
      style={{
        ...(side ? { width: panelW } : bottom ? { height: JAM_BOTTOM_DOCK_H } : {}),
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
            {targetLabel} · {baseRoot} {MODE_LABEL[keyMode]}
          </p>
          <h2
            id={titleId}
            className="truncate"
            style={{ fontFamily: "var(--font-display,'Zain',serif)", fontWeight: 600, fontSize: 20, color: "var(--ink)", lineHeight: 1.1 }}
          >
            {sectionId ? "Add Chords" : "Jam"}
          </h2>
        </div>
        {sectionId && <ChordInputTabs onRequestChange={requestSwitch} />}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="btn-sculpt-cream inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col w-full max-w-md mx-auto px-3 pb-3 gap-3">
        <div className="lcd-bezel flex flex-1 min-h-[150px]">
          <div className="lcd-glass flex flex-1 min-h-0 flex-col">
            <div className="lcd-band flex shrink-0 items-center justify-between px-3 py-1 text-[11px] uppercase tracking-widest">
              <span className="inline-flex items-center gap-1.5">
                <Volume2 className={cn("h-3.5 w-3.5", playing && "animate-lcd-blink")} aria-hidden />
                {playing ? "Playing" : "Ready"}
              </span>
              <span>Key {activeRoot} · {chordCount} chord{chordCount === 1 ? "" : "s"} · Oct {octave}</span>
            </div>

            <div className="relative flex flex-1 min-h-0 flex-col">
            <div
              ref={stripRef}
              role="listbox"
              aria-label="Captured chords"
              className="flex flex-1 min-h-0 flex-wrap content-start gap-2 overflow-y-auto p-3"
            >
              {items.map((s, i) => {
                const active = i === cursor;
                if (isKeyChange(s)) {
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={`Key change to ${s.root}`}
                      data-jam-cell={i}
                      onClick={() => { setCursor(i); setPickingKey(true); }}
                      className={cn("shrink-0 px-2.5 py-1 text-left", active && "lcd-invert")}
                      style={{ border: "4px double var(--lcd-ink)" }}
                    >
                      <span className="block text-[11px] uppercase leading-tight">Key</span>
                      <span className="block text-xl leading-tight">{s.root}</span>
                    </button>
                  );
                }
                const chord = resolveAt(s, i);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${chord.display} (${recipeLabel(s)})`}
                    data-jam-cell={i}
                    onClick={() => { setCursor(i); setPickingKey(false); audition(chord); }}
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
                data-jam-cell={items.length}
                onClick={() => { setCursor(items.length); setPickingKey(false); }}
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
              ) : onKeyCell && cell && isKeyChange(cell) ? (
                <>
                  <p>Key change → <span className="normal-case">{cell.root}</span> {MODE_LABEL[keyMode]}</p>
                  <p>The keypad now plays in {cell.root}</p>
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

            {picking && cell && isKeyChange(cell) && (
              <div
                role="group"
                aria-label="Choose the new key"
                className="absolute inset-0 z-10 flex flex-col gap-2 p-3"
                style={{ background: "var(--lcd-glass)" }}
              >
                <p className="shrink-0 text-xs uppercase">Change key to…</p>
                <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-2">
                  {KEY_ROOTS.map((r) => {
                    const selected = rootToPc(r) === rootToPc(cell.root);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-label={`Key of ${r}`}
                        aria-pressed={selected}
                        onClick={() => pickKey(r)}
                        className={cn("flex min-h-0 items-center justify-center text-lg", selected && "lcd-invert")}
                        style={{ border: "2px solid var(--lcd-ink)" }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label="Key change"
            aria-pressed={onKeyCell}
            onClick={toggleKeyChange}
            className="btn-sculpt-cream inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
            style={onKeyCell ? LIT_STYLE : undefined}
          >
            <span aria-hidden className="font-mono-chord">♯♭</span>
            Key change
          </button>
          <div className="ml-auto flex items-center gap-1" aria-label="Octave">
            <button type="button" aria-label="Decrease octave" onClick={() => setOctave((o) => Math.max(1, o - 1))} className="btn-sculpt-cream h-9 w-8 rounded-lg font-mono-chord font-bold">−</button>
            <span className="min-w-[44px] text-center font-mono-chord text-sm font-bold" style={{ color: "var(--ink)" }}>Oct {octave}</span>
            <button type="button" aria-label="Increase octave" onClick={() => setOctave((o) => Math.min(7, o + 1))} className="btn-sculpt-cream h-9 w-8 rounded-lg font-mono-chord font-bold">+</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 shrink-0" role="group" aria-label="Jam controls">
          <FnKey tone="btn-sculpt-cream" icon={<Play className="h-4 w-4" />} label="Play" ariaLabel="Play capture" disabled={chordCount === 0} onPress={() => void play()} />
          <FnKey tone="btn-sculpt-tone tone-stop" icon={<Square className="h-4 w-4" />} label="Stop" ariaLabel="Stop" disabled={!playing} onPress={stopPlaying} />
          <FnKey tone="btn-sculpt-tone tone-clear" icon={<Trash2 className="h-4 w-4" />} label="Clear" ariaLabel="Clear all chords" disabled={items.length === 0} onPress={clearAll} />
          <FnKey
            tone="btn-sculpt-tone tone-add"
            icon={<Plus className="h-4 w-4" />}
            label={chordCount ? `Add ${chordCount}` : "Add"}
            ariaLabel={`Add ${chordCount} chords${sectionId ? " to the row" : " to a new song"}`}
            disabled={chordCount === 0}
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
          <Key glyph="*" label={<Delete className="h-5 w-5" aria-hidden />} caption="delete" ariaLabel="Delete chord" disabled={items.length === 0} special onPress={deleteAtCursor} />
          <Key glyph="0" label={typeLabel} caption="type" ariaLabel={`0, chord type ${typeLabel}`} lit={!!(current ? current.type : prefix.type)} special onPress={() => pressModifier("type")} />
          <Key
            glyph="#"
            label={chordCount ? `Add ${chordCount}` : "Add"}
            ariaLabel={`#, add ${chordCount} chords`}
            disabled={chordCount === 0}
            special
            onPress={commit}
          />
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {chordCount} captured chord{chordCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They haven't been added to {sectionId ? targetLabel : "a song"} yet.
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
              Add {chordCount}
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
        ...(lit ? LIT_STYLE : null),
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
