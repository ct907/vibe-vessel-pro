import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { useTakesStore } from "@/store/takes";
import { useSongStore, type SectionType } from "@/store/song";
import { useUIStore, type TabName } from "@/store/ui";
import { useRecordingsStore } from "@/store/recordings";
import { useIsMobile } from "@/hooks/use-mobile";
import { startRecording, type RecorderHandle } from "@/lib/audio/recorder";
import { putAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";

interface Props {
  onSwitchTab: (t: TabName) => void;
  /** When provided, recording completion routes here instead of the takes library (Arrange mode). */
  onRecordComplete?: (blobId: string, durationSec: number, mime: string) => void;
  /** Called when Add Section / Edit Chords is used, so the parent can reveal its card-gated editor. */
  onEditorAction?: () => void;
}

const SECTION_TYPES: SectionType[] = ["verse", "chorus", "pre-chorus", "bridge", "intro"];

const START_RECORDING_EVENT = "write:start-recording";

/** Ask the mounted sticky bar to start recording, as if its Record button was pressed. */
export function requestStickyBarRecording() {
  window.dispatchEvent(new CustomEvent(START_RECORDING_EVENT));
}

export function WriteStickyBar({ onSwitchTab, onRecordComplete, onEditorAction }: Props) {
  const addTake = useTakesStore((s) => s.addTake);
  const addSection = useSongStore((s) => s.addSection);
  const setChordToolbarOpen = useUIStore((s) => s.setChordToolbarOpen);
  const trackIsRecording = useRecordingsStore((s) => s.isRecording);
  const isMobile = useIsMobile();

  const recorderRef = useRef<RecorderHandle | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState(0);
  const [addSectionOpen, setAddSectionOpen] = useState(false);

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
      // normalization or storage failed — discard silently
    } finally {
      setPending(false);
    }
  };

  const toggle = () => {
    if (recording) stop();
    else start();
  };

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
    if (isMobile) {
      setChordToolbarOpen(true);
    } else {
      onSwitchTab("chords");
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[45]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {/* Section type picker — slides up above bar */}
      {addSectionOpen && (
        <div
          className="animate-in slide-in-from-bottom-2 duration-200"
          style={{ background: "var(--cocoa-deep)" }}
        >
          <div className="max-w-6xl mx-auto px-4 pt-4 pb-3">
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

      {/* Main cocoa bar */}
      <div style={{ background: "var(--cocoa)" }}>
        <div className="max-w-6xl mx-auto relative flex items-center justify-around px-4 py-3 gap-3">
          {/* Level indicator during recording */}
          {recording && (
            <div
              className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-14 overflow-hidden rounded-full"
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

          {/* Record — always visible; disabled while a track is recording */}
          <button
            type="button"
            onClick={toggle}
            disabled={pending || (trackIsRecording && !recording)}
            className={
              "btn-sculpt-destructive inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold" +
              (recording ? " animate-rec-pulse" : "") +
              ((pending || (trackIsRecording && !recording)) ? " opacity-50" : "")
            }
            aria-label={recording ? "Stop recording" : "Record a take"}
          >
            <span
              className="bg-white transition-all"
              style={{ width: 12, height: 12, borderRadius: recording ? 3 : 6 }}
            />
            {pending ? "Saving…" : recording ? "Stop" : "Record"}
          </button>

          <button
            type="button"
            onClick={() => setAddSectionOpen((o) => !o)}
            className="btn-sculpt-cream inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold"
            aria-expanded={addSectionOpen}
            aria-label="Add a song section"
          >
            <Plus className="h-4 w-4" />
            Add Section
          </button>

          <button
            type="button"
            onClick={handleEditChords}
            className="btn-sculpt-cream inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold"
            aria-label="Open chord editing tools"
          >
            <Pencil className="h-4 w-4" />
            Edit Chords
          </button>
        </div>
      </div>
    </div>
  );
}
