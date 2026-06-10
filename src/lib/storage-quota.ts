import { toast } from "sonner";

// Persistence writes (autosave, recordings, takes) swallow their own errors so a
// full localStorage doesn't crash the app — but the user must know their work has
// stopped saving. Fire one persistent warning per session.
let warned = false;

export function notifyStorageQuota() {
  if (warned) return;
  warned = true;
  toast.error("Storage is full — changes may not be saving", {
    id: "storage-quota",
    description: "Export your song to a file (Menu → Save) to avoid losing work.",
    duration: Infinity,
  });
}
