import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, RefreshCw, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
// Shared inner content (results list + status)
// =============================================================================

interface ResultsProps {
  loading: boolean;
  error: boolean;
  query: string;
  perfectRhymes: RhymeWord[];
  nearRhymes: RhymeWord[];
  lastReplacement: { lineIndex: number; oldText: string } | null;
  showReplaced: boolean;
  onRetry: () => void;
  onSelect: (word: string) => void;
  onUndo: () => void;
}

function RhymeResults({
  loading, error, query, perfectRhymes, nearRhymes,
  lastReplacement, showReplaced, onRetry, onSelect, onUndo,
}: ResultsProps) {
  const hasResults = perfectRhymes.length > 0 || nearRhymes.length > 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3" style={{ background: "var(--ink-soft)" }}>
      {(showReplaced || lastReplacement) && (
        <div className="flex items-center gap-3 mb-3">
          {showReplaced && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <Check className="h-3.5 w-3.5" /> Replaced!
            </span>
          )}
          {lastReplacement && (
            <button
              onClick={onUndo}
              className="flex items-center gap-1 text-xs text-[var(--ink-soft)] hover:text-[var(--ink)] underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" /> Undo
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 text-[var(--ink-soft)]">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-[var(--ink-soft)]">
          <span>Network error.</span>
          <button
            onClick={onRetry}
            className="btn-sculpt-cream px-3 py-1 rounded text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && query.trim() && !hasResults && (
        <p className="py-8 text-center text-sm text-[var(--ink-soft)]">No rhymes found.</p>
      )}

      {!loading && !error && !query.trim() && (
        <p className="text-sm" style={{ color: "var(--ink-soft)", opacity: 0.8 }}>
          Tap a line chip or type a word to find rhymes.
        </p>
      )}

      {!loading && !error && perfectRhymes.length > 0 && (
        <div className="flex flex-col gap-1 mb-4">
          <p
            className="mb-1"
            style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
          >
            Perfect Rhymes
          </p>
          {perfectRhymes.map((r) => (
            <RhymeRow key={r.word} rhyme={r} onSelect={onSelect} />
          ))}
        </div>
      )}

      {!loading && !error && nearRhymes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p
            className="mb-1"
            style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
          >
            Near Rhymes
          </p>
          {nearRhymes.map((r) => (
            <RhymeRow key={r.word} rhyme={r} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function RhymeRow({ rhyme, onSelect }: { rhyme: RhymeWord; onSelect: (w: string) => void }) {
  return (
    <button
      onClick={() => onSelect(rhyme.word)}
      className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm text-left transition-colors"
      style={{ color: "var(--ink)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in oklch, var(--paper-shade) 60%, transparent)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      <span style={{ fontFamily: "var(--font-display,'Zain',serif)", fontSize: 17 }}>{rhyme.word}</span>
      {rhyme.numSyllables != null && (
        <span style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontSize: 11, color: "var(--ink-soft)" }}>
          {rhyme.numSyllables} syl
        </span>
      )}
    </button>
  );
}

// =============================================================================
// Hook: shared search state
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
    if (!word.trim()) {
      setPerfectRhymes([]);
      setNearRhymes([]);
      return;
    }
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

  const handleSelect = (word: string, lines: string[], activeLineIndex: number, onReplaceLine: FocusedRhymeEditorProps["onReplaceLine"]) => {
    const activeLine = lines[activeLineIndex] ?? "";
    const newText = replaceLastWord(activeLine, word);
    setLastReplacement({ lineIndex: activeLineIndex, oldText: activeLine });
    onReplaceLine(activeLineIndex, newText);
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
// Input + chips row (shared)
// =============================================================================

interface InputRowProps {
  query: string;
  onQueryChange: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  lines: string[];
  activeLineIndex: number;
  onChipTap: (word: string) => void;
}

function InputAndChips({ query, onQueryChange, inputRef, lines, activeLineIndex, onChipTap }: InputRowProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Type a word…"
        style={{
          flexShrink: 0,
          width: 140,
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
      {lines.map((line, idx) => {
        const lastWord = getLastWord(line);
        if (!lastWord) return null;
        const isActive = idx === activeLineIndex;
        return (
          <button
            key={idx}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChipTap(lastWord)}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shrink-0",
              isActive ? "btn-sculpt-amber" : "btn-sculpt-cream",
            )}
          >
            L{idx + 1}: {lastWord}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Mobile: full-screen overlay (FocusedChordEditor style)
// =============================================================================

function MobileRhymeEditor({ isOpen, onClose, activeLineIndex, lines, onReplaceLine }: FocusedRhymeEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    query, setQuery, triggerSearch, fetchRhymes,
    perfectRhymes, nearRhymes, loading, error,
    lastReplacement, showReplaced,
    handleSelect, handleUndo,
  } = useRhymeSearch(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close rhyme editor"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className="relative m-4 flex flex-1 flex-col rounded-lg overflow-hidden"
        style={{ background: "var(--ink-soft)", boxShadow: "var(--shadow-paper)" }}
      >
        {/* HEADER */}
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ background: "var(--paper-shade)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-8 w-8 shrink-0"
            aria-label="Close rhyme editor"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2
              className="truncate"
              style={{ fontFamily: "var(--font-display,'Zain',serif)", fontWeight: 600, fontSize: 20, color: "var(--ink)", lineHeight: 1.1 }}
            >
              Find a Rhyme
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-sculpt-amber inline-flex items-center justify-center rounded-lg h-8 px-3 text-sm font-semibold shrink-0"
          >
            Done
          </button>
        </div>

        {/* INPUT + CHIPS */}
        <div
          className="px-3 py-3 shrink-0"
          style={{ background: "var(--paper-shade)", borderBottom: "1px solid color-mix(in oklch, var(--cocoa-deep) 15%, transparent)" }}
        >
          <InputAndChips
            query={query}
            onQueryChange={setQuery}
            inputRef={inputRef}
            lines={lines}
            activeLineIndex={activeLineIndex}
            onChipTap={triggerSearch}
          />
        </div>

        {/* RESULTS */}
        <RhymeResults
          loading={loading}
          error={error}
          query={query}
          perfectRhymes={perfectRhymes}
          nearRhymes={nearRhymes}
          lastReplacement={lastReplacement}
          showReplaced={showReplaced}
          onRetry={() => void fetchRhymes(query)}
          onSelect={(w) => handleSelect(w, lines, activeLineIndex, onReplaceLine)}
          onUndo={() => handleUndo(onReplaceLine)}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Desktop: bottom sheet (ChordPickerSheet style)
// =============================================================================

function DesktopRhymeEditor({ isOpen, onClose, activeLineIndex, lines, onReplaceLine }: FocusedRhymeEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800);

  const {
    query, setQuery, triggerSearch, fetchRhymes,
    perfectRhymes, nearRhymes, loading, error,
    lastReplacement, showReplaced,
    handleSelect, handleUndo,
  } = useRhymeSearch(isOpen);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
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
  }, [isOpen]);

  const TOP_RESERVED = 140;
  const SHEET_CHROME = 200;
  const sheetMaxHeight = Math.max(220, Math.min(vvHeight * 0.45, vvHeight - TOP_RESERVED));
  const gridMaxHeight = Math.max(80, sheetMaxHeight - SHEET_CHROME);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }} modal={false}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl transition-[bottom] duration-150 overflow-hidden flex flex-col pt-10 [&>button[type=button]]:top-2 [&>button[type=button]]:right-3"
        style={{ bottom: `${keyboardOffset}px`, maxHeight: `${sheetMaxHeight}px`, background: "var(--ink-soft)" }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 30);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && t.closest("[data-lyric-input]")) onClose();
          else if (t && (t.closest("[data-chord-row]") || t.closest("[data-section-id]"))) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && (t.closest("[data-chord-row]") || t.closest("[data-section-id]"))) e.preventDefault();
        }}
      >
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {/* INPUT + CHIPS */}
          <InputAndChips
            query={query}
            onQueryChange={setQuery}
            inputRef={inputRef}
            lines={lines}
            activeLineIndex={activeLineIndex}
            onChipTap={triggerSearch}
          />

          {/* STATUS */}
          {(showReplaced || lastReplacement) && (
            <div className="flex items-center gap-3">
              {showReplaced && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <Check className="h-3.5 w-3.5" /> Replaced!
                </span>
              )}
              {lastReplacement && (
                <button
                  onClick={() => handleUndo(onReplaceLine)}
                  className="flex items-center gap-1 text-xs text-[var(--ink-soft)] hover:text-[var(--ink)] underline underline-offset-2"
                >
                  <RotateCcw className="h-3 w-3" /> Undo
                </button>
              )}
            </div>
          )}

          {/* RESULTS */}
          <div className="overflow-y-auto -mx-1 px-1 flex-1 min-h-0" style={{ maxHeight: `${gridMaxHeight}px` }}>
            {loading && (
              <div className="flex items-center justify-center py-8 text-[var(--ink-soft)]">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Loading…</span>
              </div>
            )}
            {error && !loading && (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--ink-soft)]">
                <span>Network error.</span>
                <button onClick={() => void fetchRhymes(query)} className="btn-sculpt-cream px-3 py-1 rounded text-xs">Retry</button>
              </div>
            )}
            {!loading && !error && query.trim() && perfectRhymes.length === 0 && nearRhymes.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--ink-soft)]">No rhymes found.</p>
            )}
            {!loading && !error && !query.trim() && (
              <p className="text-sm" style={{ color: "var(--ink-soft)", opacity: 0.8 }}>
                Tap a line chip or type a word to find rhymes.
              </p>
            )}
            {!loading && !error && perfectRhymes.length > 0 && (
              <div className="mb-4">
                <p
                  className="mb-1"
                  style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
                >
                  Perfect Rhymes
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {perfectRhymes.map((r) => <DesktopRhymeRow key={r.word} rhyme={r} onSelect={(w) => handleSelect(w, lines, activeLineIndex, onReplaceLine)} />)}
                </div>
              </div>
            )}
            {!loading && !error && nearRhymes.length > 0 && (
              <div>
                <p
                  className="mb-1"
                  style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-soft)" }}
                >
                  Near Rhymes
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {nearRhymes.map((r) => <DesktopRhymeRow key={r.word} rhyme={r} onSelect={(w) => handleSelect(w, lines, activeLineIndex, onReplaceLine)} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DesktopRhymeRow({ rhyme, onSelect }: { rhyme: RhymeWord; onSelect: (w: string) => void }) {
  return (
    <button
      onClick={() => onSelect(rhyme.word)}
      className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-left transition-colors border-none"
      style={{ color: "var(--ink)", background: "color-mix(in oklch, var(--paper-card) 40%, transparent)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in oklch, var(--paper-shade) 70%, transparent)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in oklch, var(--paper-card) 40%, transparent)"; }}
    >
      <span style={{ fontFamily: "var(--font-display,'Zain',serif)", fontSize: 16 }}>{rhyme.word}</span>
      {rhyme.numSyllables != null && (
        <span style={{ fontFamily: "var(--font-ui,'Nunito',sans-serif)", fontSize: 10, color: "var(--ink-soft)" }}>
          {rhyme.numSyllables} syl
        </span>
      )}
    </button>
  );
}

// =============================================================================
// Public export
// =============================================================================

export function FocusedRhymeEditor(props: FocusedRhymeEditorProps) {
  const isMobile = useIsMobile();
  return isMobile
    ? <MobileRhymeEditor {...props} />
    : <DesktopRhymeEditor {...props} />;
}
