import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mic, MoreVertical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { songHasAudio, songMatches, songPreview, type RecentProject } from "@/lib/recent-projects";

interface Props {
  songs: RecentProject[];
  onOpen: (song: RecentProject) => void;
  onRemove: (song: RecentProject) => void;
  /** Rows shown before "Show all". */
  limit?: number;
}

/** The song library: name (or first lyric), when it was last touched, a recording badge, and search. */
export function RecentProjectsList({ songs, onOpen, onRemove, limit = 8 }: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const matches = songs.filter((s) => songMatches(s, query));
  const visible = showAll || query ? matches : matches.slice(0, limit);

  return (
    <div className="flex flex-col gap-2">
      {songs.length > 4 && (
        <label className="flex items-center gap-2 rounded-lg bg-[var(--paper-card)] shadow-[var(--shadow-recess)] px-3 h-10">
          <Search className="h-4 w-4 shrink-0 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and lyrics"
            aria-label="Search songs"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          />
        </label>
      )}
      <div className="rounded-xl bg-[var(--paper-card)] shadow-[var(--shadow-card)] divide-y divide-border/50 text-left">
        {songs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">No recent projects yet.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">No songs match "{query}".</p>
        ) : (
          visible.map((s) => {
            const preview = songPreview(s);
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2">
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(s)}>
                  <span className="flex items-center gap-2">
                    <h3 className="font-display text-lg truncate">{s.name}</h3>
                    {songHasAudio(s) && (
                      <>
                        <Mic className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />
                        <span className="sr-only">has recordings</span>
                      </>
                    )}
                  </span>
                  <span className="block text-xs text-ink-soft truncate">
                    {formatDistanceToNow(s.savedAt, { addSuffix: true })}
                    {preview && ` · ${preview}`}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`More actions for ${s.name}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRemove(s)}>Remove from recents</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>
      {!showAll && !query && matches.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-center text-sm font-semibold text-ink-soft hover:text-ink"
        >
          Show all {matches.length}
        </button>
      )}
    </div>
  );
}
