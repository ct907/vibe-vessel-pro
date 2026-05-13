import { useEffect, useRef, useState } from "react";
import { X, RotateCcw, RefreshCw, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

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

function RhymeEditorContent({
  isOpen,
  onClose,
  activeLineIndex,
  lines,
  onReplaceLine,
  autoFocus,
}: FocusedRhymeEditorProps & { autoFocus: boolean }) {
  const [query, setQuery] = useState("");
  const [perfectRhymes, setPerfectRhymes] = useState<RhymeWord[]>([]);
  const [nearRhymes, setNearRhymes] = useState<RhymeWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [lastReplacement, setLastReplacement] = useState<{ lineIndex: number; oldText: string } | null>(null);
  const [showReplaced, setShowReplaced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (autoFocus && isOpen && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, autoFocus]);

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
        (arr as RhymeWord[])
          .filter((w) => !w.word.includes(" "))
          .sort((a, b) => b.score - a.score);
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
    fetchRhymes(word);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setPerfectRhymes([]);
      setNearRhymes([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchRhymes(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSelect = (word: string) => {
    const activeLine = lines[activeLineIndex] ?? "";
    const newText = replaceLastWord(activeLine, word);
    setLastReplacement({ lineIndex: activeLineIndex, oldText: activeLine });
    onReplaceLine(activeLineIndex, newText);
    setShowReplaced(true);
    if (replacedTimerRef.current) clearTimeout(replacedTimerRef.current);
    replacedTimerRef.current = setTimeout(() => setShowReplaced(false), 1500);
  };

  const handleUndo = () => {
    if (!lastReplacement) return;
    onReplaceLine(lastReplacement.lineIndex, lastReplacement.oldText);
    setLastReplacement(null);
    setShowReplaced(false);
  };

  const hasResults = perfectRhymes.length > 0 || nearRhymes.length > 0;

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-1">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a word to find rhymes…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-card)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-soft)] outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setPerfectRhymes([]); setNearRhymes([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Line chips */}
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lines.map((line, idx) => {
            const lastWord = getLastWord(line);
            if (!lastWord) return null;
            const isActive = idx === activeLineIndex;
            return (
              <button
                key={idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => triggerSearch(lastWord)}
                className={
                  isActive
                    ? "btn-sculpt-amber inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    : "btn-sculpt-cream inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                }
              >
                L{idx + 1}: {lastWord}
              </button>
            );
          })}
        </div>
      )}

      {/* Status bar */}
      {(showReplaced || lastReplacement) && (
        <div className="flex items-center gap-2 text-xs">
          {showReplaced && (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-3.5 w-3.5" /> Replaced!
            </span>
          )}
          {lastReplacement && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-[var(--ink-soft)] hover:text-[var(--ink)] underline underline-offset-2"
            >
              <RotateCcw className="h-3 w-3" /> Undo
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex flex-col gap-4 overflow-y-auto max-h-[50vh]">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--ink-soft)]">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-[var(--ink-soft)]">
            <span>Network error.</span>
            <button
              onClick={() => fetchRhymes(query)}
              className="btn-sculpt-cream px-3 py-1 rounded text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && query.trim() && !hasResults && (
          <p className="py-6 text-center text-sm text-[var(--ink-soft)]">No rhymes found.</p>
        )}

        {!loading && !error && perfectRhymes.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              Perfect Rhymes
            </p>
            {perfectRhymes.map((r) => (
              <RhymeRow key={r.word} rhyme={r} onSelect={handleSelect} />
            ))}
          </div>
        )}

        {!loading && !error && nearRhymes.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
              Near Rhymes
            </p>
            {nearRhymes.map((r) => (
              <RhymeRow key={r.word} rhyme={r} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RhymeRow({ rhyme, onSelect }: { rhyme: RhymeWord; onSelect: (w: string) => void }) {
  return (
    <button
      onClick={() => onSelect(rhyme.word)}
      className="flex items-center justify-between w-full rounded-md px-3 py-2 text-sm text-left text-[var(--ink)] hover:bg-[var(--paper-shade)] transition-colors"
    >
      <span className="font-display">{rhyme.word}</span>
      {rhyme.numSyllables != null && (
        <span className="text-xs text-[var(--ink-soft)] tabular-nums">
          {rhyme.numSyllables} syl
        </span>
      )}
    </button>
  );
}

export function FocusedRhymeEditor(props: FocusedRhymeEditorProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={props.isOpen} onOpenChange={(o) => { if (!o) props.onClose(); }}>
        <DrawerContent className="bg-[var(--paper)] border-[var(--border)]">
          <DrawerHeader className="pb-0">
            <DrawerTitle className="text-base font-semibold text-[var(--ink)]">
              Find a Rhyme
            </DrawerTitle>
          </DrawerHeader>
          <RhymeEditorContent {...props} autoFocus={false} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={props.isOpen} onOpenChange={(o) => { if (!o) props.onClose(); }}>
      <DialogContent className="sm:max-w-[480px] bg-[var(--paper)] border-[var(--border)] p-0">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="text-base font-semibold text-[var(--ink)]">
            Find a Rhyme
          </DialogTitle>
        </DialogHeader>
        <RhymeEditorContent {...props} autoFocus={true} />
      </DialogContent>
    </Dialog>
  );
}
