import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/song";
import { exportLyricsAsText } from "@/lib/lyrics/export";
import { Copy, Check } from "lucide-react";

interface ExportLyricsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportLyricsSheet({ open, onOpenChange }: ExportLyricsSheetProps) {
  const sections = useSongStore((s) => s.sections);
  const text = useMemo(() => (open ? exportLyricsAsText(sections) : ""), [open, sections]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle>Export lyrics</SheetTitle>
          <SheetDescription>
            Plain-text view of section titles, chord rows, and lyric rows.
          </SheetDescription>
        </SheetHeader>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <textarea
          readOnly
          value={text}
          className="flex-1 w-full resize-none rounded-md border border-border bg-paper-shade/40 p-3 font-mono-chord text-xs leading-relaxed whitespace-pre overflow-auto"
        />
      </SheetContent>
    </Sheet>
  );
}
