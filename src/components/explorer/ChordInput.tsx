import { useState } from "react";

interface ChordInputProps {
  onAdd: (input: string) => boolean;
}

export default function ChordInput({ onAdd }: ChordInputProps) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    if (!draft.trim()) return;
    if (onAdd(draft)) {
      setDraft("");
      setInvalid(false);
    } else {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 700);
    }
  };

  return (
    <div className="w-full">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Type chord…"
        className={`h-[52px] w-full rounded-lg border border-dashed bg-transparent px-2 text-center font-mono-chord text-sm text-ink outline-none transition-colors focus:border-solid focus:bg-[var(--paper)] ${
          invalid ? "border-[var(--destructive)]" : "border-border focus:border-[var(--primary)]"
        }`}
      />
      <div className="mt-1 text-center text-[8px] uppercase tracking-wide text-ink-soft">
        e.g. Dm7, G, C#m
      </div>
    </div>
  );
}
