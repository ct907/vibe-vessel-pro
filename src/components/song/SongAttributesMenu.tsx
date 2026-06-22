import { useEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Check, ChevronDown } from "lucide-react";
import { useSongStore } from "@/store/song";
import { useMetronomeStore } from "@/store/metronome";
import { previewClick } from "@/lib/audio/metronome";
import { usePlaybackStore } from "@/store/playback";
import { ALL_ROOTS, MODE_LABEL, type Mode } from "@/lib/music/chords";
import { useOnboardingStore } from "@/store/onboarding";
import { AnchoredCoachMark } from "@/components/onboarding/OnboardingCoachMark";

const TIME_SIGS = ["2/4", "3/4", "4/4", "5/4", "6/4", "6/8", "7/8", "9/8", "12/8"];

const fmtOffset = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function SongAttributesMenu() {
  const meta = useSongStore((s) => s.meta);
  const setKey = useSongStore((s) => s.setKey);
  const setBpm = useSongStore((s) => s.setBpm);
  const setTimeSignature = useSongStore((s) => s.setTimeSignature);
  const transposeSong = useSongStore((s) => s.transposeSong);
  const metronome = useMetronomeStore();
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const onboarding = useOnboardingStore();
  const [bpmDraft, setBpmDraft] = useState(String(meta.bpm));
  const [transposeOffset, setTransposeOffset] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTimeSig, setPendingTimeSig] = useState<{ n: number; d: number } | null>(null);
  const hasPlacedChords = useSongStore((s) =>
    s.sections.some((sec) => sec.chords.some((c) => c.progressionPlacement)),
  );
  const [open, setOpen] = useState(false);
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attrBtnRef = useRef<HTMLDivElement>(null);

  const handleConfirm = () => {
    setOpen(false);
    if (onboarding.enabled && onboarding.globalPhase === 1) {
      onboarding.setGlobalPhase(2);
      onboarding.setCaptureStep(1);
    }
  };

  useEffect(() => { setBpmDraft(String(meta.bpm)); }, [meta.bpm]);

  const commitBpm = () => {
    const n = parseInt(bpmDraft, 10);
    if (Number.isNaN(n)) { setBpmDraft(String(meta.bpm)); return; }
    const clamped = Math.max(40, Math.min(220, n));
    setBpm(clamped);
    setBpmDraft(String(clamped));
  };

  const handleTap = () => {
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    const now = performance.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 3000) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 8) tapTimesRef.current.shift();
    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      setTapBpm(Math.max(40, Math.min(220, Math.round(60000 / avg))));
    }
    tapResetRef.current = setTimeout(() => {
      tapTimesRef.current = [];
      setTapBpm(null);
    }, 3000);
  };

  const stepTranspose = (delta: -1 | 1) => {
    transposeSong(delta);
    setTransposeOffset((n) => n + delta);
  };

  const modeLabel = meta.keyMode === "maj" ? "Major" : "Minor";

  return (
    <>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Transposed Key</AlertDialogTitle>
          <AlertDialogDescription>
            You have transposed the song by{" "}
            <strong>{fmtOffset(transposeOffset)} semitones</strong>. The new key is{" "}
            <strong>{meta.keyRoot}</strong>. Confirming will reset the transpose counter to zero.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => setTransposeOffset(0)}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={pendingTimeSig !== null} onOpenChange={(o) => { if (!o) setPendingTimeSig(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change time signature?</AlertDialogTitle>
          <AlertDialogDescription>
            Switching to <strong>{pendingTimeSig?.n}/{pendingTimeSig?.d}</strong> re-flows
            every section's chords into the new bar grid. Chords keep their order but
            move back to the start of their section, so you'll need to re-position them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingTimeSig) setTimeSignature(pendingTimeSig.n, pendingTimeSig.d);
              setPendingTimeSig(null);
            }}
          >
            Change &amp; re-flow
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="relative inline-flex justify-center" ref={attrBtnRef}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 mx-auto mt-0.5 text-sm font-normal text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors rounded-full px-3 py-0.5"
          style={{ background: "var(--paper-shade)" }}
          aria-label="Song attributes and settings"
        >
          <span>{meta.keyRoot} {modeLabel} | {meta.beatsPerBar}/{meta.beatUnit} | {meta.bpm} bpm</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72">
        <div className="text-sm font-semibold mb-1 px-1">Song settings</div>
        <div className="h-px bg-border mb-2" />
        <div className="p-2 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Key</span>
            <div className="flex items-center gap-1">
              <Select value={meta.keyRoot} onValueChange={(v) => setKey(v, meta.keyMode)}>
                <SelectTrigger className="h-9 w-auto min-w-0 px-2 gap-1 font-mono-chord">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROOTS.map((r) => (
                    <SelectItem key={r} value={r} className="font-mono-chord">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={meta.keyMode} onValueChange={(v) => setKey(meta.keyRoot, v as Mode)}>
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                    <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Metronome</span>
              <Switch
                checked={metronome.enabled}
                onCheckedChange={(b) => {
                  metronome.setEnabled(b);
                  if (b && !isPlaying) previewClick(metronome.volume);
                }}
                aria-label="Toggle metronome"
              />
            </div>
            {metronome.enabled && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vol</span>
                <Slider
                  value={[Math.round(metronome.volume * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => metronome.setVolume((v[0] ?? 0) / 100)}
                  className="flex-1"
                />
                <span className="text-[10px] tabular-nums w-8 text-right text-muted-foreground">
                  {Math.round(metronome.volume * 100)}%
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">BPM</span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={bpmDraft}
                  onChange={(e) => setBpmDraft(e.target.value.replace(/[^\d]/g, ""))}
                  onBlur={commitBpm}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitBpm();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="h-9 w-16 px-2 text-center font-mono-chord"
                />
                <button
                  type="button"
                  onClick={handleTap}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-bold text-ink"
                  aria-label="Tap tempo"
                >
                  {tapBpm != null ? `${tapBpm}` : "Tap"}
                </button>
              </div>
            </div>
            {tapBpm != null && tapBpm !== meta.bpm && (
              <button
                type="button"
                onClick={() => {
                  setBpm(tapBpm);
                  setBpmDraft(String(tapBpm));
                  setTapBpm(null);
                  tapTimesRef.current = [];
                  if (tapResetRef.current) clearTimeout(tapResetRef.current);
                }}
                className="btn-sculpt-amber w-full rounded-lg h-8 text-xs font-bold"
              >
                Set {tapBpm} BPM
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Time Signature</span>
            <Select
              value={`${meta.beatsPerBar}/${meta.beatUnit}`}
              onValueChange={(v) => {
                const [n, d] = v.split("/").map((x) => parseInt(x, 10));
                if (!Number.isFinite(n) || !Number.isFinite(d)) return;
                if (hasPlacedChords) setPendingTimeSig({ n, d });
                else setTimeSignature(n, d);
              }}
            >
              <SelectTrigger className="h-9 w-[110px] font-mono-chord">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_SIGS.map((ts) => (
                  <SelectItem key={ts} value={ts} className="font-mono-chord">{ts}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Transpose</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => stepTranspose(-1)} aria-label="Transpose down semitone">
                <span aria-hidden className="text-base leading-none">−</span>
              </Button>
              <span className="font-mono-chord text-xs px-1.5 tabular-nums whitespace-nowrap min-w-[2.5rem] text-center">
                {fmtOffset(transposeOffset)}
              </span>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => stepTranspose(1)} aria-label="Transpose up semitone">
                <span aria-hidden className="text-base leading-none">+</span>
              </Button>
              {transposeOffset !== 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-green-600 border-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                  onClick={() => setConfirmOpen(true)}
                  aria-label="Confirm transpose"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

          <div className="pt-2 border-t border-border">
            <button
              type="button"
              className="btn-sculpt-amber w-full rounded-lg h-9 text-sm font-semibold"
              onClick={handleConfirm}
            >
              Save Settings
            </button>
          </div>
      </PopoverContent>
    </Popover>

    {onboarding.enabled && onboarding.globalPhase === 1 && onboarding.dismissedKey !== "phase-1" && !open && (
      <AnchoredCoachMark
        anchorRef={attrBtnRef}
        gap={24}
        step="2/13"
        message="Set the scene — choose key and timing, then tap Save Settings"
        arrowSide="top"
        onDismiss={() => onboarding.dismissCoachMark("phase-1")}
      />
    )}
    </div>
    </>
  );
}
