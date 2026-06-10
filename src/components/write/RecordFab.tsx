import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { useTakesStore } from "@/store/takes";
import { startRecording, type RecorderHandle } from "@/lib/audio/recorder";
import { putAudioBlob } from "@/lib/audio/blob-store";
import { getAudioContext } from "@/lib/audio/context";

/**
 * Floating capture pill. Manages the full MediaRecorder lifecycle: request
 * mic → record → normalize → persist → notify caller.
 *
 * onComplete is called with the stored blobId, real duration, and mime type.
 * When omitted the recording is appended to the Write-mode takes library.
 */
export function RecordFab({
  onComplete,
}: {
  onComplete?: (blobId: string, durationSec: number, mime: string) => void;
} = {}) {
  const addTake = useTakesStore((s) => s.addTake);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState(0);

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
      if (onComplete) {
        onComplete(blobId, durationSec, mime);
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

  return (
    <div
      className="fixed z-[60] flex items-center gap-2.5"
      style={{ bottom: 24, right: "max(24px, calc(50vw - 195px + 24px))" }}
    >
      {recording && (
        <div
          className="h-1.5 w-16 overflow-hidden rounded-full"
          style={{ background: "rgba(0,0,0,0.12)" }}
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
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={
          "btn-sculpt-destructive inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold" +
          (recording ? " animate-rec-pulse" : "") +
          (pending ? " opacity-70" : "")
        }
        aria-label={recording ? "Stop recording" : "Record a take"}
      >
        <span
          className="bg-white transition-all"
          style={{ width: 13, height: 13, borderRadius: recording ? 3 : 7 }}
        />
        {pending ? "Saving…" : recording ? "Stop" : "Record"}
      </button>
    </div>
  );
}
