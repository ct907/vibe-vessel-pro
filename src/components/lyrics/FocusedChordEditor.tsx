import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChordSymbol, suggestChords, parseChord } from "@/lib/music/chords";
import { playChord } from "@/lib/music/audio";
import {
  useSongStore,
  getSectionDisplayName,
  CHORD_ROW_SLOTS,
  type LyricLine,
} from "@/store/song";
import { Play, X } from "lucide-react";

interface Props {
  sectionId: string;
  lineId: string;
  /** Initial slot the user tapped on. */
  initialSlot: number;
  /** If editing an existing chord, its anchor id. */
  initialAnchorId?: string;
  onClose: () => void;
}

/**
 * Mobile-only full-screen overlay for adding chords to a lyric row.
 * Replaces the bottom sheet picker which fights the mobile keyboard. The user
 * sees the lyric line + chord row clone at the top and the picker at the
 * bottom; tapping a suggestion injects the chord directly into the row.
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

  // Keep slot/anchor in sync with the underlying store (e.g. if a chord is
  // placed, advance to the next slot for fast successive entry).
  useEffect(() => {
    const initialChord = line?.chords.find((c) => c.id === initialAnchorId)?.chord;
    setQuery(initialChord?.display ?? "");
    setTimeout(() => inputRef.current?.focus(), 60);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestions = useMemo(() => suggestChords(query), [query]);
  const exact = useMemo(() => parseChord(query.trim()), [query]);

  const handlePick = (chord: ChordSymbol) => {
    if (!line) return;
    if (anchorId) {
      upsertChordAt(sectionId, lineId, slot, chord, anchorId);
      setAnchorId(undefined);
      setSlot((s) => Math.min(CHORD_ROW_SLOTS - 1, s + 1));
    } else {
      placeChordInSlot(sectionId, lineId, slot, chord);
      setSlot((s) => Math.min(CHORD_ROW_SLOTS - 1, s + 1));
    }
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  if (!line) {
    // Underlying line was removed — bail out.
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* BACKDROP */}
      <button
        type="button"
        aria-label="Close chord editor"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      {/* MODAL CARD */}
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
              Slot {slot + 1} {anchorId ? "· editing" : "· adding"}
            </p>
            <h2 className="text-sm font-semibold text-foreground truncate">
              Add Chords to {sectionLabel}
            </h2>
          </div>
          <Button size="sm" variant="default" onClick={onClose} className="h-9 px-3">
            Done
          </Button>
        </div>

        {/* INPUT */}
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

        {/* SUGGESTION GRID */}
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
