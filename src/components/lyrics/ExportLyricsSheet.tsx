import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/song";
import { exportLyricsAsText, exportLyricsAsChordPro } from "@/lib/lyrics/export";
import { Copy, Check, Download } from "lucide-react";

interface ExportLyricsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Format = "plain" | "chordpro";

export function ExportLyricsSheet({ open, onOpenChange }: ExportLyricsSheetProps) {
  const sections = useSongStore((s) => s.sections);
  const meta = useSongStore((s) => s.meta);
  const [format, setFormat] = useState<Format>("plain");
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (!open) return "";
    return format === "chordpro"
      ? exportLyricsAsChordPro(sections, meta)
      : exportLyricsAsText(sections, meta);
  }, [open, format, sections, meta]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const download = () => {
    const ext = format === "chordpro" ? "cho" : "txt";
    const filename = `${meta.title || "song"}.${ext}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-3">
        <SheetHeader>
          <SheetTitle>Export lyrics</SheetTitle>
          <SheetDescription>
            {format === "chordpro"
              ? "ChordPro format — inline [Chord] markers, ready for OnSong, SongbookPro, and other performance apps."
              : "Plain-text view of section titles, chord rows, and lyric rows."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 transition-colors ${format === "plain" ? "bg-primary text-primary-foreground font-medium" : "bg-paper hover:bg-paper-shade/60"}`}
              onClick={() => setFormat("plain")}
            >
              Plain text
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${format === "chordpro" ? "bg-primary text-primary-foreground font-medium" : "bg-paper hover:bg-paper-shade/60"}`}
              onClick={() => setFormat("chordpro")}
            >
              ChordPro
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
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
