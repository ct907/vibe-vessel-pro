import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChordSymbol, suggestChords, parseChord, ALL_ROOTS, normalizeRoot } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import { Trash2, Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

const OCTAVE_OPTIONS = [3, 4, 5];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChord?: ChordSymbol;
  onPick: (chord: ChordSymbol) => void;
  onRemove?: () => void;
  /** Active chord row's line id — used so ArrowUp/Down can refocus it. */
  activeLineId?: string;
  /** Optional controlled query (kept in sync with the active chord row). */
  query?: string;
  onQueryChange?: (q: string) => void;
}

export function ChordPickerSheet({ open, onOpenChange, initialChord, onPick, onRemove, activeLineId, query: queryProp, onQueryChange }: Props) {
  const [queryInner, setQueryInner] = useState("");
  const query = queryProp ?? queryInner;
  const setQuery = (q: string) => { setQueryInner(q); onQueryChange?.(q); };
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800);
  const [octave, setOctave] = useState<number>(4);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      // When uncontrolled, seed with the existing chord display. When parent
      // controls the query, leave it alone (parent owns sync with chord row).
      if (queryProp === undefined) setQueryInner(initialChord?.display ?? "");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialChord, queryProp]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const update = () => {
      if (vv) {
        const overlap = window.innerHeight - (vv.height + vv.offsetTop);
        setKeyboardOffset(overlap > 0 ? overlap : 0);
        setVvHeight(vv.height);
      } else {
        setVvHeight(window.innerHeight);
      }
    };
    update();
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      setKeyboardOffset(0);
    };
  }, [open]);

  // With modal={false}, Radix won't auto-close on overlay click. Re-add that
  // behavior by attaching a click handler to the overlay element.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const overlay = document.querySelector<HTMLElement>("[data-radix-dialog-overlay]");
      if (!overlay) return;
      overlay.style.pointerEvents = "auto";
      const onClick = () => onOpenChange(false);
      overlay.addEventListener("click", onClick);
      (overlay as any).__chordPickerCleanup = () => overlay.removeEventListener("click", onClick);
    }, 0);
    return () => {
      window.clearTimeout(id);
      const overlay = document.querySelector<HTMLElement>("[data-radix-dialog-overlay]");
      const cleanup = overlay && (overlay as any).__chordPickerCleanup;
      if (cleanup) cleanup();
    };
  }, [open, onOpenChange]);

  const suggestions = useMemo(() => suggestChords(query), [query]);
  const exact = useMemo(() => parseChord(query.trim()), [query]);

  // Picking a chord no longer auto-closes the sheet — user can keep adding chords.
  // Close manually via the X button. Pressing Enter or double-tapping a suggestion
  // simply commits the chord and clears the input for the next entry.
  const handlePick = (chord: ChordSymbol) => {
    onPick(chord);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  // Reserve ~140px from top so the highlighted chord row (positioned ~80px from top) stays visible.
  const TOP_RESERVED = 140;
  const SHEET_CHROME = isMobile ? 160 : 200;
  const sheetMaxHeight = Math.max(220, vvHeight - TOP_RESERVED);
  const gridMaxHeight = Math.max(80, vvHeight - TOP_RESERVED - SHEET_CHROME);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="bottom"
        className="paper-card rounded-t-2xl transition-[bottom] duration-150 overflow-hidden flex flex-col pt-10 [&>button[type=button]]:top-2 [&>button[type=button]]:right-3"
        style={{ bottom: `${keyboardOffset}px`, maxHeight: `${sheetMaxHeight}px` }}
        onOpenAutoFocus={(e) => {
          // We focus the input ourselves; don't let Radix steal focus from
          // the chord row if user tapped to switch back.
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          // Allow taps on the underlying chord row / chord chips to focus them
          // without closing the sheet — but tapping a LYRIC input should close
          // the picker so the user can edit the lyric line normally.
          const t = e.target as HTMLElement | null;
          if (t && t.closest("[data-chord-row]")) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && t.closest("[data-chord-row]")) {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-stretch gap-1.5">
            <Input
              ref={inputRef}
              data-chord-picker-input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a chord… e.g. Bbm9, Fmaj7, Csus4"
              className="font-mono-chord text-base flex-1 min-w-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && exact) { handlePick(exact); return; }
                if ((e.key === "ArrowUp" || e.key === "ArrowDown") && activeLineId) {
                  e.preventDefault();
                  const el = document.querySelector<HTMLDivElement>(`[data-chord-row="${activeLineId}"]`);
                  el?.focus();
                }
              }}
            />
            <ChordTypeHelpers query={query} onChange={setQuery} />
            <Select value={String(octave)} onValueChange={(v) => setOctave(Number(v))}>
              <SelectTrigger className="h-10 w-[64px] px-2 text-xs font-mono-chord" aria-label="Audition octave">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OCTAVE_OPTIONS.map((o) => (
                  <SelectItem key={o} value={String(o)} className="text-xs font-mono-chord">
                    Oct {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!query.trim() && (
            <p className="text-sm text-muted-foreground">
              Type a root letter (A–G) for variations, or a full chord like <code className="font-mono-chord">Fmaj7</code>.
            </p>
          )}

          {isMobile ? (
            <div
              className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-1 px-1"
              style={{ maxHeight: `${gridMaxHeight}px` }}
            >
              <div className="flex gap-2 w-max pb-2">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol.display}
                    className="group flex flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent transition-colors min-w-[110px]"
                    onClick={() => handlePick(s.symbol)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-mono-chord font-semibold ink-chord">{s.symbol.display}</span>
                      <span
                        role="button"
                        aria-label={`Preview ${s.symbol.display}`}
                        onClick={(e) => { e.stopPropagation(); void playChord(s.symbol, undefined, octave); }}
                        className="ml-auto rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-background"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate w-full">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto -mx-1 px-1 flex-1 min-h-0" style={{ maxHeight: `${gridMaxHeight}px` }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol.display}
                    className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => handlePick(s.symbol)}
                  >
                    <div className="min-w-0">
                      <div className="font-mono-chord font-semibold ink-chord">{s.symbol.display}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                    </div>
                    <span
                      role="button"
                      aria-label={`Preview ${s.symbol.display}`}
                      onClick={(e) => { e.stopPropagation(); void playChord(s.symbol, undefined, octave); }}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-primary hover:bg-background"
                    >
                      <Play className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {onRemove && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => { onRemove(); onOpenChange(false); }}>
                <Trash2 className="h-4 w-4" /> Remove chord
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Helper dropdowns shown to the right of the chord input.
// They compose into the typed query string; the user can still type freely.
// ============================================================================

type TypeKey = "maj" | "m" | "dim" | "aug";
type ExtKey = "none" | "7" | "9" | "11";

const TYPE_OPTIONS: { value: TypeKey; label: string }[] = [
  { value: "maj", label: "maj" },
  { value: "m",   label: "m" },
  { value: "dim", label: "dim" },
  { value: "aug", label: "aug" },
];
const EXT_OPTIONS: { value: ExtKey; label: string }[] = [
  { value: "none", label: "—" },
  { value: "7",    label: "7" },
  { value: "9",    label: "9" },
  { value: "11",   label: "11" },
];

/** Pull a normalized root from the start of the query, or default to "C". */
function rootOf(query: string): string {
  return normalizeRoot(query.trim()) ?? "C";
}
function rootLen(query: string): number {
  const m = query.trim().match(/^[A-Ga-g][#b]?/);
  return m ? m[0].length : 0;
}
/** Parse the slash-bass off the end, returning [coreTail, bass|""]. */
function splitSlash(tail: string): [string, string] {
  const i = tail.indexOf("/");
  if (i < 0) return [tail, ""];
  const bass = normalizeRoot(tail.slice(i + 1)) ?? "";
  return [tail.slice(0, i), bass];
}
/** Detect the type segment at the start of the (post-root, pre-slash) tail. */
function detectType(core: string): TypeKey {
  const c = core.toLowerCase();
  if (c.startsWith("maj")) return "maj";
  if (c.startsWith("dim") || c.startsWith("°")) return "dim";
  if (c.startsWith("aug") || c.startsWith("+")) return "aug";
  if (c.startsWith("m") && !c.startsWith("maj")) return "m";
  return "maj";
}
function stripTypePrefix(core: string, type: TypeKey): string {
  const c = core;
  const lc = c.toLowerCase();
  if (type === "maj" && lc.startsWith("maj")) return c.slice(3);
  if (type === "m"   && lc.startsWith("m") && !lc.startsWith("maj")) return c.slice(1);
  if (type === "dim" && lc.startsWith("dim")) return c.slice(3);
  if (type === "aug" && lc.startsWith("aug")) return c.slice(3);
  return c; // no explicit prefix typed — treat as default ("maj")
}
function detectExt(rest: string): ExtKey {
  if (/^11/.test(rest)) return "11";
  if (/^9/.test(rest))  return "9";
  if (/^7/.test(rest))  return "7";
  return "none";
}

interface HelpersProps { query: string; onChange: (q: string) => void; }

function ChordTypeHelpers({ query, onChange }: HelpersProps) {
  const root = rootOf(query);
  const rl = rootLen(query);
  const tail = query.trim().slice(rl);
  const [core, bass] = splitSlash(tail);
  const typeVal = detectType(core);
  const rest = stripTypePrefix(core, typeVal);
  const extVal = detectExt(rest);

  const compose = (t: TypeKey, e: ExtKey, b: string) => {
    // Pretty-print the type so it round-trips with the parser.
    const typeStr =
      t === "maj" ? (e === "none" ? "" : "maj") // "C" + "7" = C7 (dom); "C" + "maj"+"7" handled by ext below
                  : t === "m" ? "m"
                  : t === "dim" ? "dim"
                  : "aug";
    // Special: when type=maj and ext is set, we want major-7th/9th, so emit "maj7"/"maj9".
    let suffix = typeStr;
    if (e !== "none") {
      if (t === "maj") suffix = "maj" + e;       // Cmaj7, Cmaj9, Cmaj11
      else if (t === "m") suffix = "m" + e;      // Cm7, Cm9
      else if (t === "dim") suffix = "dim" + e;  // Cdim7
      else suffix = typeStr + e;                  // Caug7
    } else if (t === "maj") {
      suffix = ""; // plain major
    }
    const slash = b ? `/${b}` : "";
    return `${root}${suffix}${slash}`;
  };

  const slashOptions = ALL_ROOTS.filter((r) => r !== root);

  return (
    <>
      <Select value={typeVal} onValueChange={(v) => onChange(compose(v as TypeKey, extVal, bass))}>
        <SelectTrigger className="h-10 w-[68px] px-2 text-xs font-mono-chord">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs font-mono-chord">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={extVal} onValueChange={(v) => onChange(compose(typeVal, v as ExtKey, bass))}>
        <SelectTrigger className="h-10 w-[64px] px-2 text-xs font-mono-chord">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs font-mono-chord">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={bass || "__none"} onValueChange={(v) => onChange(compose(typeVal, extVal, v === "__none" ? "" : v))}>
        <SelectTrigger className="h-10 w-[72px] px-2 text-xs font-mono-chord">
          <SelectValue placeholder="/—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none" className="text-xs font-mono-chord">/—</SelectItem>
          {slashOptions.map((r) => (
            <SelectItem key={r} value={r} className="text-xs font-mono-chord">/{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
