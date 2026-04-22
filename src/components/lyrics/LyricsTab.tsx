import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSongStore, getSectionDisplayName, type LyricLine, type Section, type SectionType } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { ChordPickerSheet } from "@/components/chord/ChordPickerSheet";
import { parseChord, ChordSymbol } from "@/lib/music/chords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight, MoreVertical, Copy, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "bridge", "intro", "outro", "pre-chorus", "custom"];

function measureOffsetX(measureEl: HTMLSpanElement, text: string, offset: number): number {
  measureEl.textContent = text.slice(0, offset) || "\u200B";
  return measureEl.getBoundingClientRect().width;
}

interface LineRowProps {
  sectionId: string;
  line: LyricLine;
  active?: boolean;
  onAddLineAfter: () => void;
  onRemoveLine: () => void;
  onPickerOpen: (lineId: string, offset: number, anchorId?: string) => void;
  onActiveRect?: (rect: { width: number; left: number } | null) => void;
}

function LineRow({ sectionId, line, active, onAddLineAfter, onRemoveLine, onPickerOpen, onActiveRect }: LineRowProps) {
  const { setLineText, upsertChordAt, removeChordAnchor, removeChordAnchorsBatch, shiftChordAnchors } = useSongStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const chordRowRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();

  useEffect(() => {
    const ro = new ResizeObserver(() => force((x) => x + 1));
    if (rowRef.current) ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, []);

  // Report rect for the pinned mobile clone
  useLayoutEffect(() => {
    if (!active || !onActiveRect) return;
    const measure = () => {
      if (!chordRowRef.current) return;
      const r = chordRowRef.current.getBoundingClientRect();
      onActiveRect({ width: r.width, left: r.left });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, onActiveRect]);

  // Exit select mode if no chips remain
  useEffect(() => {
    if (selectMode && line.chords.length === 0) { setSelectMode(false); setSelected(new Set()); }
  }, [line.chords.length, selectMode]);

  const handleChordRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectMode) return; // don't open picker while selecting
    if (!measureRef.current || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const text = line.text || " ";
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i <= text.length; i++) {
      const w = measureOffsetX(measureRef.current, text, i);
      const d = Math.abs(w - x);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    onPickerOpen(line.id, best);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    const re = /\[([^\]]+)\]/;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value))) {
      const parsed = parseChord(match[1]);
      const start = match.index;
      if (parsed) upsertChordAt(sectionId, line.id, start, parsed);
      value = value.slice(0, start) + value.slice(start + match[0].length);
    }
    setLineText(sectionId, line.id, value);
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

  const enterSelect = (anchorId: string) => {
    setSelectMode(true);
    setSelected(new Set([anchorId]));
  };
  const toggleSelected = (anchorId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(anchorId)) next.delete(anchorId); else next.add(anchorId);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const selectedIds = Array.from(selected);

  return (
    <div
      ref={rowRef}
      className={cn(
        "relative group py-1 transition-colors",
        active && "rounded-md ring-2 ring-primary/70 bg-primary/5 px-2 -mx-2",
      )}
      data-active={active ? "true" : undefined}
    >
      <div
        ref={chordRowRef}
        className="relative h-6 cursor-text"
        onClick={handleChordRowClick}
        title={selectMode ? "Tap chips to add/remove from selection" : "Click to add a chord above this position"}
      >
        {line.chords.length === 0 && (
          <span className="absolute left-0 top-0 text-xs italic text-muted-foreground/60 leading-6 pointer-events-none select-none">
            add your chords here
          </span>
        )}
        {line.chords.map((a) => {
          const x = measureRef.current ? measureOffsetX(measureRef.current, line.text, a.offset) : 0;
          const isSel = selected.has(a.id);
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
                selected={selectMode && isSel}
                audition={!selectMode}
                onClick={selectMode ? () => toggleSelected(a.id) : undefined}
                onLongPress={() => {
                  if (selectMode) toggleSelected(a.id);
                  else enterSelect(a.id);
                }}
              />
            </div>
          );
        })}
      </div>

      {selectMode && (
        <div className="mb-1 -mt-0.5 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 shadow-sm text-xs">
          <span className="text-muted-foreground">{selectedIds.length} selected</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={() => shiftChordAnchors(sectionId, line.id, selectedIds, -1)} aria-label="Shift left">
            <ArrowUp className="h-3 w-3 -rotate-90" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!selectedIds.length}
            onClick={() => shiftChordAnchors(sectionId, line.id, selectedIds, 1)} aria-label="Shift right">
            <ArrowDown className="h-3 w-3 -rotate-90" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" disabled={!selectedIds.length}
            onClick={() => { removeChordAnchorsBatch(sectionId, line.id, selectedIds); exitSelect(); }} aria-label="Delete selected">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 ml-auto" onClick={exitSelect}>Done</Button>
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          value={line.text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write your lyric line… (use [Fmaj7] to drop a chord inline)"
          className="w-full bg-transparent border-0 outline-none font-display text-lg leading-9 text-foreground placeholder:text-muted-foreground/60 px-0"
        />
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

      {line.chords.length > 0 && !selectMode && (
        <button
          onClick={() => line.chords.forEach((c) => removeChordAnchor(sectionId, line.id, c.id))}
          className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Clear chords on line
        </button>
      )}
    </div>
  );
}

interface SectionCardProps {
  section: Section;
  index: number;
  total: number;
  displayName: string;
  activeLineId?: string;
  onPickerOpen: (sectionId: string, lineId: string, offset: number, anchorId?: string) => void;
  onActiveRect?: (rect: { width: number; left: number } | null) => void;
}

function SectionCard({ section, index, total, displayName, activeLineId, onPickerOpen, onActiveRect }: SectionCardProps) {
  const {
    addLine, removeLine, updateSection, removeSection, duplicateSection, moveSection,
    toggleSectionCollapsed, upsertChordAt, basket,
  } = useSongStore();
  const [customRenameOpen, setCustomRenameOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(section.label);

  useEffect(() => { setDraftLabel(section.label); }, [section.label]);

  const acceptCustomName = () => {
    const trimmed = draftLabel.trim() || "Section";
    updateSection(section.id, { label: trimmed });
    setCustomRenameOpen(false);
  };

  return (
    <div className="paper-card paper-ruled paper-margin rounded-xl px-10 py-5">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 -ml-4">
        <button
          onClick={() => toggleSectionCollapsed(section.id)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={section.collapsed ? "Expand section" : "Collapse section"}
        >
          {section.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <Select
          value={section.type}
          onValueChange={(v) => {
            const next = v as SectionType;
            // If switching to custom, prompt for a name; otherwise label is computed.
            updateSection(section.id, { type: next, label: next === "custom" ? (section.label || "Section") : section.label });
            if (next === "custom") setCustomRenameOpen(true);
          }}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-sm font-display font-semibold ink-chord capitalize">
            <SelectValue>{displayName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SECTION_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {section.type === "custom" && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCustomRenameOpen(true)} aria-label="Rename custom section">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-1">
          {section.lines.length} line{section.lines.length === 1 ? "" : "s"}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Section</DropdownMenuLabel>
            {section.type === "custom" && (
              <DropdownMenuItem onClick={() => setCustomRenameOpen(true)}>
                <Pencil className="h-4 w-4" /> Rename…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => duplicateSection(section.id)}>
              <Copy className="h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => moveSection(section.id, -1)} disabled={index === 0}>
              <ArrowUp className="h-4 w-4" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveSection(section.id, 1)} disabled={index === total - 1}>
              <ArrowDown className="h-4 w-4" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => removeSection(section.id)}
              disabled={total <= 1}
            >
              <Trash2 className="h-4 w-4" /> Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      {!section.collapsed && (
        <>
          <div className="space-y-1">
            {section.lines.map((line) => (
              <LineRow
                key={line.id}
                sectionId={section.id}
                line={line}
                active={activeLineId === line.id}
                onAddLineAfter={() => addLine(section.id, line.id)}
                onRemoveLine={() => removeLine(section.id, line.id)}
                onPickerOpen={(lineId, offset, anchorId) => onPickerOpen(section.id, lineId, offset, anchorId)}
                onActiveRect={activeLineId === line.id ? onActiveRect : undefined}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => addLine(section.id)}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>

          {basket.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Drop basket chords into this section
              </p>
              <div className="flex flex-wrap gap-1.5">
                {basket.map((b) => (
                  <ChordChip
                    key={b.id}
                    chord={b.chord}
                    size="sm"
                    onClick={() => {
                      const last = section.lines[section.lines.length - 1];
                      if (last) upsertChordAt(section.id, last.id, last.text.length, b.chord);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Custom name dialog */}
      <Dialog open={customRenameOpen} onOpenChange={setCustomRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name this section</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") acceptCustomName(); }}
            placeholder="e.g. Refrain, Tag, Solo…"
            className="font-display text-base"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomRenameOpen(false)}>Cancel</Button>
            <Button onClick={acceptCustomName}>Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pinned clone of the active line's chord row for mobile, fixed at top:100px. */
function MobilePinnedActiveRow({
  line, rect, onPickerOpen, onHeight,
}: {
  line: LyricLine;
  rect: { width: number; left: number };
  onPickerOpen: (lineId: string, offset: number, anchorId?: string) => void;
  onHeight: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    if (ref.current) onHeight(ref.current.getBoundingClientRect().height);
    force((x) => x + 1); // ensure measure span has rendered
    return () => onHeight(0);
  }, [line.id, onHeight]);

  return (
    <div
      ref={ref}
      className="fixed z-40 pointer-events-auto rounded-md ring-2 ring-primary/70 bg-paper shadow-md px-2 py-1"
      style={{ top: 100, left: rect.left - 8, width: rect.width + 16 }}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Editing chords on:</div>
      <div className="relative h-6">
        {line.chords.length === 0 && (
          <span className="absolute left-0 top-0 text-xs italic text-muted-foreground/60 leading-6">
            add your chords here
          </span>
        )}
        {line.chords.map((a) => {
          const x = measureRef.current ? measureOffsetX(measureRef.current, line.text, a.offset) : 0;
          return (
            <div key={a.id} className="absolute -translate-x-1/2" style={{ left: `${x}px`, top: 0 }}>
              <ChordChip chord={a.chord} variant="ink" size="sm" audition
                onClick={() => onPickerOpen(line.id, a.offset, a.id)} />
            </div>
          );
        })}
      </div>
      <div className="font-display text-base leading-7 text-foreground/80 truncate">
        {line.text || <span className="text-muted-foreground/60">(empty line)</span>}
      </div>
      <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-pre font-display text-lg leading-9" />
    </div>
  );
}

export function LyricsTab() {
  const { sections, upsertChordAt, removeChordAnchor, addSection } = useSongStore();
  const [picker, setPicker] = useState<{ sectionId: string; lineId: string; offset: number; anchorId?: string } | null>(null);
  const [activeRect, setActiveRect] = useState<{ width: number; left: number } | null>(null);
  const [pinnedHeight, setPinnedHeight] = useState(0);
  const isMobile = useIsMobile();

  const openPicker = (sectionId: string, lineId: string, offset: number, anchorId?: string) =>
    setPicker({ sectionId, lineId, offset, anchorId });

  const activeSection = picker ? sections.find((s) => s.id === picker.sectionId) : undefined;
  const activeLine = activeSection?.lines.find((l) => l.id === picker?.lineId);
  const initialChord = activeLine?.chords.find((c) => c.id === picker?.anchorId)?.chord;

  const handlePick = (chord: ChordSymbol) => {
    if (!picker) return;
    upsertChordAt(picker.sectionId, picker.lineId, picker.offset, chord, picker.anchorId);
  };
  const handleRemove = () => {
    if (!picker?.anchorId) return;
    removeChordAnchor(picker.sectionId, picker.lineId, picker.anchorId);
  };

  // Reserved area at top of viewport: ~100px offset + pinned row height (mobile only)
  const topReservedPx = isMobile && picker && pinnedHeight ? 100 + pinnedHeight + 12 : 0;

  return (
    <div className="space-y-4">
      {sections.map((sec, i) => (
        <SectionCard
          key={sec.id}
          section={sec}
          index={i}
          total={sections.length}
          displayName={getSectionDisplayName(sections, sec.id)}
          activeLineId={picker?.sectionId === sec.id ? picker?.lineId : undefined}
          onPickerOpen={openPicker}
          onActiveRect={picker?.sectionId === sec.id ? setActiveRect : undefined}
        />
      ))}

      <div className={cn("flex flex-wrap items-center gap-2")}>
        <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Add section</span>
        {(["verse", "chorus", "bridge", "intro"] as SectionType[]).map((t) => (
          <Button key={t} size="sm" variant="outline" onClick={() => addSection(t)} className="capitalize">
            <Plus className="h-3.5 w-3.5" /> {t}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addSection("custom")}>
          <Plus className="h-3.5 w-3.5" /> Custom…
        </Button>
      </div>

      {/* Mobile-only pinned active row */}
      {isMobile && picker && activeLine && activeRect && (
        <MobilePinnedActiveRow
          line={activeLine}
          rect={activeRect}
          onPickerOpen={(lineId, offset, anchorId) => openPicker(picker.sectionId, lineId, offset, anchorId)}
          onHeight={setPinnedHeight}
        />
      )}

      <ChordPickerSheet
        open={!!picker}
        onOpenChange={(o) => { if (!o) { setPicker(null); setActiveRect(null); setPinnedHeight(0); } }}
        initialChord={initialChord}
        onPick={handlePick}
        onRemove={picker?.anchorId ? handleRemove : undefined}
        topReservedPx={topReservedPx}
      />
    </div>
  );
}
