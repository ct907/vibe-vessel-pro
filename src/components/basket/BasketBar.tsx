import { forwardRef } from "react";
import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { ArrowRight, GripVertical, Trash2 } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { ChordSymbol } from "@/lib/music/chords";
import { cn } from "@/lib/utils";

/**
 * Static, non-interactive chip used INSIDE basket Draggables. We can't reuse
 * <ChordChip> here because it renders a <button> with its own touch handlers
 * (audition + sustain-on-hold), which capture touchstart and prevent
 * @hello-pangea/dnd from initiating a drag on touch devices.
 */
function StaticChordChip({ chord, dragging }: { chord: ChordSymbol; dragging?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-mono-chord font-semibold select-none",
        "px-2.5 py-1 text-sm bg-chord-chip/50 text-chord-chip-foreground",
        dragging && "shadow-lg ring-2 ring-primary",
      )}
      style={{ pointerEvents: "none" }}
    >
      <GripVertical className="h-3 w-3 opacity-50" aria-hidden />
      {chord.display}
    </span>
  );
}

interface Props {
  onSendToLyrics?: () => void;
  onSendToProgressions?: () => void;
  /** When true, basket chips become Draggables inside the surrounding DragDropContext. */
  draggable?: boolean;
}

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
  if (basket.length === 0) return <div ref={ref} hidden />;

  const renderChips = () =>
    basket.map((b, i) => {
      if (!draggable) {
        return <ChordChip key={b.id} chord={b.chord} variant="ink" size="md" />;
      }
      return (
        <Draggable key={b.id} draggableId={`basket:${b.id}`} index={i}>
          {(prov, snap) => (
            <div
              ref={prov.innerRef}
              {...prov.draggableProps}
              {...prov.dragHandleProps}
              data-basket-chip="true"
              role="button"
              aria-label={`Drag chord ${b.chord.display}`}
              style={{
                touchAction: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                cursor: snap.isDragging ? "grabbing" : "grab",
                ...prov.draggableProps.style,
              }}
              className={cn(snap.isDragging && "opacity-90")}
            >
              <StaticChordChip chord={b.chord} dragging={snap.isDragging} />
            </div>
          )}
        </Draggable>
      );
    });

  return (
    <div
      ref={ref}
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-paper-shade/95 backdrop-blur shadow-[0_-8px_24px_-12px_hsl(var(--foreground)/0.2)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
          Basket · {basket.length}
        </span>

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
                    <StaticChordChip chord={item.chord} dragging />
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

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={clearBasket}
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
    </div>
  );
});
