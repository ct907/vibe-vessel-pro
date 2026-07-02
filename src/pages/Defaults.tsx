import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDefaultsStore, DEFAULTS_FALLBACK } from "@/store/defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RotateCcw } from "lucide-react";

function DefaultNumberInput({
  value, min, max, step, onCommit,
}: { value: number; min: number; max: number; step?: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
    else setDraft(String(value));
  };

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="w-28 font-mono-chord"
    />
  );
}

const Defaults = () => {
  const {
    defaultChordLengthBeats,
    defaultPatternBars,
    defaultOctave,
    setDefaultChordLength,
    setDefaultPatternBars,
    setDefaultOctave,
    reset,
  } = useDefaultsStore();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-paper/85">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/" aria-label="Back">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="font-display text-xl flex-1">Defaults</h1>
          <Button variant="ghost" size="sm" onClick={reset} title="Reset to factory defaults">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          These defaults apply across all songs. They control how new chords and pattern blocks are created.
        </p>

        <Field
          label="Default chord length (beats)"
          help={`How long each new chord is when added to a pattern block. Default: ${DEFAULTS_FALLBACK.defaultChordLengthBeats}.`}
        >
          <DefaultNumberInput
            value={defaultChordLengthBeats}
            min={0.5}
            max={16}
            step={0.5}
            onCommit={setDefaultChordLength}
          />
        </Field>

        <Field
          label="Default pattern block length (bars)"
          help={`Number of bars in each new pattern block. Default: ${DEFAULTS_FALLBACK.defaultPatternBars}.`}
        >
          <DefaultNumberInput
            value={defaultPatternBars}
            min={1}
            max={32}
            onCommit={setDefaultPatternBars}
          />
        </Field>

        <Field
          label="Default octave"
          help={`Octave used when adding chords and auditioning them. Range 2–6. Default: ${DEFAULTS_FALLBACK.defaultOctave}.`}
        >
          <DefaultNumberInput
            value={defaultOctave}
            min={2}
            max={6}
            onCommit={setDefaultOctave}
          />
        </Field>
      </main>
    </div>
  );
};

interface FieldProps {
  label: string;
  help: string;
  children: React.ReactNode;
}

function Field({ label, help, children }: FieldProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium">{label}</label>
        {children}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export default Defaults;
