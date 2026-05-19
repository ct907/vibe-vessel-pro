import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Palette, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const SECTION_COLOR_KEYS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
  "slate",
] as const;

export type SectionColor = (typeof SECTION_COLOR_KEYS)[number];

/** Inline style background for a section using its color key. Falls back to --paper-shade-soft when no color. */
export function sectionTintStyle(color: string | null | undefined, _factor = 0.5): React.CSSProperties {
  if (!color || !SECTION_COLOR_KEYS.includes(color as SectionColor)) {
    return { backgroundColor: "var(--paper-shade-soft)" };
  }
  return {
    backgroundColor: `var(--section-tint-${color})`,
  };
}

interface Props {
  value?: string | null;
  onChange: (color: string | null) => void;
  className?: string;
}

export function SectionColorPicker({ value, onChange, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn("h-7 w-7 relative", className)}
          aria-label="Section color"
          title="Section color"
        >
          <Palette className="h-4 w-4 text-muted-foreground" />
          {value && (
            <span
              aria-hidden
              className="absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full ring-1 ring-border"
              style={{ backgroundColor: `var(--section-tint-${value})` }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {SECTION_COLOR_KEYS.map((c) => {
            const isActive = value === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                aria-label={`Set color ${c}`}
                title={c}
                className={cn(
                  "h-7 w-7 rounded-md border border-border transition-transform",
                  isActive && "ring-2 ring-primary scale-110",
                )}
                style={{ backgroundColor: `var(--section-tint-${c})` }}
              />
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-7 text-xs"
          onClick={() => onChange(null)}
        >
          <X className="h-3 w-3" /> Clear color
        </Button>
      </PopoverContent>
    </Popover>
  );
}
