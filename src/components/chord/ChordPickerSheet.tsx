import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChordSymbol, suggestChords, parseChord, ALL_ROOTS, normalizeRoot } from "@/lib/music/chords";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import { Play } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const OCTAVE_OPTIONS = [3, 4, 5];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChord?: ChordSymbol;
  onPick: (chord: ChordSymbol) => void;
  /** Active chord row's line id — used so ArrowUp/Down can refocus it. */
  activeLineId?: string;
  /** Active slot index — changes trigger input refocus to keep typing fast. */
  activeSlotIndex?: number;
  /** Optional controlled query (kept in sync with the active chord row). */
  query?: string;
  onQueryChange?: (q: string) => void;
  /** Live-save hook for octave-only edits (no chord re-pick). */
  onOctaveChange?: (octave: number) => void;
}

export function ChordPickerSheet({ open, onOpenChange, initialChord, onPick, activeLineId, activeSlotIndex, query: queryProp, onQueryChange, onOctaveChange }: Props) {
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
      if (queryProp === undefined) setQueryInner(initialChord?.display ?? "");
      setOctave(initialChord?.octave ?? 4);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialChord, queryProp]);

  // When the user taps another slot in the chord row while the picker is
  // already open, the active line/anchor changes — refocus the input so the
  // user can keep typing without manually tapping back into the field.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, activeLineId, activeSlotIndex, initialChord?.display]);

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
    onPick({ ...chord, octave });
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  // Reserve ~140px from top so the highlighted chord row (positioned ~80px from top) stays visible.
  const TOP_RESERVED = 140;
  const SHEET_CHROME = isMobile ? 160 : 200;
  // Desktop: cap the sheet at 40% of viewport height so a short query like
  // "G" doesn't flood the screen with a long scrolling list. Mobile keeps
  // the previous behavior (use as much height as is available above the
  // editing row) because there's much less screen real estate to work with
  // and the keyboard already eats most of it.
  const sheetMaxHeight = isMobile
    ? Math.max(220, vvHeight - TOP_RESERVED)
    : Math.max(220, Math.min(vvHeight * 0.4, vvHeight - TOP_RESERVED));
  const gridMaxHeight = Math.max(80, sheetMaxHeight - SHEET_CHROME);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl transition-[bottom] duration-150 overflow-hidden flex flex-col pt-10 [&>button[type=button]]:top-2 [&>button[type=button]]:right-3"
        style={{ bottom: `${keyboardOffset}px`, maxHeight: `${sheetMaxHeight}px`, background: "var(--ink-soft)" }}
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
            <input
              ref={inputRef}
              data-chord-picker-input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a chord… e.g. Bbm9, Fmaj7, Csus4"
              style={{
                flex: 1,
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
                if (e.key === "Enter" && exact) { handlePick(exact); return; }
                if ((e.key === "ArrowUp" || e.key === "ArrowDown") && activeLineId) {
                  e.preventDefault();
                  const el = document.querySelector<HTMLDivElement>(`[data-chord-row="${activeLineId}"]`);
                  el?.focus();
                }
              }}
            />
            <ChordTypeHelpers query={query} onChange={setQuery} />
            <Select value={String(octave)} onValueChange={(v) => { const o = Number(v); setOctave(o); onOctaveChange?.(o); }}>
              <SelectTrigger
                className="h-10 w-[64px] px-2 text-xs font-mono-chord border-0"
                style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 8 }}
                aria-label="Audition octave"
              >
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
                {suggestions.map((s) => {
                  const colors = getChordColorClasses(s.symbol);
                  return (
                    <button
                      key={s.symbol.display}
                      style={colors.style}
                      className={cn(
                        colors.className,
                        "group flex flex-col items-start gap-0.5 rounded-md border-none px-3 py-2 text-left min-w-[110px]",
                      )}
                      onClick={() => handlePick(s.symbol)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-mono-chord font-semibold">{s.symbol.display}</span>
                        <span
                          role="button"
                          aria-label={`Preview ${s.symbol.display}`}
                          onClick={(e) => { e.stopPropagation(); void playChord(s.symbol, undefined, octave); }}
                          className="ml-auto rounded-full p-1 bg-black/10 hover:bg-black/20"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="text-[10px] opacity-80 truncate w-full">{s.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto -mx-1 px-1 flex-1 min-h-0" style={{ maxHeight: `${gridMaxHeight}px` }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suggestions.map((s) => {
                  const colors = getChordColorClasses(s.symbol);
                  return (
                    <button
                      key={s.symbol.display}
                      style={colors.style}
                      className={cn(
                        colors.className,
                        "group flex items-center justify-between gap-2 rounded-md border-none px-3 py-2 text-left",
                      )}
                      onClick={() => handlePick(s.symbol)}
                    >
                      <div className="min-w-0">
                        <div className="font-mono-chord font-semibold">{s.symbol.display}</div>
                        <div className="text-xs opacity-80 truncate">{s.label}</div>
                      </div>
                      <span
                        role="button"
                        aria-label={`Preview ${s.symbol.display}`}
                        onClick={(e) => { e.stopPropagation(); void playChord(s.symbol, undefined, octave); }}
                        className="rounded-full p-1.5 bg-black/10 hover:bg-black/20"
                      >
                        <Play className="h-4 w-4" />
                      </span>
                    </button>
                  );
                })}
              </div>
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
// Phase 1.5: Type × Variant (context-sensitive) + altered-dominant chips +
// slash-bass select. Covers the full vocabulary in COMMON_QUALITIES.
// ============================================================================

type TypeKey = "maj" | "m" | "dim" | "aug" | "sus" | "5";

const TYPE_OPTIONS: { value: TypeKey; label: string }[] = [
  { value: "maj", label: "maj" },
  { value: "m",   label: "m" },
  { value: "dim", label: "dim" },
  { value: "aug", label: "aug" },
  { value: "sus", label: "sus" },
  { value: "5",   label: "5" },
];

// Variant suffixes per Type. Empty string = base triad / no variant.
const VARIANTS_BY_TYPE: Record<TypeKey, { value: string; label: string }[]> = {
  maj: [
    { value: "",      label: "—" },
    { value: "6",     label: "6" },
    { value: "7",     label: "7" },
    { value: "9",     label: "9" },
    { value: "11",    label: "11" },
    { value: "13",    label: "13" },
    { value: "6/9",   label: "6/9" },
    { value: "add9",  label: "add9" },
    { value: "add11", label: "add11" },
  ],
  m: [
    { value: "",     label: "—" },
    { value: "6",    label: "6" },
    { value: "7",    label: "7" },
    { value: "9",    label: "9" },
    { value: "11",   label: "11" },
    { value: "13",   label: "13" },
    { value: "Maj7", label: "Maj7" },
  ],
  dim: [
    { value: "",     label: "—" },
    { value: "7",    label: "7" },
    { value: "m7b5", label: "ø" },
  ],
  aug: [
    { value: "",  label: "—" },
    { value: "7", label: "7" },
  ],
  sus: [
    { value: "2", label: "2" },
    { value: "4", label: "4" },
  ],
  "5": [{ value: "", label: "—" }],
};

const ALTERED_CHIPS: { value: "" | "alt" | "#5" | "b9" | "#9"; label: string }[] = [
  { value: "",    label: "plain" },
  { value: "alt", label: "alt" },
  { value: "#5",  label: "#5" },
  { value: "b9",  label: "b9" },
  { value: "#9",  label: "#9" },
];

function rootOf(query: string): string {
  return normalizeRoot(query.trim()) ?? "C";
}
function rootLen(query: string): number {
  const m = query.trim().match(/^[A-Ga-g][#b]?/);
  return m ? m[0].length : 0;
}
function splitSlash(tail: string): [string, string] {
  if (/^6\/9(?!\/)/.test(tail)) {
    const after = tail.slice(3);
    if (after.startsWith("/")) {
      const bass = normalizeRoot(after.slice(1)) ?? "";
      return ["6/9", bass];
    }
    return ["6/9", ""];
  }
  const i = tail.indexOf("/");
  if (i < 0) return [tail, ""];
  const bass = normalizeRoot(tail.slice(i + 1)) ?? "";
  return [tail.slice(0, i), bass];
}

function detectType(core: string): TypeKey {
  const c = core.toLowerCase();
  if (c.startsWith("sus")) return "sus";
  if (/^5(?!\d)/.test(c)) return "5";
  if (c.startsWith("maj")) return "maj";
  if (c.startsWith("m") && !c.startsWith("maj")) return "m";
  if (c.startsWith("dim") || c.startsWith("°")) return "dim";
  if (c.startsWith("aug") || c.startsWith("+")) return "aug";
  return "maj";
}

function detectVariant(core: string, type: TypeKey): string {
  const lc = core.toLowerCase();
  if (type === "maj") {
    if (lc === "") return "";
    if (lc.startsWith("maj13")) return "13";
    if (lc.startsWith("maj11")) return "11";
    if (lc.startsWith("maj9"))  return "9";
    if (lc.startsWith("maj7"))  return "7";
    if (lc.startsWith("6/9"))   return "6/9";
    if (lc.startsWith("add11")) return "add11";
    if (lc.startsWith("add9"))  return "add9";
    if (/^7(alt|#5|b9|#9)?/.test(lc)) return "7";
    if (lc.startsWith("13"))    return "13";
    if (lc.startsWith("11"))    return "11";
    if (lc.startsWith("9"))     return "9";
    if (lc.startsWith("6"))     return "6";
    return "";
  }
  if (type === "m") {
    const rest = lc.slice(1);
    if (rest.startsWith("maj7")) return "Maj7";
    if (rest.startsWith("13"))   return "13";
    if (rest.startsWith("11"))   return "11";
    if (rest.startsWith("9"))    return "9";
    if (rest.startsWith("7b5"))  return ""; // m7b5 detected at type=dim/m? we surface under dim
    if (rest.startsWith("7"))    return "7";
    if (rest.startsWith("6"))    return "6";
    return "";
  }
  if (type === "dim") {
    const rest = lc.replace(/^dim|^°/, "");
    if (rest.startsWith("7")) return "7";
    return "";
  }
  if (type === "aug") {
    const rest = lc.replace(/^aug|^\+/, "");
    if (rest.startsWith("7")) return "7";
    return "";
  }
  if (type === "sus") {
    return lc.includes("2") ? "2" : "4";
  }
  return "";
}

function detectAltered(core: string): "" | "alt" | "#5" | "b9" | "#9" {
  const m = core.match(/^7(alt|#5|b9|#9)/);
  return (m?.[1] as any) ?? "";
}

interface HelpersProps { query: string; onChange: (q: string) => void; }

function ChordTypeHelpers({ query, onChange }: HelpersProps) {
  const root = rootOf(query);
  const rl = rootLen(query);
  const tail = query.trim().slice(rl);
  const [core, bass] = splitSlash(tail);
  const typeVal = detectType(core);
  const variantVal = detectVariant(core, typeVal);
  const alteredVal = typeVal === "maj" && variantVal === "7" ? detectAltered(core) : "";

  const variants = VARIANTS_BY_TYPE[typeVal];

  const compose = (
    t: TypeKey,
    v: string,
    alt: "" | "alt" | "#5" | "b9" | "#9",
    b: string,
  ): string => {
    let suffix = "";
    if (t === "maj") {
      if (v === "")      suffix = "";
      else if (v === "6" || v === "6/9" || v === "add9" || v === "add11") suffix = v;
      else if (v === "7") suffix = "7" + alt;
      else                suffix = "maj" + v;
    } else if (t === "m") {
      if (v === "")          suffix = "m";
      else if (v === "Maj7") suffix = "mMaj7";
      else                   suffix = "m" + v;
    } else if (t === "dim") {
      if (v === "")          suffix = "dim";
      else if (v === "m7b5") suffix = "m7b5";
      else                   suffix = "dim" + v;
    } else if (t === "aug") {
      suffix = v === "7" ? "aug7" : "aug";
    } else if (t === "sus") {
      suffix = "sus" + (v || "4");
    } else if (t === "5") {
      suffix = "5";
    }
    const slash = b ? `/${b}` : "";
    return `${root}${suffix}${slash}`;
  };

  const slashOptions = ALL_ROOTS.filter((r) => r !== root);

  const handleType = (next: TypeKey) => {
    const firstVariant = VARIANTS_BY_TYPE[next][0]?.value ?? "";
    onChange(compose(next, firstVariant, "", bass));
  };

  return (
    <>
      <Select value={typeVal} onValueChange={(v) => handleType(v as TypeKey)}>
        <SelectTrigger
          className="h-10 w-[68px] px-2 text-xs font-mono-chord border-0"
          style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 8 }}
          aria-label="Chord type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs font-mono-chord">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={variantVal || "__base"}
        onValueChange={(v) => onChange(compose(typeVal, v === "__base" ? "" : v, "", bass))}
      >
        <SelectTrigger
          className="h-10 w-[78px] px-2 text-xs font-mono-chord border-0"
          style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 8 }}
          aria-label="Chord variant"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variants.map((o) => (
            <SelectItem
              key={o.value || "__base"}
              value={o.value || "__base"}
              className="text-xs font-mono-chord"
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={bass || "__none"} onValueChange={(v) => onChange(compose(typeVal, variantVal, alteredVal, v === "__none" ? "" : v))}>
        <SelectTrigger
          className="h-10 w-[72px] px-2 text-xs font-mono-chord border-0"
          style={{ background: "var(--paper-card)", boxShadow: "var(--shadow-sculpt-cream-rest)", borderRadius: 8 }}
          aria-label="Slash bass"
        >
          <SelectValue placeholder="/—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none" className="text-xs font-mono-chord">/—</SelectItem>
          {slashOptions.map((r) => (
            <SelectItem key={r} value={r} className="text-xs font-mono-chord">/{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {typeVal === "maj" && variantVal === "7" && (
        <div className="flex items-center gap-1 ml-1" role="group" aria-label="Altered dominant">
          {ALTERED_CHIPS.map((c) => {
            const isActive = alteredVal === c.value;
            const isAltered = c.value !== "";
            const activeGrad = isAltered
              ? "linear-gradient(to right in oklch, oklch(0.9088 0.0353 150.52), oklch(0.8693 0.0443 18.04))"
              : "linear-gradient(to right in oklch, oklch(0.9013 0.0465 54.45), oklch(0.8744 0.0387 264.35))";
            return (
              <button
                key={c.value || "plain"}
                type="button"
                onClick={() => onChange(compose("maj", "7", c.value, bass))}
                style={{
                  background: isActive ? activeGrad : "var(--paper-shade)",
                  color: "oklch(0.25 0.02 260)",
                  border: isActive ? "2px solid oklch(0.75 0.05 80)" : "2px solid transparent",
                  borderRadius: 6,
                  padding: "0 8px",
                  height: 28,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "border-color 120ms ease, background 120ms ease",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
