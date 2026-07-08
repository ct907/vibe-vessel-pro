import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { useTakesStore } from "@/store/takes";
import { useSongStore, type SectionType } from "@/store/song";
import { useUIStore } from "@/store/ui";
import { useRecordingsStore } from "@/store/recordings";
import { startRecording, type RecorderHandle } from "@/lib/audio/recorder";
import { putAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";

interface Props {
  /** When provided, recording completion routes here instead of the takes library (Arrange mode). */
  onRecordComplete?: (blobId: string, durationSec: number, mime: string) => void;
  /** Called when Add Section / Edit Chords is used, so the parent can reveal its card-gated editor. */
  onEditorAction?: () => void;
}

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "pre-chorus", "bridge", "intro", "instrumental"];

const START_RECORDING_EVENT = "write:start-recording";

const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Ask the mounted sticky bar to start recording, as if its Record button was pressed. */
export function requestStickyBarRecording() {
  window.dispatchEvent(new CustomEvent(START_RECORDING_EVENT));
}

export function WriteStickyBar({ onRecordComplete, onEditorAction }: Props) {
  const addTake = useTakesStore((s) => s.addTake);
  const addSection = useSongStore((s) => s.addSection);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const trackIsRecording = useRecordingsStore((s) => s.isRecording);

  const recorderRef = useRef<RecorderHandle | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [addSectionOpen, setAddSectionOpen] = useState(false);

  // Pin the bar to the top of the on-screen keyboard instead of the layout
  // viewport bottom (where `fixed bottom-0` leaves it stranded behind/above the
  // keyboard with a large gap). Same visualViewport overlap math the chord
  // picker and rhyme sheets use.
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setKeyboardOffset(overlap > 0 ? overlap : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Live elapsed-time readout so the user knows how long a take has been rolling.
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = async () => {
    try {
      const ac = getAudioContext();
      if (ac.state === "suspended") await ac.resume();
      const handle = await startRecording({ onLevel: setLevel });
      recorderRef.current = handle;
      setRecording(true);
    } catch {
      // mic permission denied or device unavailable — tell the user so they
      // don't think the app is broken at the moment they're trying to capture.
      toast.error("Can't access the microphone", {
        description: "Allow mic access in your browser settings, then try again.",
      });
    }
  };

  const stop = async () => {
    const handle = recorderRef.current;
    if (!handle) return;
    recorderRef.current = null;
    setRecording(false);
    setLevel(0);
    setPending(true);
    try {
      const { blob, durationSec, mime } = await handle.stop();
      const blobId = nanoid();
      await putAudioBlob(blobId, blob);
      if (onRecordComplete) {
        onRecordComplete(blobId, durationSec, mime);
      } else {
        addTake({ blobId, durationSec, mime });
      }
    } catch {
      toast.error("Couldn't save that recording", {
        description: "Something went wrong storing the audio. Please try recording again.",
      });
    } finally {
      setPending(false);
    }
  };

  const toggle = () => {
    if (recording) stop();
    else start();
  };

  // Phone locked or app backgrounded mid-take: finalize and save instead of
  // letting the browser kill the recorder and lose the audio.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && recorderRef.current) void stopRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // The empty "Add Recording" tap card starts a take through here so the strip
  // reveal and the recording begin in the same gesture.
  useEffect(() => {
    const onRequest = () => {
      if (recorderRef.current || pending || useRecordingsStore.getState().isRecording) return;
      void start();
    };
    window.addEventListener(START_RECORDING_EVENT, onRequest);
    return () => window.removeEventListener(START_RECORDING_EVENT, onRequest);
  }, [pending]);

  const handleEditChords = () => {
    onEditorAction?.();
    setChordToolbarOpen(true);
  };

  return (
    <div
      className="fixed left-0 right-0 z-[45] transition-[bottom] duration-150"
      style={{
        bottom: keyboardOffset,
        paddingBottom: keyboardOffset > 0 ? 0 : "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Full width on mobile; capped and centered on tablet/desktop. */}
      <div className="mx-auto w-full max-w-[420px]">
        {/* Section type picker — full-width bar on mobile; a centered floating
            card above the bar on desktop. */}
        {addSectionOpen && (
          <div
            className="animate-in slide-in-from-bottom-2 duration-200 md:absolute md:bottom-full md:left-1/2 md:-translate-x-1/2 md:mb-3 md:rounded-2xl md:border md:border-border/60 md:shadow-lg"
            style={{ background: "var(--cocoa-deep)" }}
          >
            <div className="w-full px-4 pt-4 pb-3 md:max-w-md md:py-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {SECTION_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { onEditorAction?.(); addSection(t); setAddSectionOpen(false); }}
                    className="btn-sculpt-amber inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold capitalize"
                  >
                    <Plus className="h-3.5 w-3.5" />{t === "pre-chorus" ? "Pre-Chorus" : t}
                  </button>
                ))}
                <button
                  onClick={() => { onEditorAction?.(); addSection("custom"); setAddSectionOpen(false); }}
                  className="btn-sculpt-amber inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />Custom…
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connected button group — no bar backdrop; the segments themselves
            (each with a solid fill) are the only visible surface. */}
        <div className="relative flex items-center justify-center py-3">
          {/* Level indicator during recording */}
          {recording && (
            <div
              className="absolute top-1.5 left-1/2 -translate-x-1/2 z-[1] h-1 w-14 overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(level * 100)}%`,
                  background: "var(--destructive)",
                  transition: "width 80ms linear",
                }}
              />
            </div>
          )}

          {/* Material 3 connected button group: one unified elevation, flush
              segments with hairline dividers, only outer corners rounded. */}
          <div
            className="flex w-full items-stretch overflow-hidden rounded-2xl"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {/* Record — always visible; disabled while a track is recording */}
            <button
              type="button"
              onClick={toggle}
              disabled={pending || (trackIsRecording && !recording)}
              className={
                "flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 text-sm font-bold text-[var(--destructive-foreground)] transition-[filter,transform] active:translate-y-px active:brightness-95" +
                (recording ? " animate-rec-pulse" : "") +
                ((pending || (trackIsRecording && !recording)) ? " opacity-50" : "")
              }
              style={{ background: "var(--destructive)" }}
              aria-label={recording ? "Stop recording" : "Record a take"}
            >
              <span
                className="bg-white transition-all"
                style={{ width: 12, height: 12, borderRadius: recording ? 3 : 6 }}
              />
              {pending ? "Saving…" : recording ? `Stop · ${fmtElapsed(elapsed)}` : "Record"}
            </button>

            <button
              type="button"
              onClick={() => setAddSectionOpen((o) => !o)}
              className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap border-l border-black/15 px-4 text-sm font-bold text-[var(--cocoa-foreground)] transition-[filter,transform] active:translate-y-px active:brightness-95"
              style={{ background: "var(--cocoa)" }}
              aria-expanded={addSectionOpen}
              aria-label="Add a song section"
            >
              <Plus className="h-4 w-4" />
              Add Section
            </button>

            <button
              type="button"
              onClick={handleEditChords}
              className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap border-l border-black/15 px-4 text-sm font-bold text-[var(--cocoa-foreground)] transition-[filter,transform] active:translate-y-px active:brightness-95"
              style={{ background: "var(--cocoa)" }}
              aria-label="Open chord editing tools"
            >
              <Pencil className="h-4 w-4" />
              Edit Chords
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
