import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useSongStore } from "@/store/song";
import { transposeKey } from "@/lib/music/chords";
import { cn } from "@/lib/utils";

interface KeyChangeStickerProps {
  sectionId: string;
  effectiveOffset: number;
  explicitOffset: number | undefined;
  /** When true, render in pending/edit mode even if effectiveOffset is 0. */
  startInEditMode?: boolean;
  /** Called when the user cancels while in just-added state (no offset committed yet). */
  onCancelInitial?: () => void;
}

const OFFSET_MIN = -11;
const OFFSET_MAX = 11;

function clampOffset(n: number): number {
  return Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, n));
}

export function KeyChangeSticker({
  sectionId,
  effectiveOffset,
  explicitOffset,
  startInEditMode = false,
  onCancelInitial,
}: KeyChangeStickerProps) {
  const meta = useSongStore((s) => s.meta);
  const setSectionKeyChangeOffset = useSongStore((s) => s.setSectionKeyChangeOffset);

  const initialDraft =
    typeof explicitOffset === "number" && explicitOffset !== 0
      ? explicitOffset
      : effectiveOffset !== 0
      ? effectiveOffset
      : 1;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number>(initialDraft);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!startInEditMode) return;
    // Delay opening so the DropdownMenu's pointer events fully settle before
    // Radix registers outside-click listeners on this new Popover.
    const id = setTimeout(() => {
      setDraft(initialDraft);
      setOpen(true);
    }, 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInEditMode]);

  const targetKey = transposeKey(meta.keyRoot, draft);
  const stickerKey = transposeKey(meta.keyRoot, effectiveOffset);
  const arrowUp = effectiveOffset > 0;
  const visible = effectiveOffset !== 0 || startInEditMode;

  if (!visible) return null;

  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(
        typeof explicitOffset === "number" && explicitOffset !== 0
          ? explicitOffset
          : effectiveOffset !== 0
          ? effectiveOffset
          : 1,
      );
    }
    setOpen(next);
    if (!next && startInEditMode && effectiveOffset === 0) {
      onCancelInitial?.();
    }
  };

  const handleConfirm = () => {
    const next = clampOffset(draft);
    setSectionKeyChangeOffset(sectionId, next === 0 ? undefined : next);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
    if (startInEditMode && effectiveOffset === 0) onCancelInitial?.();
  };

  const signed = draft > 0 ? `+${draft}` : `${draft}`;
  const isEdit = effectiveOffset !== 0 && !startInEditMode;
  const title = isEdit ? "Edit Key Change" : "Add Key Change";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverAnchor asChild>
        <button
          ref={anchorRef}
          type="button"
          onClick={() => handleOpen(true)}
          aria-label={
            effectiveOffset !== 0
              ? `Key change to ${stickerKey}${meta.keyMode === "min" ? " minor" : " major"} (${effectiveOffset > 0 ? "+" : ""}${effectiveOffset} semitones)`
              : "Add key change"
          }
          className={cn(
            "btn-sculpt-cocoa inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono-chord",
            "shrink-0 active:translate-y-px",
          )}
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          {effectiveOffset !== 0 ? (
            <>
              <span>
                {stickerKey}
                {meta.keyMode === "min" ? "min" : "maj"}
              </span>
              {arrowUp ? (
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
              )}
              <span>{Math.abs(effectiveOffset)}</span>
            </>
          ) : (
            <span>Key…</span>
          )}
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-3">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDraft((d) => clampOffset(d - 1))}
              disabled={draft <= OFFSET_MIN}
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-md h-9 w-9 disabled:opacity-40"
              aria-label="Decrease semitone"
            >
              −
            </button>
            <div
              className="flex-1 flex flex-col items-center justify-center px-2 py-1 rounded-md"
              style={{ background: "var(--paper-shade)" }}
            >
              <span className="font-mono-chord text-base font-bold" style={{ color: "var(--ink)" }}>
                {targetKey}
                {meta.keyMode === "min" ? "min" : "maj"}
              </span>
              <span className="text-[10px] font-mono-chord text-muted-foreground">{signed}</span>
            </div>
            <button
              type="button"
              onClick={() => setDraft((d) => clampOffset(d + 1))}
              disabled={draft >= OFFSET_MAX}
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-md h-9 w-9 disabled:opacity-40"
              aria-label="Increase semitone"
            >
              +
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            {meta.keyRoot}
            {meta.keyMode === "min" ? "min" : "maj"} → {targetKey}
            {meta.keyMode === "min" ? "min" : "maj"} ({signed} semitone{Math.abs(draft) === 1 ? "" : "s"})
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-md h-8 px-3 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="btn-sculpt-amber inline-flex items-center justify-center rounded-md h-8 px-3 text-sm font-semibold"
            >
              Confirm
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
