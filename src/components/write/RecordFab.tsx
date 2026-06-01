import { useState } from "react";
import { useTakesStore } from "@/store/takes";

/**
 * Floating capture controls for Write mode: a red Record pill (pulses while
 * armed) paired with a circular amber pencil-edit button. Capture is
 * UI-state only here — stopping a recording appends a placeholder take.
 */
export function RecordFab() {
  const [recording, setRecording] = useState(false);
  const addTake = useTakesStore((s) => s.addTake);

  const toggle = () => {
    if (recording) addTake();
    setRecording((r) => !r);
  };

  return (
    <div
      className="fixed z-[60] flex items-center gap-2.5"
      style={{ bottom: 24, right: "max(24px, calc(50vw - 195px + 24px))" }}
    >
      <button
        type="button"
        onClick={toggle}
        className={
          "btn-sculpt-destructive inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold" +
          (recording ? " animate-rec-pulse" : "")
        }
        aria-label={recording ? "Stop recording" : "Record a take"}
      >
        <span
          className="bg-white transition-all"
          style={{ width: 13, height: 13, borderRadius: recording ? 3 : 7 }}
        />
        {recording ? "Stop" : "Record"}
      </button>

    </div>
  );
}
