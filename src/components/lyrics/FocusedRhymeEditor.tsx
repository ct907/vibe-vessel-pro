import { useEffect, useRef, useState } from "react";
import { RotateCcw, RefreshCw, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface FocusedRhymeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  activeLineIndex: number;
  lines: string[];
  onReplaceLine: (lineIndex: number, newLineText: string) => void;
}

interface RhymeWord {
  word: string;
  score: number;
  numSyllables?: number;
}

function parseLastWord(line: string): { prefix: string; word: string; trailingPunct: string } | null {
  const m = line.match(/^([\s\S]*?)(\w+)([^\w]*)$/);
  if (!m) return null;
  return { prefix: m[1], word: m[2], trailingPunct: m[3] };
}

function replaceLastWord(line: string, newWord: string): string {
  const parsed = parseLastWord(line);
  if (!parsed) return line.trim() ? `${line} ${newWord}` : newWord;
  return parsed.prefix + newWord + parsed.trailingPunct;
}

function getLastWord(line: string): string | null {
  return parseLastWord(line)?.word ?? null;
}

// =============================================================================
// Search state hook
// =============================================================================

function useRhymeSearch(isOpen: boolean) {
  const [query, setQuery] = useState("");
  const [perfectRhymes, setPerfectRhymes] = useState<RhymeWord[]>([]);
  const [nearRhymes, setNearRhymes] = useState<RhymeWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastReplacement, setLastReplacement] = useState<{ lineIndex: number; oldText: string } | null>(null);
  const [showReplaced, setShowReplaced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replacedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setPerfectRhymes([]);
      setNearRhymes([]);
      setError(false);
      setLastReplacement(null);
      setShowReplaced(false);
    }
  }, [isOpen]);

  const fetchRhymes = async (word: string) => {
    if (!word.trim()) { setPerfectRhymes([]); setNearRhymes([]); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;
    setLoading(true);
    setError(false);
    try {
      const enc = encodeURIComponent(word.trim());
      const [perfect, near] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${enc}&md=s&max=50`, { signal }).then((r) => r.json()),
        fetch(`https://api.datamuse.com/words?rel_nry=${enc}&md=s&max=30`, { signal }).then((r) => r.json()),
      ]);
      const filter = (arr: RhymeWord[]) =>
        (arr as RhymeWord[]).filter((w) => !w.word.includes(" ")).sort((a, b) => b.score - a.score);
      setPerfectRhymes(filter(perfect));
      setNearRhymes(filter(near));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(true);
    } finally {
      setLoading(false);
    }
  };

  const triggerSearch = (word: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(word);
    void fetchRhymes(word);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setPerfectRhymes([]); setNearRhymes([]); return; }
    debounceRef.current = setTimeout(() => void fetchRhymes(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSelect = (
    word: string,
    lines: string[],
    activeLineIndex: number,
    onReplaceLine: FocusedRhymeEditorProps["onReplaceLine"],
  ) => {
    const activeLine = lines[activeLineIndex] ?? "";
    setLastReplacement({ lineIndex: activeLineIndex, oldText: activeLine });
    onReplaceLine(activeLineIndex, replaceLastWord(activeLine, word));
    setShowReplaced(true);
    if (replacedTimerRef.current) clearTimeout(replacedTimerRef.current);
    replacedTimerRef.current = setTimeout(() => setShowReplaced(false), 1500);
  };

  const handleUndo = (onReplaceLine: FocusedRhymeEditorProps["onReplaceLine"]) => {
    if (!lastReplacement) return;
    onReplaceLine(lastReplacement.lineIndex, lastReplacement.oldText);
    setLastReplacement(null);
    setShowReplaced(false);
  };

  return {
    query, setQuery, triggerSearch, fetchRhymes,
    perfectRhymes, nearRhymes, loading, error,
    lastReplacement, showReplaced,
    handleSelect, handleUndo,
  };
}

// =============================================================================
// Shared 4-row inner layout
// =============================================================================

interface ContentProps extends FocusedRhymeEditorProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (q: string) => void;
  triggerSearch: (w: string) => void;
  fetchRhymes: (w: string) => void;
  perfectRhymes: RhymeWord[];
  nearRhymes: RhymeWord[];
  loading: boolean;
  error: boolean;
  lastReplacement: { lineIndex: number; oldText: string } | null;
  showReplaced: boolean;
  handleSelect: (w: string, lines: string[], idx: number, cb: FocusedRhymeEditorProps["onReplaceLine"]) => void;
  handleUndo: (cb: FocusedRhymeEditorProps["onReplaceLine"]) => void;
  resultsMaxHeight?: number;
}

function RhymeEditorContent({
  onClose, activeLineIndex, lines, onReplaceLine,
  inputRef, query, setQuery, triggerSearch, fetchRhymes,
  perfectRhymes, nearRhymes, loading, error,
  lastReplacement, showReplaced, handleSelect, handleUndo,
  resultsMaxHeight,
}: ContentProps) {
  const hasResults = perfectRhymes.length > 0 || nearRhymes.length > 0;

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: "var(--font-ui,'Nunito',sans-serif)",
    fontWeight: 600,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--paper-card)",
  };

  return (
    <>
      {/* Row 1 — Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ background: "var(--paper-shade)" }}
      >
        <h2
          style={{ fontFamily: "var(--font-display,'Zain',serif)", fontWeight: 600, fontSize: 20, color: "var(--ink)", lineHeight: 1.1 }}
        >
          Find a Rhyme
        </h2>
        {(showReplaced || lastReplacement) && (
          <div className="flex items-center gap-2 mx-3">
            {showReplaced && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <Check className="h-3.5 w-3.5" /> Replaced!
              </span>
            )}
            {lastReplacement && (
              <button
                onClick={() => handleUndo(onReplaceLine)}
                className="flex items-center gap-1 text-xs underline underline-offset-2"
                style={{ color: "var(--ink-soft)" }}
              >
                <RotateCcw className="h-3 w-3" /> Undo
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-semibold shrink-0"
        >
          Done
        </button>
      </div>

      {/* Row 2 — Line word chips (horizontal scroll) */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 overflow-x-auto"
        style={{ background: "var(--paper-shade)", borderBottom: "1px solid color-mix(in oklch, var(--cocoa-deep) 12%, transparent)" }}
      >
        {lines.map((line, idx) => {
          const lastWord = getLastWord(line);
          if (!lastWord) return null;
          const isActive = idx === activeLineIndex;
          return (
            <button
              key={idx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => triggerSearch(lastWord)}
              className={isActive ? "btn-sculpt-cocoa inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shrink-0" : "btn-sculpt-cream inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shrink-0"}
            >
              L{idx + 1}: {lastWord}
            </button>
          );
        })}
        {lines.every((l) => !getLastWord(l)) && (
          <span className="text-xs" style={{ color: "var(--ink-soft)", opacity: 0.7 }}>No words in stanza yet</span>
        )}
      </div>

      {/* Row 3 — Search input */}
      <div
        className="px-3 py-2 shrink-0"
        style={{ background: "var(--paper-shade)", borderBottom: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a word to search for rhymes…"
          style={{
            width: "100%",
            background: "var(--paper-card)",
            boxShadow: "var(--shadow-sculpt-cream-rest)",
            border: 0,
            borderRadius: 8,
            padding: "10px 14px",
            fontFamily: "var(--font-display,'Zain',serif)",
            fontWeight: 500,
            fontSize: 15,
            color: "var(--ink)",
            outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sculpt-cream-press)"; }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sculpt-cream-rest)"; }}
        />
      </div>

      {/* Row 4 — Rhyme word chips grid */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3"
        style={{ background: "var(--ink-soft)", ...(resultsMaxHeight ? { maxHeight: resultsMaxHeight } : {}) }}
      >
        {loading && (
          <div className="flex items-center justify-center py-10" style={{ color: "var(--ink-soft)" }}>
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-2 py-8 text-sm" style={{ color: "var(--ink-soft)" }}>
            <span>Network error.</span>
            <button onClick={() => void fetchRhymes(query)} className="btn-sculpt-cream px-3 py-1 rounded text-xs">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && query.trim() && !hasResults && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>No rhymes found.</p>
        )}

        {!loading && !error && !query.trim() && (
          <p className="text-sm" style={{ color: "var(--ink-soft)", opacity: 0.7 }}>
            Tap a line chip or type a word above.
          </p>
        )}

        {!loading && !error && perfectRhymes.length > 0 && (
          <div className="mb-5">
            <p className="mb-2" style={sectionLabelStyle}>Perfect Rhymes</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
              {perfectRhymes.map((r) => (
                <button
                  key={r.word}
                  onClick={() => handleSelect(r.word, lines, activeLineIndex, onReplaceLine)}
                  className="bg-accent text-accent-foreground flex flex-col items-center justify-center rounded-md px-2 py-2 text-sm font-medium transition-opacity hover:opacity-80 border-none"
                >
                  <span style={{ fontFamily: "var(--font-display,'Zain',serif)", fontSize: 15, lineHeight: 1.2 }}>{r.word}</span>
                  {r.numSyllables != null && (
                    <span className="text-[10px] opacity-70 mt-0.5">{r.numSyllables} syl</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && nearRhymes.length > 0 && (
          <div>
            <p className="mb-2" style={sectionLabelStyle}>Near Rhymes</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
              {nearRhymes.map((r) => (
                <button
                  key={r.word}
                  onClick={() => handleSelect(r.word, lines, activeLineIndex, onReplaceLine)}
                  className="bg-muted text-muted-foreground flex flex-col items-center justify-center rounded-md px-2 py-2 text-sm font-medium transition-opacity hover:opacity-80 border-none"
                >
                  <span style={{ fontFamily: "var(--font-display,'Zain',serif)", fontSize: 15, lineHeight: 1.2 }}>{r.word}</span>
                  {r.numSyllables != null && (
                    <span className="text-[10px] opacity-70 mt-0.5">{r.numSyllables} syl</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// Mobile: full-screen overlay (FocusedChordEditor style)
// =============================================================================

function MobileRhymeEditor(props: FocusedRhymeEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useRhymeSearch(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setTimeout(() => inputRef.current?.focus(), 60);
  }, [props.isOpen]);

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close rhyme editor"
        onClick={props.onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className="relative m-4 flex flex-1 flex-col rounded-lg overflow-hidden"
        style={{ background: "var(--ink-soft)", boxShadow: "var(--shadow-paper)" }}
      >
        <RhymeEditorContent {...props} {...search} inputRef={inputRef} />
      </div>
    </div>
  );
}

// =============================================================================
// Desktop: bottom sheet (ChordPickerSheet style)
// =============================================================================

function DesktopRhymeEditor(props: FocusedRhymeEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800);
  const search = useRhymeSearch(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen || typeof window === "undefined") return;
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
    if (vv) { vv.addEventListener("resize", update); vv.addEventListener("scroll", update); }
    window.addEventListener("resize", update);
    return () => {
      if (vv) { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); }
      window.removeEventListener("resize", update);
      setKeyboardOffset(0);
    };
  }, [props.isOpen]);

  const TOP_RESERVED = 140;
  // header(~48) + chips(~44) + input(~52) + padding = ~180 chrome
  const SHEET_CHROME = 180;
  const sheetMaxHeight = Math.max(300, Math.min(vvHeight * 0.55, vvHeight - TOP_RESERVED));
  const resultsMaxHeight = Math.max(80, sheetMaxHeight - SHEET_CHROME);

  return (
    <Sheet open={props.isOpen} onOpenChange={(o) => { if (!o) props.onClose(); }} modal={false}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl transition-[bottom] duration-150 overflow-hidden flex flex-col p-0 [&>button[data-radix-dialog-close]]:hidden"
        style={{ bottom: `${keyboardOffset}px`, maxHeight: `${sheetMaxHeight}px`, background: "var(--ink-soft)" }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && t.closest("[data-lyric-input]")) props.onClose();
          else if (t && (t.closest("[data-chord-row]") || t.closest("[data-section-id]"))) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && (t.closest("[data-chord-row]") || t.closest("[data-section-id]"))) e.preventDefault();
        }}
      >
        <RhymeEditorContent {...props} {...search} inputRef={inputRef} resultsMaxHeight={resultsMaxHeight} />
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// Public export
// =============================================================================

export function FocusedRhymeEditor(props: FocusedRhymeEditorProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileRhymeEditor {...props} /> : <DesktopRhymeEditor {...props} />;
}
