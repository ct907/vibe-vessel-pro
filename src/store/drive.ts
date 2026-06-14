import { create } from "zustand";
import { isConnected, isDriveConfigured, connect as driveConnect, signOut as driveSignOut } from "@/lib/drive/auth";
import { buildProjectZipBlob, loadProjectFromFile, useSongStore } from "@/store/song";
import { saveLocalVersion, saveCheckpoint, type LocalVersionMeta } from "@/lib/local-versions";

type SyncStatus = "idle" | "saving" | "loading";

interface DriveState {
  configured: boolean;
  online: boolean;
  connected: boolean;
  syncStatus: SyncStatus;
  setOnline: (online: boolean) => void;
  setConnected: (connected: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useDriveStore = create<DriveState>((set) => ({
  configured: isDriveConfigured(),
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  connected: isConnected(),
  syncStatus: "idle",
  setOnline: (online) => set({ online }),
  setConnected: (connected) => set({ connected }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  connect: async () => {
    await driveConnect();
    set({ connected: true });
  },
  disconnect: () => {
    driveSignOut();
    set({ connected: false });
  },
}));

function projectFileName(): string {
  const title = useSongStore.getState().meta.title || "untitled-song";
  return title.replace(/\s+/g, "-").toLowerCase() + ".zip";
}

export type SaveResult =
  | { target: "drive"; fileId: string }
  | { target: "local"; version: LocalVersionMeta; reason: "offline" | "drive-failed" };

// Connectivity-aware save. Online + connected to Drive uploads there and keeps a
// local zip as a fallback backup; otherwise (or on Drive failure) it writes to
// the rotating offline versions.
export async function saveProject(): Promise<SaveResult> {
  const store = useDriveStore.getState();
  store.setSyncStatus("saving");
  try {
    const name = projectFileName();
    const blob = await buildProjectZipBlob();
    const title = useSongStore.getState().meta.title || "Untitled Song";

    if (store.online && store.connected) {
      try {
        const { uploadProjectZip } = await import("@/lib/drive/drive");
        const fileId = await uploadProjectZip(name, blob);
        await saveLocalVersion(blob, title);
        return { target: "drive", fileId };
      } catch {
        const version = await saveLocalVersion(blob, title);
        return { target: "local", version, reason: "drive-failed" };
      }
    }

    const version = await saveLocalVersion(blob, title);
    return { target: "local", version, reason: "offline" };
  } finally {
    store.setSyncStatus("idle");
  }
}

export async function loadProjectFromDrive(fileId: string): Promise<void> {
  const store = useDriveStore.getState();
  store.setSyncStatus("loading");
  try {
    const { downloadProject } = await import("@/lib/drive/drive");
    const blob = await downloadProject(fileId);
    const file = new File([blob], "project.zip", { type: "application/zip" });
    await loadProjectFromFile(file);
  } finally {
    store.setSyncStatus("idle");
  }
}

export async function loadLocalVersionIntoSong(v: LocalVersionMeta): Promise<void> {
  const { loadLocalVersion, loadCheckpoint } = await import("@/lib/local-versions");
  const blob = v.kind === "auto" ? await loadCheckpoint(v.slot) : await loadLocalVersion(v.slot);
  if (!blob) throw new Error("Version not found");
  const file = new File([blob], "project.zip", { type: "application/zip" });
  await loadProjectFromFile(file);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => useDriveStore.getState().setOnline(true));
  window.addEventListener("offline", () => useDriveStore.getState().setOnline(false));
}

// Local safety net: write a rotating offline zip version when the user pauses
// editing (idle) and at most once per MAX_INTERVAL during continuous editing.
// This stays local-only — explicit "Save" handles Drive uploads.
const IDLE_MS = 45_000;
const MAX_INTERVAL_MS = 5 * 60_000;

export function startOfflineCheckpoints(): () => void {
  let dirty = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastCheckpoint = Date.now();
  let running = false;

  const checkpoint = async () => {
    if (!dirty || running) return;
    running = true;
    dirty = false;
    try {
      const blob = await buildProjectZipBlob();
      const title = useSongStore.getState().meta.title || "Untitled Song";
      await saveCheckpoint(blob, title);
      lastCheckpoint = Date.now();
    } catch {
      dirty = true;
    } finally {
      running = false;
    }
  };

  const onChange = () => {
    dirty = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void checkpoint(), IDLE_MS);
    if (Date.now() - lastCheckpoint >= MAX_INTERVAL_MS) void checkpoint();
  };

  const unsubSong = useSongStore.subscribe(onChange);
  let unsubRecordings = () => {};
  void import("@/store/recordings").then((m) => {
    unsubRecordings = m.useRecordingsStore.subscribe(onChange);
  });

  return () => {
    if (idleTimer) clearTimeout(idleTimer);
    unsubSong();
    unsubRecordings();
  };
}
