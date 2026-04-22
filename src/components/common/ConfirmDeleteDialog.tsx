import { useState, useEffect } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** When true, show the "Don't show this again" checkbox. */
  showSuppressOption?: boolean;
  onConfirm: (suppressFuture: boolean) => void;
}

/**
 * Shared confirmation dialog. When `showSuppressOption` is true, an
 * acknowledgement checkbox lets the user opt out of future cross-tab warnings.
 * The confirm button is always enabled — the checkbox is acknowledgement, not
 * a gate.
 */
export function ConfirmDeleteDialog({
  open, onOpenChange, title, description, confirmLabel = "Delete",
  showSuppressOption = false, onConfirm,
}: ConfirmDeleteDialogProps) {
  const [suppress, setSuppress] = useState(false);

  // Reset checkbox state every time the dialog opens.
  useEffect(() => { if (open) setSuppress(false); }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {showSuppressOption && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={suppress}
              onCheckedChange={(v) => setSuppress(v === true)}
            />
            Don't show this again
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(suppress)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
