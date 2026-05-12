import { useLayoutEffect, useRef } from "react";
import { useSongStore } from "@/store/song";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Brush, ChevronsDownUp, ChevronsUpDown, ArrowUpDown } from "lucide-react";

interface Props {
  /** Which tab is currently active — drives which menu items are enabled. */
  activeTab: "lyrics" | "chords" | "progressions";
  sortMode: null | "lyrics" | "progressions";
  onToggleSort: () => void;
}

export function SongTitleHeader({ activeTab, sortMode, onToggleSort }: Props) {
  const meta = useSongStore((s) => s.meta);
  const setTitle = useSongStore((s) => s.setTitle);
  const sections = useSongStore((s) => s.sections);
  const setAllSectionsCollapsed = useSongStore((s) => s.setAllSectionsCollapsed);
  const formatChordsInSong = useSongStore((s) => s.formatChordsInSong);

  const taRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [meta.title]);

  const allCollapsed = sections.length > 0 && sections.every((s) => s.collapsed);
  const canFormat = sections.some((s) => s.lines.some((l) => l.chords.length > 0));
  const showSort = activeTab === "lyrics" || activeTab === "progressions";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4">
      <div className="flex items-start gap-2">
        <textarea
          ref={taRef}
          value={meta.title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          placeholder="Untitled song"
          rows={1}
          className="flex-1 min-w-0 resize-none overflow-hidden bg-transparent border-0 outline-none font-display text-2xl leading-tight text-foreground placeholder:text-muted-foreground/50 px-0 py-1 break-words"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="btn-sculpt-cream inline-flex items-center justify-center rounded-lg h-9 w-9 mt-1 shrink-0"
              aria-label="Song actions"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={activeTab !== "lyrics" || !canFormat}
              onClick={() => formatChordsInSong()}
            >
              <Brush className="h-4 w-4" /> Format chords
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={activeTab !== "lyrics"}
              onClick={() => setAllSectionsCollapsed(!allCollapsed)}
            >
              {allCollapsed ? (
                <>
                  <ChevronsUpDown className="h-4 w-4" /> Expand all sections
                </>
              ) : (
                <>
                  <ChevronsDownUp className="h-4 w-4" /> Collapse all sections
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!showSort} onClick={onToggleSort}>
              <ArrowUpDown className="h-4 w-4" />
              {sortMode === activeTab ? "Done sorting" : "Sort sections"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
