import { useEffect, useRef, useState } from "react";
import { useSongStore, type LyricLine } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { parseChord, ChordSymbol } from "@/lib/music/chords";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

/**
 * Measure character X-offset within a textarea-like text.
 * We render a hidden span with the same font and slice text up to `offset`.
 */
function measureOffsetX(measureEl: HTMLSpanElement, text: string, offset: number): number {
  measureEl.textContent = text.slice(0, offset) || "\u200B";
  return measureEl.getBoundingClientRect().width;
}

interface LineRowProps {
  line: LyricLine;
  onAddLineAfter: () => void;
  onRemoveLine: () => void;
  onPickerOpen: (lineId: string, offset: number, anchorId?: string) => void;
  basketDrop?: { chord: ChordSymbol } | null;
  onBasketConsumed?: () => void;
}

function LineRow({ line, onAddLineAfter, onRemoveLine, onPickerOpen }: LineRowProps) {
  const { setLineText, upsertChordAt, removeChordAnchor } = useSongStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  // Re-measure on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => force((x) => x + 1));
    if (rowRef.current) ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, []);

  const handleChordRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!measureRef.current || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Binary search for the character offset closest to x
    const text = line.text || " ";
    let lo = 0, hi = text.length, best = 0, bestDiff = Infinity;
    for (let i = 0; i <= hi; i++) {
      const w = measureOffsetX(measureRef.current, text, i);
      const d = Math.abs(w - x);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    onPickerOpen(line.id, best);
  };

  // Inline [Chord] parsing — converts "[Fmaj7]" into an anchor at that location
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    const re = /\[([^\]]+)\]/;
    let match: RegExpExecArray | null;
    let chordsAdded = false;
    while ((match = re.exec(value))) {
      const parsed = parseChord(match[1]);
      const start = match.index;
      if (parsed) {
        upsertChordAt(line.id, start, parsed);
        chordsAdded = true;
      }
      value = value.slice(0, start) + value.slice(start + match[0].length);
    }
    setLineText(line.id, value);
    if (chordsAdded) {
      // Restore caret roughly to where it was minus removed brackets
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const pos = Math.min(value.length, inputRef.current.selectionStart ?? value.length);
          inputRef.current.setSelectionRange(pos, pos);
        }
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddLineAfter();
    } else if (e.key === "Backspace" && line.text === "") {
      e.preventDefault();
      onRemoveLine();
    }
  };

  return (
    <div ref={rowRef} className="relative group py-1">
      {/* Chord row — clickable strip above the text */}
      <div
        className="relative h-6 cursor-text"
        onClick={handleChordRowClick}
        title="Click to add a chord above this position"
      >
        {line.chords.map((a) => {
          const x = measureRef.current ? measureOffsetX(measureRef.current, line.text, a.offset) : 0;
          return (
            <div
              key={a.id}
              className="absolute -translate-x-1/2"
              style={{ left: `${x}px`, top: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ChordChip
                chord={a.chord}
                variant="ink"
                size="sm"
                onLongPress={() => onPickerOpen(line.id, a.offset, a.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Lyric input */}
      <div className="relative">
        <input
          ref={inputRef}
          value={line.text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write your lyric line… (use [Fmaj7] to drop a chord inline)"
          className="w-full bg-transparent border-0 outline-none font-display text-lg leading-9 text-foreground placeholder:text-muted-foreground/60 px-0"
        />
        {/* Hidden measurer — must use the same font properties as the input */}
        <span
          ref={measureRef}
          aria-hidden
          className="invisible absolute left-0 top-0 whitespace-pre font-display text-lg leading-9"
        />
        <button
          onClick={onRemoveLine}
          className="absolute right-0 top-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          aria-label="Delete line"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Anchor management hint */}
      {line.chords.length > 0 && (
        <button
          onClick={() => line.chords.forEach((c) => removeChordAnchor(line.id, c.id))}
          className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Clear chords on line
        </button>
      )}
    </div>
  );
}

export function LyricsTab() {
  const { lyrics, addLine, removeLine, upsertChordAt, removeChordAnchor, basket, addToBasket, clearBasket } = useSongStore();
  const [picker, setPicker] = useState<{ lineId: string; offset: number; anchorId?: string } | null>(null);

  const openPicker = (lineId: string, offset: number, anchorId?: string) =>
    setPicker({ lineId, offset, anchorId });

  const initialChord = picker
    ? lyrics.find((l) => l.id === picker.lineId)?.chords.find((c) => c.id === picker.anchorId)?.chord
    : undefined;

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    upsertChordAt(picker.lineId, picker.offset, chord, picker.anchorId);
  };
  const handleRemove = () => {
    if (!picker?.anchorId) return;
    removeChordAnchor(picker.lineId, picker.anchorId);
  };

  return (
    <div className="paper-card paper-ruled paper-margin rounded-xl px-10 py-6 min-h-[60vh]">
      <div className="space-y-1">
        {lyrics.map((line, i) => (
          <LineRow
            key={line.id}
            line={line}
            onAddLineAfter={() => addLine(line.id)}
            onRemoveLine={() => removeLine(line.id)}
            onPickerOpen={openPicker}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => addLine()}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
      </div>

      {/* Basket "drop" zone — appends each basket chord at the end of the last line */}
      {basket.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Drop basket chords onto a line
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            Click a chord to add it at the end of the last line, or open the picker on a line position to insert it precisely.
          </p>
          <div className="flex flex-wrap gap-2">
            {basket.map((b) => (
              <ChordChip
                key={b.id}
                chord={b.chord}
                variant="card"
                onClick={() => {
                  const last = lyrics[lyrics.length - 1];
                  if (last) upsertChordAt(last.id, last.text.length, b.chord);
                }}
              />
            ))}
            <Button size="sm" variant="ghost" onClick={clearBasket}>Clear basket</Button>
          </div>
        </div>
      )}

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        initialChord={initialChord}
        onPick={handlePick}
        onRemove={picker?.anchorId ? handleRemove : undefined}
      />
    </div>
  );
}
