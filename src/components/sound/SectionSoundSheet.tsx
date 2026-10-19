import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PRESET_BY_VALUE, SOUND_PRESETS, resolveBass, resolveDrums, resolvePad, useSoundStore,
  type PartId, type SectionSound, type SoundPreset,
} from "@/store/sound";
import { ArpControls, BassControls, DrumControls } from "./SoundPanel";
import { Drum, Guitar, Piano, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const SONG = "__song";

const PART_LABEL: Record<PartId, string> = { pad: "Pad", bass: "Bass", drums: "Drums" };

/** Song (follow the mixer) / On / Off for one part in one section. */
function PartState({ part, own, songOn, onChange }: {
  part: PartId;
  own: boolean | undefined;
  songOn: boolean;
  onChange: (on: boolean | undefined) => void;
}) {
  const options: { value: boolean | undefined; label: string }[] = [
    { value: undefined, label: `Song (${songOn ? "on" : "off"})` },
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{PART_LABEL[part]} in this section</Label>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={`${PART_LABEL[part]} in this section`}>
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={own === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 rounded-md border border-border bg-background text-sm transition-colors",
              own === o.value ? "ring-2 ring-primary bg-accent font-semibold" : "hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Each part's sound and pattern for one section; anything left alone follows the song. */
export function SectionSoundSheet({ sectionId, label, open, onOpenChange }: {
  sectionId: string;
  label: string;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const s = useSoundStore();
  const [tab, setTab] = useState<PartId>("pad");
  const own: SectionSound = s.sectionSound[sectionId] ?? {};
  const pad = resolvePad(s, sectionId);
  const bass = resolveBass(s, sectionId);
  const drums = resolveDrums(s, sectionId);
  const set = s.setSectionPart;

  const reset = (part: PartId) => own[part] && (
    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => set(sectionId, part, null)}>
      <RotateCcw className="h-3.5 w-3.5" /> Use the song's {PART_LABEL[part].toLowerCase()}
    </Button>
  );
  const tabLabel = (part: PartId, Icon: typeof Piano) => (
    <span className="flex items-center gap-1.5">
      <Icon className="h-4 w-4" />
      {PART_LABEL[part]}
      {own[part] && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="changed for this section" />}
    </span>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label || "Section"} sound</SheetTitle>
          <SheetDescription>Changes here apply to this section only. Anything you leave alone follows the song.</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as PartId)} className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="pad" className="flex-1">{tabLabel("pad", Piano)}</TabsTrigger>
            <TabsTrigger value="bass" className="flex-1">{tabLabel("bass", Guitar)}</TabsTrigger>
            <TabsTrigger value="drums" className="flex-1">{tabLabel("drums", Drum)}</TabsTrigger>
          </TabsList>

          <TabsContent value="pad" className="mt-4 space-y-4">
            <PartState part="pad" own={own.pad?.on} songOn={s.mix.pad.on} onChange={(on) => set(sectionId, "pad", { on })} />
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sound</Label>
              <Select
                value={own.pad?.preset ?? SONG}
                onValueChange={(v) => set(sectionId, "pad", { preset: v === SONG ? undefined : (v as SoundPreset) })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SONG}>Song's sound ({PRESET_BY_VALUE[s.preset].label})</SelectItem>
                  {SOUND_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ArpControls arp={pad.arp} onChange={(patch) => set(sectionId, "pad", { arp: { ...own.pad?.arp, ...patch } })} />
            {reset("pad")}
          </TabsContent>

          <TabsContent value="bass" className="mt-4 space-y-4">
            <PartState part="bass" own={own.bass?.on} songOn={s.mix.bass.on} onChange={(on) => set(sectionId, "bass", { on })} />
            <BassControls bass={bass.settings} onChange={(patch) => set(sectionId, "bass", patch)} />
            {reset("bass")}
          </TabsContent>

          <TabsContent value="drums" className="mt-4 space-y-4">
            <PartState part="drums" own={own.drums?.on} songOn={s.mix.drums.on} onChange={(on) => set(sectionId, "drums", { on })} />
            <DrumControls drums={drums.settings} onChange={(patch) => set(sectionId, "drums", patch)} />
            {reset("drums")}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
