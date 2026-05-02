import { forwardRef, useRef } from "react";
import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { ArrowRight, GripVertical, Trash2, X } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { ChordSymbol } from "@/lib/music/chords";
import { getChordColorClasses } from "@/lib/music/chordColor";
import { cn } from "@/lib/utils";
import { useBasketSelectionStore } from "@/store/basket-selection";

/**
 * Static, non-interactive chip used INSIDE basket Draggables. We can't reuse
 * <ChordChip> here because it renders a <button> with its own touch handlers
 * (audition + sustain-on-hold), which capture touchstart and prevent
 * @hello-pangea/dnd from initiating a drag on touch devices.
 */
function StaticChordChip({
  chord,
  dragging,
  selected,
  badgeCount,
}: {
  chord: ChordSymbol;
  dragging?: boolean;
  selected?: boolean;
  /** When > 1, render a "+N" pill on the dragging clone to show the multi-drag size. */
  badgeCount?: number;
}) {
  const colors = getChordColorClasses(chord);
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1 rounded-md font-mono-chord font-semibold select-none transition-colors",
        "px-2.5 py-1 text-sm",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-paper-shade",
        dragging && "shadow-lg ring-2 ring-primary",
      )}
      style={{ ...colors.style, pointerEvents: "none" }}
    >
      <GripVertical className="h-3 w-3 opacity-60" aria-hidden />
      {chord.display}
      {badgeCount && badgeCount > 1 ? (
        <span className="absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow">
          +{badgeCount - 1}
        </span>
      ) : null}
    </span>
  );
}

interface Props {
  onSendToLyrics?: () => void;
  onSendToProgressions?: () => void;
  /** When true, basket chips become Draggables inside the surrounding DragDropContext. */
  draggable?: boolean;
}

const TAP_MAX_MS = 300;
const TAP_MAX_PX = 8;

/**
 * IMPORTANT: BasketBar must be a forwardRef component. @hello-pangea/dnd's
 * <DragDropContext> attaches a ref to its direct children to manage drag
 * lifecycle. A plain function child triggers React's "Function components
 * cannot be given refs" warning AND silently breaks drags out of this
 * fixed-position container.
 */
export const BasketBar = forwardRef<HTMLDivElement, Props>(function BasketBar(
  { onSendToLyrics, onSendToProgressions, draggable = false },
  ref,
) {
  const { basket, clearBasket } = useSongStore();
  const selected = useBasketSelectionStore((s) => s.selected);
  const toggleSelected = useBasketSelectionStore((s) => s.toggle);
  const clearSelected = useBasketSelectionStore((s) => s.clear);

  // Tap detection (per-pointerdown). We track start time + position so we can
  // tell apart a quick tap (toggle selection) from a long-press drag intent
  // (handled by pangea, which won't fire our touchend toggle because the
  // gesture leaves the chip).
  const tapInfo = useRef<{ id: string; t: number; x: number; y: number } | null>(null);

  if (basket.length === 0) return <div ref={ref} hidden />;

  const isSelected = (id: string) => selected.has(id);
  const selectionSize = selected.size;

  const onChipPointerDown = (id: string, e: React.PointerEvent) => {
    // If the chip is already selected, skip arming the tap detector so any
    // subsequent movement is owned exclusively by pangea's drag sensor.
    // This fixes the regression where the first drag after select did nothing
    // because pointerup deselected the chip mid-gesture.
    if (isSelected(id)) {
      tapInfo.current = null;
      return;
    }
    tapInfo.current = { id, t: Date.now(), x: e.clientX, y: e.clientY };
  };
  const onChipPointerUp = (id: string, e: React.PointerEvent) => {
    const info = tapInfo.current;
    tapInfo.current = null;
    if (!info || info.id !== id) return;
    const dt = Date.now() - info.t;
    const dx = Math.abs(e.clientX - info.x);
    const dy = Math.abs(e.clientY - info.y);
    if (dt > TAP_MAX_MS) return; // long-press → leave for pangea
    if (dx > TAP_MAX_PX || dy > TAP_MAX_PX) return; // moved → drag intent
    toggleSelected(id);
  };

  const renderChips = () =>
    basket.map((b, i) => {
      if (!draggable) {
        return <ChordChip key={b.id} chord={b.chord} variant="ink" size="md" />;
      }
      const sel = isSelected(b.id);
      // All chips are draggable. Quick taps still toggle selection (the tap
      // detector below); long-press / movement defaults to a drag because
      // pangea owns the gesture once it crosses its threshold.
      return (
        <Draggable
          key={b.id}
          draggableId={`basket:${b.id}`}
          index={i}
          isDragDisabled={false}
        >
          {(prov, snap) => (
            <div
              ref={prov.innerRef}
              {...prov.draggableProps}
              {...prov.dragHandleProps}
              data-basket-chip="true"
              data-basket-id={b.id}
              role="button"
              aria-pressed={sel}
              aria-label={sel ? `Selected chord ${b.chord.display}. Drag to move.` : `Chord ${b.chord.display}. Tap to select, then drag.`}
              onPointerDown={(e) => onChipPointerDown(b.id, e)}
              onPointerUp={(e) => onChipPointerUp(b.id, e)}
              onPointerCancel={() => (tapInfo.current = null)}
              style={{
                touchAction: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                ...prov.draggableProps.style,
              }}
            >
              <div
                style={{
                  cursor: snap.isDragging ? "grabbing" : "grab",
                  opacity: snap.isDragging ? 0.9 : 1,
                }}
              >
                <StaticChordChip chord={b.chord} dragging={snap.isDragging} selected={sel} />
              </div>
            </div>
          )}
        </Draggable>
      );
    });

  return (
    <div
      ref={ref}
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-paper-shade shadow-[0_-8px_24px_-12px_color-mix(in_oklch,var(--foreground)_20%,transparent)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-2 flex flex-col gap-2">
        {/* Row A: count + action buttons */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Basket · {basket.length}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {selectionSize > 0 && (
              <Button size="sm" variant="ghost" onClick={clearSelected} aria-label="Clear basket selection">
                <X className="h-4 w-4" /> Clear selection
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearSelected();
                clearBasket();
              }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
            {onSendToLyrics && (
              <Button size="sm" variant="outline" onClick={onSendToLyrics}>
                To Lyrics <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {onSendToProgressions && (
              <Button size="sm" onClick={onSendToProgressions}>
                To Progressions <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Row B: helper text on its own line */}
        <div className="text-[11px] text-muted-foreground/90">
          {selectionSize === 0 ? (
            "Tap to select · drag to move"
          ) : (
            <span className="text-primary font-medium">
              {selectionSize} selected · drag any to move {selectionSize > 1 ? "all" : ""}
            </span>
          )}
        </div>

        {/* Chips area */}
        <div className="flex-1 min-w-0">
          {draggable ? (
            <Droppable
              droppableId="basket-source"
              direction="horizontal"
              type="chord"
              isDropDisabled
              renderClone={(prov, _snap, rubric) => {
                // While a basket chip is being dragged, render a free-floating
                // clone that follows the finger. The original chip stays
                // mounted in the basket so drops act as COPIES, not moves.
                const item = basket[rubric.source.index];
                if (!item) return null;
                // Multi-drag badge: derived from the live selection store.
                const sel = useBasketSelectionStore.getState().selected;
                const count = sel.has(item.id) && sel.size > 1 ? sel.size : 1;
                return (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                    data-basket-chip="true"
                    style={{
                      touchAction: "none",
                      userSelect: "none",
                      cursor: "grabbing",
                      ...prov.draggableProps.style,
                    }}
                  >
                    <StaticChordChip chord={item.chord} dragging badgeCount={count} />
                  </div>
                );
              }}
            >
              {(prov) => (
                <div
                  ref={prov.innerRef}
                  {...prov.droppableProps}
                  data-droppable-id="basket-source"
                  className="flex flex-wrap items-center gap-2 py-1"
                >
                  {renderChips()}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          ) : (
            <div className="flex flex-wrap items-center gap-2 py-1">{renderChips()}</div>
          )}
        </div>
      </div>
    </div>
  );
});
