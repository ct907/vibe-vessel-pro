import { useRef, useState } from "react";
import { useSongStore, type PatternBlock as PatternBlockType } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Minus, Trash2, ArrowLeft, ArrowRight, Pencil, X } from "lucide-react";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";

const LENGTH_STEP = 0.5;
const MIN_LEN = 0.5;

interface PatternProps {
  pattern: PatternBlockType;
  sectionLabel?: string;
  canDelete: boolean;
  otherPatterns: { id: string; label: string }[];
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
}

function formatBeats(n: number) {
  // Show .5 only when fractional
  return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, "");
}

function PatternBlock({ pattern, sectionLabel, canDelete, otherPatterns, onPickerOpen }: PatternProps) {
  const {
    updatePattern, basket, addChordToPattern, removePatternChord,
    setPatternChordLength, movePatternChord, removeSection,
    removePatternChordsBatch, shiftPatternChords, movePatternChordsTo,
  } = useSongStore();
  const [activeChord, setActiveChord] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  const totalBeats = pattern.bars * pattern.beatsPerBar;
  const sortedChords = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);
  const usedBeats = sortedChords.reduce((sum, c) => sum + c.lengthBeats, 0);
  const freeBeats = Math.max(0, totalBeats - usedBeats);
  const selectedIds = Array.from(selected);

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const startPress = (chordId: string) => {
    longFiredRef.current = false;
    pressTimer.current = setTimeout(() => {
      longFiredRef.current = true;
      if (!selectMode) {
        setSelectMode(true);
        setSelected(new Set([chordId]));
        setActiveChord(null);
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(chordId)) next.delete(chordId); else next.add(chordId);
          return next;
        });
      }
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const handleChordTap = (chordId: string) => {
    if (longFiredRef.current) return;
    if (selectMode) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(chordId)) next.delete(chordId); else next.add(chordId);
        return next;
      });
    } else {
      setActiveChord(activeChord === chordId ? null : chordId);
    }
  };

  const active = activeChord ? sortedChords.find((c) => c.id === activeChord) ?? null : null;
  // Max length the active chord can grow to without bumping siblings.
  const activeMaxLen = active ? totalBeats - (usedBeats - active.lengthBeats) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-base ink-chord truncate">{sectionLabel ?? pattern.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">bound to section</span>
        </div>
        <span className="text-xs text-muted-foreground">·</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Bars
          <Input
            type="number"
            min={1}
            max={32}
            value={pattern.bars}
            onChange={(e) => updatePattern(pattern.id, { bars: Math.max(1, Math.min(32, Number(e.target.value) || 1)) })}
            className="h-7 w-14 font-mono-chord"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatBeats(usedBeats)} / {totalBeats} beats
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => removeSection(pattern.id)}
          disabled={!canDelete}
          title="Delete section + pattern"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {selectMode && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-card px-3 py-2 shadow-sm flex-wrap text-xs">
          <span className="font-medium">{selectedIds.length} selected</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => shiftPatternChords(pattern.id, selectedIds, -1)} aria-label="Shift earlier">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!selectedIds.length}
            onClick={() => shiftPatternChords(pattern.id, selectedIds, 1)} aria-label="Shift later">
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={!selectedIds.length}
            onClick={() => { removePatternChordsBatch(pattern.id, selectedIds); exitSelect(); }} aria-label="Delete selected">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {otherPatterns.length > 0 && (
            <Select
              value=""
              onValueChange={(toId) => { movePatternChordsTo(pattern.id, toId, selectedIds); exitSelect(); }}
            >
              <SelectTrigger className="h-7 w-[140px] text-xs" disabled={!selectedIds.length}>
                <SelectValue placeholder="Move to…" />
              </SelectTrigger>
              <SelectContent>
                {otherPatterns.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto" onClick={exitSelect}>Done</Button>
        </div>
      )}

      {/* Left-aligned flex layout. Each chord's width is proportional to its
          beat length relative to total beats. Empty space stays on the right. */}
      <div className="relative">
        <div className="relative h-20 rounded-md border border-border bg-muted/30 overflow-hidden flex items-stretch">
          {/* Bar grid lines (visual reference only) */}
          {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
            <div
              key={`bar-${i}`}
              className="absolute top-0 bottom-0 border-l border-border/70 pointer-events-none"
              style={{ left: `${(i / pattern.bars) * 100}%` }}
            />
          ))}

          {sortedChords.map((c) => {
            const isSel = selected.has(c.id);
            const widthPct = (c.lengthBeats / totalBeats) * 100;
            return (
              <button
                key={c.id}
                onMouseDown={(e) => { e.stopPropagation(); startPress(c.id); }}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={(e) => { e.stopPropagation(); startPress(c.id); }}
                onTouchEnd={cancelPress}
                onContextMenu={(e) => { e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); handleChordTap(c.id); }}
                className={cn(
                  "relative my-1 mx-0.5 rounded-md border border-primary/40 bg-card hover:bg-accent flex flex-col items-center justify-center px-1 overflow-hidden select-none transition-colors",
                  !selectMode && activeChord === c.id && "ring-2 ring-primary",
                  selectMode && isSel && "ring-2 ring-primary bg-accent",
                )}
                style={{ width: `calc(${widthPct}% - 4px)`, minWidth: 32 }}
              >
                <span className="font-mono-chord font-semibold ink-chord text-sm leading-tight truncate max-w-full">
                  {c.chord.display}
                </span>
                <span className="font-mono-chord text-[10px] text-muted-foreground leading-tight">
                  {formatBeats(c.lengthBeats)}b
                </span>
              </button>
            );
          })}

          {/* Empty trailing zone — click to add at end */}
          <button
            type="button"
            onClick={() => onPickerOpen(pattern.id, usedBeats)}
            className="flex-1 min-w-0 my-1 mx-0.5 rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground hover:bg-accent/40 transition-colors"
            style={{ display: freeBeats > 0 ? "block" : "none" }}
            aria-label="Add chord at end"
          >
            {sortedChords.length === 0 ? "Click to add a chord" : `+ ${formatBeats(freeBeats)}b`}
          </button>
        </div>

        {!selectMode && active && (() => {
          const c = active;
          const canDecrease = c.lengthBeats > MIN_LEN;
          const canIncrease = c.lengthBeats + LENGTH_STEP <= activeMaxLen + 1e-9;
          return (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm flex-wrap">
              <span className="font-mono-chord ink-chord text-sm">{c.chord.display}</span>
              <span className="text-xs text-muted-foreground">
                len {formatBeats(c.lengthBeats)}b
              </span>

              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={!canDecrease}
                  onClick={() => setPatternChordLength(pattern.id, c.id, c.lengthBeats - LENGTH_STEP)}
                  aria-label="Decrease length"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  disabled={!canIncrease}
                  onClick={() => setPatternChordLength(pattern.id, c.id, c.lengthBeats + LENGTH_STEP)}
                  aria-label="Increase length"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePatternChord(pattern.id, c.id, -1)} aria-label="Move earlier">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => movePatternChord(pattern.id, c.id, 1)} aria-label="Move later">
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onPickerOpen(pattern.id, c.startBeat, c.id)} aria-label="Replace chord">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { removePatternChord(pattern.id, c.id); setActiveChord(null); }} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" onClick={() => setActiveChord(null)} aria-label="Close menu">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })()}
      </div>

      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Long-press a chord to multi-select · Tap to edit length
      </p>

      {basket.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From basket</p>
          <div className="flex flex-wrap gap-1.5">
            {basket.map((b) => (
              <ChordChip
                key={b.id}
                chord={b.chord}
                size="sm"
                onClick={() => addChordToPattern(pattern.id, b.chord, usedBeats, 2)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProgressionsTab() {
  const { progression, sections, addSection, addChordToPattern, updatePatternChord } = useSongStore();
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);

  const labelById = new Map(sections.map((s) => [s.id, s.label] as const));
  const canDelete = sections.length > 1;

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    if (picker.replaceChordId) {
      updatePatternChord(picker.patternId, picker.replaceChordId, { chord });
    } else {
      addChordToPattern(picker.patternId, chord, picker.atBeat, 2);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Each pattern block is bound to a section in the Lyrics tab. Adding a chord here also drops it at the end of that section's last lyric line, and vice versa.
      </p>

      {progression.map((p) => (
        <PatternBlock
          key={p.id}
          pattern={p}
          sectionLabel={labelById.get(p.id)}
          canDelete={canDelete}
          otherPatterns={progression
            .filter((q) => q.id !== p.id)
            .map((q) => ({ id: q.id, label: labelById.get(q.id) ?? q.label }))}
          onPickerOpen={(patternId, atBeat, replaceChordId) => setPicker({ patternId, atBeat, replaceChordId })}
        />
      ))}

      <Button variant="outline" onClick={() => addSection("custom")}>
        <Plus className="h-4 w-4" /> Add pattern (creates a new section)
      </Button>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={handlePick}
      />
    </div>
  );
}
