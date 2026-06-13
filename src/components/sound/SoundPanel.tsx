import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSoundStore, SOUND_PRESETS, PRESET_BY_VALUE, type SoundPreset, type ArpPattern, type ArpRepeat, type BassMode, type BassRepeat } from "@/store/sound";
import { ensureAudio, playChord } from "@/lib/music/audio";
import { parseChord } from "@/lib/music/chords";
import { usePlaybackStore } from "@/store/playback";
import {
  Music2, RotateCcw, Play, Square, ChevronDown,
  ListIndentIncrease, MoveUpRight, MoveDownRight, TrendingUp, TrendingDown, Dices,
  LineStyle, Circle, ListEnd, ChartBarStacked, ListRestart,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

const fmtSec = (s: number) => (s < 1 ? `${Math.round(s * 1000)}ms` : `${s.toFixed(2)}s`);
const fmtDb = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} dB`;
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
const fmtHz = (n: number) => `${n.toFixed(2)} Hz`;

function Row({ label, value, children }: { label: React.ReactNode; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        {value !== undefined && (
          <span className="font-mono-chord text-xs text-foreground tabular-nums">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border pt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function SoundPanel({ open, onOpenChange }: Props) {
  const s = useSoundStore();
  const presetDef = PRESET_BY_VALUE[s.preset];
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const preview = async () => {
    await ensureAudio();
    const c = parseChord("Cmaj7");
    if (c) void playChord(c, 1.6);
  };

  const togglePlay = () => {
    window.dispatchEvent(new CustomEvent(isPlaying ? "lovable:request-stop" : "lovable:request-play"));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Music2 className="h-[1em] w-[1em]" />
            <span>Sound</span>
            <Button
              size="icon"
              variant="outline"
              className="ml-1 h-8 w-8"
              onClick={togglePlay}
              aria-label={isPlaying ? "Stop" : "Play"}
            >
              {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {/* Voice — preset, timbre, master, BPM ramp */}
          <section className="space-y-3">
            <Row label="Preset">
              <div className="flex items-center gap-2">
                <Select value={s.preset} onValueChange={(v) => s.setPreset(v as SoundPreset)}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" className="h-9 w-9" onClick={preview} aria-label="Preview chord">
                  <Play className="h-4 w-4" />
                </Button>
              </div>
            </Row>

            <Row label={presetDef.timbreLabel} value={fmtPct(s.timbre)}>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[s.timbre]}
                onValueChange={([v]) => s.setTimbre(v)}
              />
            </Row>

            <Row label="Master volume" value={fmtDb(s.volume)}>
              <Slider min={-40} max={6} step={0.5} value={[s.volume]} onValueChange={([v]) => s.setVolume(v)} />
            </Row>

            <div className="flex items-center justify-between pt-1">
              <Label htmlFor="bpm-ramp" className="text-xs uppercase tracking-wide text-muted-foreground">
                Smooth BPM changes
              </Label>
              <Switch
                id="bpm-ramp"
                checked={s.bpmRamp}
                onCheckedChange={(b) => s.setBpmRamp(!!b)}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="space-y-0.5">
                <Label htmlFor="high-latency-mode" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Bluetooth mode
                </Label>
                <p className="text-[10px] text-muted-foreground/60">Larger audio buffer — reduces crackling on Bluetooth. Takes effect on next audio start.</p>
              </div>
              <Switch
                id="high-latency-mode"
                checked={s.highLatencyMode}
                onCheckedChange={(b) => s.setHighLatencyMode(!!b)}
              />
            </div>
          </section>

          <Section title="Envelope (ADSR)">
            <Row label="Attack" value={fmtSec(s.adsr.attack)}>
              <Slider min={0.001} max={4} step={0.005} value={[s.adsr.attack]} onValueChange={([v]) => s.setADSR({ attack: v })} />
            </Row>
            <Row label="Decay" value={fmtSec(s.adsr.decay)}>
              <Slider min={0} max={4} step={0.01} value={[s.adsr.decay]} onValueChange={([v]) => s.setADSR({ decay: v })} />
            </Row>
            <Row label="Sustain" value={fmtPct(s.adsr.sustain)}>
              <Slider min={0} max={1} step={0.01} value={[s.adsr.sustain]} onValueChange={([v]) => s.setADSR({ sustain: v })} />
            </Row>
            <Row label="Release" value={fmtSec(s.adsr.release)}>
              <Slider min={0.01} max={6} step={0.01} value={[s.adsr.release]} onValueChange={([v]) => s.setADSR({ release: v })} />
            </Row>
          </Section>

          <Section title="Arpeggio" defaultOpen={false}>
            <ArpControls />
          </Section>

          <Section title="3-band EQ" defaultOpen={false}>
            <Row label="Low" value={fmtDb(s.eq.low)}>
              <Slider min={-24} max={12} step={0.5} value={[s.eq.low]} onValueChange={([v]) => s.setEQ({ low: v })} />
            </Row>
            <Row label="Mid" value={fmtDb(s.eq.mid)}>
              <Slider min={-24} max={12} step={0.5} value={[s.eq.mid]} onValueChange={([v]) => s.setEQ({ mid: v })} />
            </Row>
            <Row label="High" value={fmtDb(s.eq.high)}>
              <Slider min={-24} max={12} step={0.5} value={[s.eq.high]} onValueChange={([v]) => s.setEQ({ high: v })} />
            </Row>
          </Section>

          <Section title="Chorus" defaultOpen={false}>
            <Row label="Mix" value={fmtPct(s.fx.chorusWet)}>
              <Slider min={0} max={1} step={0.01} value={[s.fx.chorusWet]} onValueChange={([v]) => s.setFX({ chorusWet: v })} />
            </Row>
            <Row label="Rate" value={fmtHz(s.fx.chorusRate)}>
              <Slider min={0.1} max={6} step={0.05} value={[s.fx.chorusRate]} onValueChange={([v]) => s.setFX({ chorusRate: v })} />
            </Row>
            <Row label="Depth" value={fmtPct(s.fx.chorusDepth)}>
              <Slider min={0} max={1} step={0.01} value={[s.fx.chorusDepth]} onValueChange={([v]) => s.setFX({ chorusDepth: v })} />
            </Row>
          </Section>

          <Section title="Delay" defaultOpen={false}>
            <Row label="Mix" value={fmtPct(s.fx.delayWet)}>
              <Slider min={0} max={1} step={0.01} value={[s.fx.delayWet]} onValueChange={([v]) => s.setFX({ delayWet: v })} />
            </Row>
            <div className="flex items-center justify-between">
              <Label htmlFor="delay-sync" className="text-xs uppercase tracking-wide text-muted-foreground">
                Sync to BPM
              </Label>
              <Switch
                id="delay-sync"
                checked={s.fx.delaySync}
                onCheckedChange={(b) => s.setFX({ delaySync: !!b })}
              />
            </div>
            {s.fx.delaySync ? (
              <Row label="Division">
                <Select
                  value={s.fx.delayDivision}
                  onValueChange={(v) => s.setFX({ delayDivision: v as typeof s.fx.delayDivision })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1/4">1/4</SelectItem>
                    <SelectItem value="1/8.">1/8 dotted</SelectItem>
                    <SelectItem value="1/8">1/8</SelectItem>
                    <SelectItem value="1/8t">1/8 triplet</SelectItem>
                    <SelectItem value="1/16">1/16</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            ) : (
              <Row label="Time" value={fmtSec(s.fx.delayTime)}>
                <Slider min={0} max={1} step={0.01} value={[s.fx.delayTime]} onValueChange={([v]) => s.setFX({ delayTime: v })} />
              </Row>
            )}
            <Row label="Feedback" value={fmtPct(s.fx.delayFeedback)}>
              <Slider min={0} max={0.9} step={0.01} value={[s.fx.delayFeedback]} onValueChange={([v]) => s.setFX({ delayFeedback: v })} />
            </Row>
          </Section>

          <Section title="Reverb" defaultOpen={false}>
            <Row label="Mix" value={fmtPct(s.fx.reverbWet)}>
              <Slider min={0} max={1} step={0.01} value={[s.fx.reverbWet]} onValueChange={([v]) => s.setFX({ reverbWet: v })} />
            </Row>
            <Row label="Decay" value={fmtSec(s.fx.reverbDecay)}>
              <Slider min={0.5} max={8} step={0.1} value={[s.fx.reverbDecay]} onValueChange={([v]) => s.setFX({ reverbDecay: v })} />
            </Row>
          </Section>

          <div className="pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={s.reset} className="w-full">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PATTERN_OPTIONS: { value: ArpPattern; label: string; Icon: typeof ListIndentIncrease }[] = [
  { value: "all",     label: "All",                Icon: ListIndentIncrease },
  { value: "asc",     label: "Ascending",          Icon: MoveUpRight },
  { value: "desc",    label: "Descending",         Icon: MoveDownRight },
  { value: "ascDesc", label: "Asc then Desc",      Icon: TrendingUp },
  { value: "descAsc", label: "Desc then Asc",      Icon: TrendingDown },
  { value: "random",  label: "Random",             Icon: Dices },
];

const REPEAT_OPTIONS: ArpRepeat[] = ["1", "1/2", "1/4", "1/8", "1/16", "1/32"];
const BASS_REPEAT_OPTIONS: BassRepeat[] = ["1", "1/2", "1/4", "1/8", "1/16"];

const BASS_OPTIONS: { value: BassMode; label: string; Icon: typeof Circle }[] = [
  { value: "off",     label: "Off",        Icon: Circle },
  { value: "bass",    label: "Bass",       Icon: ListEnd },
  { value: "bassArp", label: "Bass + Arp", Icon: ChartBarStacked },
];

function IconRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; Icon: typeof Circle }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1">
      {options.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex items-center justify-center h-9 rounded-md border border-border bg-background text-foreground transition-colors",
            value === v ? "ring-2 ring-primary bg-accent" : "hover:bg-accent",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function TextRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1">
      {options.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center justify-center h-9 rounded-md border border-border bg-background text-foreground font-mono-chord text-xs transition-colors tabular-nums",
            value === v ? "ring-2 ring-primary bg-accent" : "hover:bg-accent",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ArpControls() {
  const arp = useSoundStore((s) => s.arp);
  const setArp = useSoundStore((s) => s.setArp);
  const showBassRepeat = arp.bassMode !== "off";
  return (
    <div className="space-y-3">
      <Row label={<><ListIndentIncrease className="inline h-3 w-3 mr-1" />Pattern</>}>
        <IconRow options={PATTERN_OPTIONS} value={arp.pattern} onChange={(v) => setArp({ pattern: v })} />
      </Row>
      <Row label={<><LineStyle className="inline h-3 w-3 mr-1" />Pattern Repeat</>}>
        <TextRow options={REPEAT_OPTIONS} value={arp.repeat} onChange={(v) => setArp({ repeat: v })} />
      </Row>
      <Row label={<><ListEnd className="inline h-3 w-3 mr-1" />Bass Note</>}>
        <IconRow options={BASS_OPTIONS} value={arp.bassMode} onChange={(v) => setArp({ bassMode: v })} />
      </Row>
      {showBassRepeat && (
        <Row label={<><ListRestart className="inline h-3 w-3 mr-1" />Bass Repeat</>}>
          <TextRow options={BASS_REPEAT_OPTIONS} value={arp.bassRepeat} onChange={(v) => setArp({ bassRepeat: v })} />
        </Row>
      )}
    </div>
  );
}

export function SoundPanelTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} aria-label="Sound settings">
      <Music2 className="h-4 w-4" /> Sound
    </Button>
  );
}
