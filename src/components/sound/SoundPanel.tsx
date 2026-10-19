import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useSoundStore, SOUND_PRESETS, PRESET_BY_VALUE, BASS_SOUNDS,
  type SoundPreset, type ArpPattern, type ArpRepeat, type BassRepeat, type BassPattern, type BassSound, type PartId,
} from "@/store/sound";
import { ensureAudio, playChord, previewBass, previewDrums } from "@/lib/music/audio";
import { parseChord } from "@/lib/music/chords";
import { drumDensity, drumVelocity } from "@/lib/music/arrangement";
import { GROOVES, grooveFits, type DrumGenre } from "@/lib/music/grooves";
import { DRUM_KITS, type DrumKit } from "@/lib/audio/drums";
import { usePlaybackStore } from "@/store/playback";
import { useSongStore } from "@/store/song";
import {
  Music2, RotateCcw, Play, Square, ChevronDown,
  ListIndentIncrease, MoveUpRight, MoveDownRight, TrendingUp, TrendingDown, Dices,
  LineStyle, Circle, Piano, Guitar, Drum, Minus, Activity, ArrowUpDown, Footprints,
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
  const [tab, setTab] = useState<PartId>("pad");
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
          <section className="space-y-3">
            <Row label="Master volume" value={fmtDb(s.volume)}>
              <Slider min={-40} max={6} step={0.5} value={[s.volume]} onValueChange={([v]) => s.setVolume(v)} />
            </Row>
            <Mixer />
          </section>

          <Tabs value={tab} onValueChange={(v) => setTab(v as PartId)}>
            <TabsList className="w-full">
              <TabsTrigger value="pad" className="flex-1 gap-1.5"><Piano className="h-4 w-4" />Pad</TabsTrigger>
              <TabsTrigger value="bass" className="flex-1 gap-1.5"><Guitar className="h-4 w-4" />Bass</TabsTrigger>
              <TabsTrigger value="drums" className="flex-1 gap-1.5"><Drum className="h-4 w-4" />Drums</TabsTrigger>
            </TabsList>

            <TabsContent value="pad" className="mt-4 space-y-4">
              <section className="space-y-3">
                <Row label="Sound">
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

            </TabsContent>

            <TabsContent value="bass" className="mt-4 space-y-4">
              <BassControls />
            </TabsContent>

            <TabsContent value="drums" className="mt-4 space-y-4">
              <DrumControls />
            </TabsContent>
          </Tabs>

          <Section title="Playback" defaultOpen={false}>
            <div className="flex items-center justify-between">
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
const BASS_RATE_OPTIONS: BassRepeat[] = ["1", "1/2", "1/4", "1/8", "1/16"];

const BASS_PATTERN_OPTIONS: { value: BassPattern; label: string; Icon: typeof Circle }[] = [
  { value: "hold",      label: "Hold root",            Icon: Minus },
  { value: "pulse",     label: "Pulse",                Icon: Activity },
  { value: "rootFifth", label: "Root – fifth",         Icon: ArrowUpDown },
  { value: "octave",    label: "Octaves",              Icon: TrendingUp },
  { value: "approach",  label: "Walk into next chord", Icon: Footprints },
  { value: "followKick", label: "Follow the kick",     Icon: Drum },
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
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  /** Shown instead of the values, indexed by value. */
  labels?: string[];
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
          {labels ? labels[Number(v)] : v}
        </button>
      ))}
    </div>
  );
}

function ArpControls() {
  const arp = useSoundStore((s) => s.arp);
  const setArp = useSoundStore((s) => s.setArp);
  return (
    <div className="space-y-3">
      <Row label={<><ListIndentIncrease className="inline h-3 w-3 mr-1" />Pattern</>}>
        <IconRow options={PATTERN_OPTIONS} value={arp.pattern} onChange={(v) => setArp({ pattern: v })} />
      </Row>
      <Row label={<><LineStyle className="inline h-3 w-3 mr-1" />Pattern Repeat</>}>
        <TextRow options={REPEAT_OPTIONS} value={arp.repeat} onChange={(v) => setArp({ repeat: v })} />
      </Row>
    </div>
  );
}

const PARTS: { id: PartId; label: string; Icon: typeof Circle }[] = [
  { id: "pad", label: "Pad", Icon: Piano },
  { id: "bass", label: "Bass", Icon: Guitar },
  { id: "drums", label: "Drums", Icon: Drum },
];

/** On/off and level for each part. */
function Mixer() {
  const mix = useSoundStore((s) => s.mix);
  const setMix = useSoundStore((s) => s.setMix);
  return (
    <div className="space-y-2 rounded-lg border border-border bg-paper-shade/40 p-2.5">
      {PARTS.map(({ id, label, Icon }) => (
        <div key={id} className="flex items-center gap-2.5">
          <Switch
            checked={mix[id].on}
            onCheckedChange={(b) => setMix(id, { on: !!b })}
            aria-label={`${label} on`}
          />
          <span className={cn("flex w-14 items-center gap-1 text-sm font-semibold", !mix[id].on && "text-muted-foreground")}>
            <Icon className="h-3.5 w-3.5" />{label}
          </span>
          <Slider
            className="flex-1"
            min={-30}
            max={6}
            step={0.5}
            value={[mix[id].volume]}
            onValueChange={([v]) => setMix(id, { volume: v })}
            disabled={!mix[id].on}
            aria-label={`${label} volume`}
          />
          <span className="w-14 text-right font-mono-chord text-xs tabular-nums">{fmtDb(mix[id].volume)}</span>
        </div>
      ))}
    </div>
  );
}

function PartOff({ part, label }: { part: PartId; label: string }) {
  const on = useSoundStore((s) => s.mix[part].on);
  const setMix = useSoundStore((s) => s.setMix);
  if (on) return null;
  return (
    <button
      type="button"
      onClick={() => setMix(part, { on: true })}
      className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
    >
      The {label} part is off. <span className="font-semibold text-foreground">Turn it on</span>
    </button>
  );
}

const DENSITY_LABELS = ["", "1/2", "1/4", "1/8", "1/16"];

function DrumControls() {
  const drums = useSoundStore((s) => s.drums);
  const setDrums = useSoundStore((s) => s.setDrums);
  const beatsPerBar = useSongStore((s) => s.meta.beatsPerBar);
  const beatUnit = useSongStore((s) => s.meta.beatUnit);
  const [fineOpen, setFineOpen] = useState(drums.density != null || drums.velocity != null);
  const genres = GROOVES.filter((g) => grooveFits(g, beatsPerBar, beatUnit));
  const genre = genres.some((g) => g.id === drums.genre) ? drums.genre : "basic";
  const density = drumDensity(drums);
  const velocity = drumVelocity(drums);
  return (
    <div className="space-y-3">
      <PartOff part="drums" label="Drums" />
      <Row label="Groove">
        <div className="flex items-center gap-2">
          <Select value={genre} onValueChange={(v) => setDrums({ genre: v as DrumGenre, custom: undefined })}>
            <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {genres.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => void previewDrums()} aria-label="Preview drums">
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </Row>
      <Row label="Kit">
        <Select value={drums.kit} onValueChange={(v) => setDrums({ kit: v as DrumKit })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DRUM_KITS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Energy" value={fmtPct(drums.energy)}>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[drums.energy]}
          onValueChange={([v]) => setDrums({ energy: v, density: undefined, velocity: undefined })}
          aria-label="Energy"
        />
      </Row>
      <Collapsible open={fineOpen} onOpenChange={setFineOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between text-left text-xs uppercase tracking-wide text-muted-foreground" aria-expanded={fineOpen}>
            <span>Fine-tune{drums.density != null || drums.velocity != null ? " · custom" : ""}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", fineOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <Row label="Density · closest notes" value={drums.density == null ? "follows Energy" : undefined}>
            <TextRow
              options={["1", "2", "3", "4"]}
              value={String(density)}
              labels={DENSITY_LABELS}
              onChange={(v) => setDrums({ density: Number(v) })}
            />
          </Row>
          <Row label="Velocity" value={drums.velocity == null ? `${fmtPct(velocity)} · follows Energy` : fmtPct(velocity)}>
            <Slider min={0} max={1} step={0.01} value={[velocity]} onValueChange={([v]) => setDrums({ velocity: v })} aria-label="Velocity" />
          </Row>
          {(drums.density != null || drums.velocity != null) && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setDrums({ density: undefined, velocity: undefined })}>
              <RotateCcw className="h-3.5 w-3.5" /> Follow Energy again
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function BassControls() {
  const bass = useSoundStore((s) => s.bass);
  const setBass = useSoundStore((s) => s.setBass);
  const def = BASS_SOUNDS.find((b) => b.value === bass.sound) ?? BASS_SOUNDS[0];
  return (
    <div className="space-y-3">
      <PartOff part="bass" label="Bass" />
      <Row label="Sound">
        <div className="flex items-center gap-2">
          <Select value={bass.sound} onValueChange={(v) => setBass({ sound: v as BassSound })}>
            <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BASS_SOUNDS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => void previewBass()} aria-label="Preview bass">
            <Play className="h-4 w-4" />
          </Button>
        </div>
      </Row>
      <Row label={def.toneLabel} value={fmtPct(bass.tone)}>
        <Slider min={0} max={1} step={0.01} value={[bass.tone]} onValueChange={([v]) => setBass({ tone: v })} />
      </Row>
      <Row label="Pattern" value={BASS_PATTERN_OPTIONS.find((o) => o.value === bass.pattern)?.label}>
        <IconRow options={BASS_PATTERN_OPTIONS} value={bass.pattern} onChange={(v) => setBass({ pattern: v })} />
      </Row>
      {bass.pattern !== "hold" && bass.pattern !== "followKick" && (
        <Row label="Rate">
          <TextRow options={BASS_RATE_OPTIONS} value={bass.rate} onChange={(v) => setBass({ rate: v })} />
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
