import { useState } from "react";
import { useSongStore, type PatternBlock as PatternBlockType } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Pencil, X } from "lucide-react";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [
  { v: 1, label: "1 beat" },
  { v: 2, label: "2 beats" },
  { v: 4, label: "1 bar" },
  { v: 8, label: "2 bars" },
  { v: 16, label: "4 bars" },
];

interface PatternProps {
  pattern: PatternBlockType;
  onPickerOpen: (patternId: string, atBeat: number, replaceChordId?: string) => void;
}

function PatternBlock({ pattern, onPickerOpen }: PatternProps) {
  const { updatePattern, removePattern, basket, addChordToPattern, removePatternChord, updatePatternChord, movePatternChord } = useSongStore();
  const [activeChord, setActiveChord] = useState<string | null>(null);

  const totalBeats = pattern.bars * pattern.beatsPerBar;
  const cellWidth = 100 / totalBeats;
  const sortedChords = [...pattern.chords].sort((a, b) => a.startBeat - b.startBeat);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const beat = Math.floor((x / rect.width) * totalBeats);
    onPickerOpen(pattern.id, beat);
  };

  return (
    <div className="paper-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={pattern.label}
          onChange={(e) => updatePattern(pattern.id, { label: e.target.value })}
          className="h-8 w-40 font-display text-base bg-transparent border-0 border-b border-transparent rounded-none px-1 focus-visible:border-primary focus-visible:ring-0"
        />
        <span className="text-xs text-muted-foreground">·</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Bars
          <Input
            type="number"
            min={1}
            max={16}
            value={pattern.bars}
            onChange={(e) => updatePattern(pattern.id, { bars: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })}
            className="h-7 w-14 font-mono-chord"
          />
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removePattern(pattern.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Bar grid */}
      <div className="relative">
        <div
          className="relative h-20 rounded-md border border-border bg-paper-shade/40 overflow-hidden cursor-pointer"
          onClick={handleGridClick}
        >
          {/* bar lines */}
          {Array.from({ length: pattern.bars + 1 }).map((_, i) => (
            <div
              key={`bar-${i}`}
              className="absolute top-0 bottom-0 border-l border-rule/70"
              style={{ left: `${(i / pattern.bars) * 100}%` }}
            />
          ))}
          {/* beat ticks */}
          {Array.from({ length: totalBeats }).map((_, i) => (
            <div
              key={`beat-${i}`}
              className="absolute top-0 bottom-0 border-l border-rule/30"
              style={{ left: `${(i / totalBeats) * 100}%` }}
            />
          ))}
          {/* placed chords */}
          {sortedChords.map((c) => (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); setActiveChord(activeChord === c.id ? null : c.id); }}
              className={cn(
                "absolute top-1 bottom-1 rounded-md border border-primary/40 bg-card hover:bg-accent flex items-center justify-center px-1 overflow-hidden",
                activeChord === c.id && "ring-2 ring-primary",
              )}
              style={{
                left: `${(c.startBeat / totalBeats) * 100}%`,
                width: `${(c.lengthBeats / totalBeats) * 100}%`,
              }}
            >
              <span className="font-mono-chord font-semibold ink-chord text-sm truncate">
                {c.chord.display}
              </span>
            </button>
          ))}

          {sortedChords.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
              Click a beat to add a chord, or drop from the basket below
            </div>
          )}
        </div>

        {/* contextual menu under the block */}
        {activeChord && (() => {
          const c = sortedChords.find((x) => x.id === activeChord);
          if (!c) return null;
          return (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm">
              <span className="font-mono-chord ink-chord text-sm">{c.chord.display}</span>
              <span className="text-xs text-muted-foreground">at beat {c.startBeat + 1}</span>

              <Select
                value={String(c.lengthBeats)}
                onValueChange={(v) => updatePatternChord(pattern.id, c.id, { lengthBeats: Number(v) })}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.v} value={String(d.v)} className="text-xs">{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

      {/* basket → drop into this block */}
      {basket.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From basket</p>
          <div className="flex flex-wrap gap-1.5">
            {basket.map((b) => (
              <ChordChip
                key={b.id}
                chord={b.chord}
                size="sm"
                onClick={() => {
                  // append at the next free beat
                  const lastEnd = sortedChords.length
                    ? Math.max(...sortedChords.map((c) => c.startBeat + c.lengthBeats))
                    : 0;
                  const start = Math.min(lastEnd, totalBeats - 1);
                  addChordToPattern(pattern.id, b.chord, start, 4);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProgressionsTab() {
  const { progression, addPattern, addChordToPattern, updatePatternChord } = useSongStore();
  const [picker, setPicker] = useState<{ patternId: string; atBeat: number; replaceChordId?: string } | null>(null);

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    if (picker.replaceChordId) {
      updatePatternChord(picker.patternId, picker.replaceChordId, { chord });
    } else {
      addChordToPattern(picker.patternId, chord, picker.atBeat, 4);
    }
  };

  return (
    <div className="space-y-4">
      {progression.map((p) => (
        <PatternBlock
          key={p.id}
          pattern={p}
          onPickerOpen={(patternId, atBeat, replaceChordId) => setPicker({ patternId, atBeat, replaceChordId })}
        />
      ))}

      <Button variant="outline" onClick={() => addPattern()}>
        <Plus className="h-4 w-4" /> Add pattern
      </Button>

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        onPick={handlePick}
      />
    </div>
  );
}
