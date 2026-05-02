import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordSymbol, suggestChords, parseChord } from "@/lib/music/chords";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { playChord } from "@/lib/music/audio";
import {
  useSongStore,
  getSectionDisplayName,
  getLineChordsViaSSOT,
  CHORD_ROW_SLOTS,
  type LyricLine,
} from "@/store/song";
import { useUIStore } from "@/store/ui";
import { toast } from "sonner";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sectionId: string;
  lineId: string;
  initialSlot: number;
  initialAnchorId?: string;
  onClose: () => void;
}

const SLOT_PX = 28;

const dbg = (...args: unknown[]) => {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("LV_DEBUG_LAYOUT") === "1") {
      // eslint-disable-next-line no-console
      console.log("[editor]", ...args);
    }
  } catch { /* ignore */ }
};

/** Width (in slots) the chord display will occupy. Mirrors chordLayout. */
function chordSlotWidth(display: string): number {
  return display.length <= 3 ? 1 : 2;
}

/**
 * Mobile full-screen overlay for adding chords to a lyric row. Renders the
 * full 80-slot chord row in a horizontal scroller so users can see overflow
 * accumulate; cursor advances by (placedSlot + chordWidth + 1) read directly
 * from the store after each placement.
 */
export function FocusedChordEditor({
  sectionId,
  lineId,
  initialSlot,
  initialAnchorId,
  onClose,
}: Props) {
  const sections = useSongStore((s) => s.sections);
  const placeChordInSlot = useSongStore((s) => s.placeChordInSlot);
  const upsertChordAt = useSongStore((s) => s.upsertChordAt);

  const section = sections.find((s) => s.id === sectionId);
  const line: LyricLine | undefined = section?.lines.find((l) => l.id === lineId);
  const sectionLabel = section ? getSectionDisplayName(sections, section.id) : "";

  const [slot, setSlot] = useState(initialSlot);
  const [anchorId, setAnchorId] = useState<string | undefined>(initialAnchorId);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const setEditorOpen = useUIStore((s) => s.setFocusedEditorOpen);

  // Mark editor open so the watchdog in LyricsTab pauses reflow until close.
  // useEffect cleanup is guaranteed by React on unmount/error/route change.
  useEffect(() => {
    setEditorOpen(true);
    dbg("mounted — focusedEditorOpen: true");
    return () => {
      setEditorOpen(false);
      dbg("unmounted — focusedEditorOpen: false");
    };
  }, [setEditorOpen]);

  useEffect(() => {
    const lineChords = section ? getLineChordsViaSSOT(section, lineId) : [];
    const initialChord = lineChords.find((c) => c.id === initialAnchorId)?.chord;
    setQuery(initialChord?.display ?? "");
    setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll the slot row so the active slot stays visible.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = slot * SLOT_PX;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    if (target < viewLeft + 40 || target > viewRight - 80) {
      el.scrollTo({ left: Math.max(0, target - el.clientWidth / 2), behavior: "smooth" });
    }
  }, [slot]);

  const suggestions = useMemo(() => suggestChords(query), [query]);
  const exact = useMemo(() => parseChord(query.trim()), [query]);

  const handlePick = (chord: ChordSymbol) => {
    if (!line) return;
    if (anchorId) {
      upsertChordAt(sectionId, lineId, slot, chord, anchorId);
      setAnchorId(undefined);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }

    const requestedSlot = slot;
    const placed = placeChordInSlot(sectionId, lineId, requestedSlot, chord);
    const placedSlot = placed?.slotIndex ?? requestedSlot;
    const w = chordSlotWidth(chord.display);
    const next = Math.min(CHORD_ROW_SLOTS - 1, placedSlot + w + 1);

    dbg("chord added", { requested: requestedSlot, placedSlot, nextCursor: next });

    if (placedSlot >= CHORD_ROW_SLOTS - 1) {
      toast("Chord row is full — close the editor to auto-fit chords across multiple lines.");
    }

    setSlot(next);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  if (!line) return null;

  const liveChords = section ? getLineChordsViaSSOT(section, lineId) : [];
  const slotMap: (typeof liveChords[number] | undefined)[] = new Array(CHORD_ROW_SLOTS).fill(undefined);
  liveChords.forEach((c) => {
    const s = c.slotIndex;
    if (s != null && s >= 0 && s < CHORD_ROW_SLOTS) slotMap[s] = c;
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close chord editor"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      <div className="relative m-4 flex flex-1 flex-col rounded-lg border border-border bg-background shadow-xl overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-9 px-2 text-muted-foreground"
            aria-label="Close chord editor"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
              Slot {slot + 1} of {CHORD_ROW_SLOTS} {anchorId ? "· editing" : "· adding"}
            </p>
            <h2 className="text-sm font-semibold text-foreground truncate">
              Add Chords to {sectionLabel}
            </h2>
          </div>
          <Button size="sm" variant="default" onClick={onClose} className="h-9 px-3">
            Done
          </Button>
        </div>

        {/* PREVIEW: full 80-slot scrollable chord row + lyric. */}
        <div className="px-3 py-2 border-b border-border shrink-0 bg-muted/30">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Preview · scroll horizontally to see full row
          </p>
          <div
            ref={scrollerRef}
            className="overflow-x-auto rounded-sm bg-muted-foreground/10"
            style={{ minHeight: 32 }}
          >
            <div
              className="flex items-stretch"
              style={{ minWidth: CHORD_ROW_SLOTS * SLOT_PX }}
            >
              {slotMap.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "shrink-0 h-8 flex items-center justify-center px-0.5",
                    "w-7",
                    i > 0 && "border-l border-muted-foreground/15",
                    i === slot && "bg-primary/15 ring-1 ring-primary/40 rounded-sm",
                  )}
                  style={{ width: SLOT_PX }}
                >
                  {c && (
                    <span className="font-mono-chord text-[11px] font-semibold text-chord-chip-foreground truncate">
                      {c.chord.display}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1 font-display text-base leading-tight text-foreground/90 truncate">
            {line.text || (
              <span className="italic text-muted-foreground/70">(empty lyric line)</span>
            )}
          </p>
        </div>

        <div className="px-3 py-3 border-b border-border shrink-0">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a chord… e.g. Bbm9, Fmaj7"
            className="font-mono-chord text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && exact) {
                e.preventDefault();
                handlePick(exact);
              }
            }}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {!query.trim() && (
            <p className="text-sm text-muted-foreground mb-3">
              Type a root letter (A–G) for variations, or a full chord like{" "}
              <code className="font-mono-chord">Fmaj7</code>.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s) => (
              <button
                key={s.symbol.display}
                type="button"
                onClick={() => handlePick(s.symbol)}
                className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-3 text-left hover:bg-accent transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-mono-chord font-semibold ink-chord">{s.symbol.display}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                </div>
                <span
                  role="button"
                  aria-label={`Preview ${s.symbol.display}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void playChord(s.symbol);
                  }}
                  className="rounded-full p-2 text-muted-foreground hover:text-primary hover:bg-background"
                >
                  <Play className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
