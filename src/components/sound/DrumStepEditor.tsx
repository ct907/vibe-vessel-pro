import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DRUM_LANES, GROOVE_BY_ID, LANE_LABELS, grooveLanes, stepsPerBar, type DrumLane, type LanePattern } from "@/lib/music/grooves";
import { drumDensity } from "@/lib/music/arrangement";
import { previewDrums } from "@/lib/music/audio";
import { useSongStore } from "@/store/song";
import type { DrumSettings, LaneShape } from "@/store/sound";
import { Minus, Play, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tapping a step cycles: off → always → from 1/4 → from 1/8 → only at 1/16 → off. */
const NEXT: Record<string, string> = { ".": "1", "1": "2", "2": "3", "3": "4", "4": "." };
const LEVEL_NAME = ["", "always", "from 1/4", "from 1/8", "only at 1/16"];
const LEVEL_MIX = [0, 100, 70, 45, 25];
const levelFill = (level: number) => ({ backgroundColor: `color-mix(in oklch, var(--primary) ${LEVEL_MIX[level]}%, transparent)` });

const SHAPES: { value: LaneShape; label: string; Icon: typeof Minus }[] = [
  { value: "flat", label: "Steady", Icon: Minus },
  { value: "build", label: "Build up", Icon: TrendingUp },
  { value: "fade", label: "Fade down", Icon: TrendingDown },
];

const fmtOffset = (n: number) => (Math.abs(n) < 0.05 ? "even" : `${n > 0 ? "+" : "−"}${Math.round(Math.abs(n) * 100)}%`);

export function DrumStepEditor({ drums, onChange, open, onOpenChange }: {
  drums: DrumSettings;
  onChange: (patch: Partial<DrumSettings>) => void;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const beatsPerBar = useSongStore((s) => s.meta.beatsPerBar);
  const beatUnit = useSongStore((s) => s.meta.beatUnit);
  const [openLane, setOpenLane] = useState<DrumLane | null>(null);
  const [bar, setBar] = useState(0);
  const perBar = stepsPerBar(beatsPerBar, beatUnit);
  const perBeat = 16 / beatUnit;
  const lanes: LanePattern = drums.custom ?? grooveLanes(drums.genre, beatsPerBar, beatUnit).lanes;
  const bars = Math.max(1, ...Object.values(lanes).map((p) => Math.ceil((p?.length ?? 0) / perBar)));
  const shownBar = Math.min(bar, bars - 1);
  const density = drumDensity(drums);

  const stepsOf = (lane: DrumLane) => {
    const p = lanes[lane] ?? "";
    return Array.from({ length: bars * perBar }, (_, i) => (p.length ? p[i % p.length] : "."));
  };
  const toggle = (lane: DrumLane, i: number) => {
    const steps = stepsOf(lane);
    steps[i] = NEXT[steps[i]] ?? ".";
    const next: LanePattern = {};
    for (const l of DRUM_LANES) {
      const s = l === lane ? steps.join("") : lanes[l];
      if (s && /[1-4]/.test(s)) next[l] = s;
    }
    onChange({ custom: next });
  };
  const laneEnergy = (lane: DrumLane) => drums.lanes?.[lane] ?? { offset: 0, shape: "flat" as LaneShape };
  const setLaneEnergy = (lane: DrumLane, patch: Partial<{ offset: number; shape: LaneShape }>) =>
    onChange({ lanes: { ...drums.lanes, [lane]: { ...laneEnergy(lane), ...patch } } });
  // What a lane plays mid-section, for fading out the steps Energy leaves out.
  const laneDensity = (lane: DrumLane) => Math.max(0, Math.min(4, density + Math.round(laneEnergy(lane).offset * 2)));
  const ordered = [...DRUM_LANES].sort((a, b) => Number(!lanes[a]) - Number(!lanes[b]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Groove
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => void previewDrums(drums)} aria-label="Preview groove">
              <Play className="h-4 w-4" />
            </Button>
          </SheetTitle>
          <SheetDescription>
            {drums.custom ? "Your groove" : `${GROOVE_BY_ID[drums.genre]?.label ?? "Basic"}`} · tap a step to set when it plays.
            Faded steps are left out at this Energy. Tap a drum's name to make it busier or calmer, or build it up across the section.
          </SheetDescription>
        </SheetHeader>

        {bars > 1 && (
          <div className="mt-3 flex gap-1" role="tablist" aria-label="Bar">
            {Array.from({ length: bars }, (_, b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={shownBar === b}
                onClick={() => setBar(b)}
                className={cn("h-8 rounded-md border border-border px-3 text-sm", shownBar === b ? "ring-2 ring-primary bg-accent font-semibold" : "hover:bg-accent")}
              >
                Bar {b + 1}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 -mx-1 overflow-x-auto pb-2">
          <div className="inline-flex min-w-full flex-col gap-1 px-1">
            {ordered.map((lane) => {
              const steps = stepsOf(lane).slice(shownBar * perBar, (shownBar + 1) * perBar);
              const e = laneEnergy(lane);
              const changed = Math.abs(e.offset) >= 0.05 || e.shape !== "flat";
              const playsUpTo = laneDensity(lane);
              return (
                <div key={lane} className={cn(!lanes[lane] && openLane !== lane && "opacity-60")}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOpenLane(openLane === lane ? null : lane)}
                      aria-expanded={openLane === lane}
                      className={cn(
                        "sticky left-0 z-10 flex h-8 w-[4.5rem] shrink-0 items-center gap-1 rounded-md bg-background pl-1 text-left text-xs font-semibold",
                        openLane === lane && "text-primary",
                      )}
                    >
                      <span className="truncate">{LANE_LABELS[lane]}</span>
                      {changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="energy changed" />}
                    </button>
                    {steps.map((ch, i) => {
                      const level = Number(ch) || 0;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggle(lane, shownBar * perBar + i)}
                          aria-label={`${LANE_LABELS[lane]} step ${i + 1}: ${level ? LEVEL_NAME[level] : "off"}`}
                          style={level ? levelFill(level) : undefined}
                          className={cn(
                            "h-8 w-7 shrink-0 rounded-[5px] border transition-colors",
                            i % perBeat === 0 && i > 0 && "ml-1",
                            level ? "border-primary" : "border-border bg-paper-shade/50 hover:bg-accent",
                            level > playsUpTo && "opacity-35",
                          )}
                        />
                      );
                    })}
                  </div>
                  {openLane === lane && (
                    <div className="sticky left-0 mt-1 mb-2 w-[min(100%,22rem)] space-y-2 rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="uppercase tracking-wide text-muted-foreground">{LANE_LABELS[lane]} energy</span>
                        <span className="font-mono-chord tabular-nums">{fmtOffset(e.offset)}</span>
                      </div>
                      <Slider
                        min={-1}
                        max={1}
                        step={0.05}
                        value={[e.offset]}
                        onValueChange={([v]) => setLaneEnergy(lane, { offset: v })}
                        aria-label={`${LANE_LABELS[lane]} energy`}
                      />
                      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={`${LANE_LABELS[lane]} across the section`}>
                        {SHAPES.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={e.shape === value}
                            onClick={() => setLaneEnergy(lane, { shape: value })}
                            className={cn(
                              "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border text-xs",
                              e.shape === value ? "ring-2 ring-primary bg-accent font-semibold" : "hover:bg-accent",
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />{label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {[1, 2, 3, 4].map((l) => (
            <span key={l} className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-[3px] border border-primary" style={levelFill(l)} />{LEVEL_NAME[l]}
            </span>
          ))}
        </div>

        {(drums.custom || drums.lanes) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {drums.custom && (
              <Button variant="outline" size="sm" onClick={() => onChange({ custom: undefined })}>
                <RotateCcw className="h-3.5 w-3.5" /> Back to {GROOVE_BY_ID[drums.genre]?.label ?? "the genre"}
              </Button>
            )}
            {drums.lanes && (
              <Button variant="outline" size="sm" onClick={() => onChange({ lanes: undefined })}>
                <RotateCcw className="h-3.5 w-3.5" /> Even out every drum
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
