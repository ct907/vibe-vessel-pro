import { useSongStore } from "@/store/song";
import { ChordChip } from "@/components/chord/ChordChip";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trash2, X } from "lucide-react";

interface Props {
  onSendToLyrics?: () => void;
  onSendToProgressions?: () => void;
}

export function BasketBar({ onSendToLyrics, onSendToProgressions }: Props) {
  const { basket, removeFromBasket, clearBasket } = useSongStore();
  if (basket.length === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-paper-shade/95 backdrop-blur shadow-[0_-8px_24px_-12px_hsl(var(--foreground)/0.2)]">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Basket · {basket.length}
        </span>

        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-2 py-1">
            {basket.map((b) => (
              <div key={b.id} className="group inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5">
                <ChordChip chord={b.chord} variant="ink" size="sm" />
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeFromBasket(b.id)}
                  aria-label="Remove from basket"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={clearBasket}>
            <Trash2 className="h-4 w-4" /> Clear
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
