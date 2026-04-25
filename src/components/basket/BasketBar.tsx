import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trash2 } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";

interface Props {
  onSendToLyrics?: () => void;
  onSendToProgressions?: () => void;
  /** When true, basket chips become Draggables inside the surrounding DragDropContext. */
  draggable?: boolean;
}

export function BasketBar({ onSendToLyrics, onSendToProgressions, draggable = false }: Props) {
  const { basket, clearBasket } = useSongStore();
  if (basket.length === 0) return null;

  const renderChips = () =>
    basket.map((b, i) => {
      if (!draggable) {
        return <ChordChip key={b.id} chord={b.chord} variant="ink" size="sm" />;
      }
      return (
        <Draggable key={b.id} draggableId={`basket:${b.id}`} index={i}>
          {(prov, snap) => (
            <div
              ref={prov.innerRef}
              {...prov.draggableProps}
              {...prov.dragHandleProps}
              style={{ touchAction: "none", ...prov.draggableProps.style }}
              className={cn(snap.isDragging && "opacity-90")}
            >
              <ChordChip chord={b.chord} variant="ink" size="sm" audition={false} />
            </div>
          )}
        </Draggable>
      );
    });

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-paper-shade/95 backdrop-blur shadow-[0_-8px_24px_-12px_hsl(var(--foreground)/0.2)]">
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">
          Basket · {basket.length}
        </span>

        <div className="flex-1 min-w-0 sm:overflow-x-auto">
          {draggable ? (
            <Droppable droppableId="basket-source" direction="horizontal" type="chord" isDropDisabled>
              {(prov) => (
                <div
                  ref={prov.innerRef}
                  {...prov.droppableProps}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-1"
                >
                  {renderChips()}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          ) : (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-1">{renderChips()}</div>
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
}
