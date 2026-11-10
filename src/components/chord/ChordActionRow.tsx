import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckSquare, Move, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Edit / Move / Select / Delete for the tapped chord, as a row under the chord
 * row centred on the chip. Pinned to a chip's corners these crowded together on
 * short chords like "C" and were hard to hit.
 */
export function ChordActionRow({
  chipSelector,
  onEdit,
  onMove,
  onSelect,
  onDelete,
  children,
}: {
  /** Selector for the tapped chip, to centre the row under it. */
  chipSelector: string;
  onEdit: () => void;
  onMove: () => void;
  /** Opens the move menu already in multi-select, seeded with this chord. */
  onSelect: () => void;
  onDelete: () => void;
  /** Extra controls placed before the actions (e.g. desktop nudge arrows). */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  // Measure every render: the chip moves when chords are nudged, reflow, or the
  // row resizes. Setting the same rounded value again bails out, so no loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const row = ref.current;
    const parent = row?.parentElement;
    const chip = document.querySelector<HTMLElement>(chipSelector);
    if (!row || !parent || !chip) return;
    const p = parent.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const centred = c.left + c.width / 2 - p.left - row.offsetWidth / 2;
    setLeft(Math.round(Math.max(0, Math.min(centred, p.width - row.offsetWidth))));
  });

  // When a chord is picked near the bottom of the screen, bring its actions up
  // from behind the sticky bottom toolbar.
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    const limit = window.innerHeight - 72;
    if (r && r.bottom > limit) window.scrollBy({ top: r.bottom - limit, behavior: "smooth" });
  }, [chipSelector]);

  const action = (label: string, icon: ReactNode, onClick: () => void, destructive?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-bold shadow-sm transition-[filter] active:brightness-95",
        destructive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      data-chord-keep
      role="toolbar"
      aria-label="Chord actions"
      className="relative z-20 my-1 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover p-1 shadow-md"
      style={{ marginLeft: left }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      {action("Edit", <Pencil className="h-3.5 w-3.5" />, onEdit)}
      {action("Move", <Move className="h-3.5 w-3.5" />, onMove)}
      {action("Select", <CheckSquare className="h-3.5 w-3.5" />, onSelect)}
      {action("Delete", <Trash2 className="h-3.5 w-3.5" />, onDelete, true)}
    </div>
  );
}
