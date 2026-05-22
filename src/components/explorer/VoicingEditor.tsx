import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { pcToName } from "@/lib/music/chords";
import {
  VOICE_COLORS,
  VOICE_NAMES,
  VOICE_SYMBOLS,
  keyUsesFlat,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";
import { useIsMobile } from "@/hooks/use-mobile";
import ChordDescription from "./ChordDescription";

interface VoicingEditorProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  editIdx: number;
  onChangeEditIdx: (idx: number) => void;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
  onShiftChordOctave: (stepIdx: number, dir: 1 | -1) => void;
  onClose: () => void;
}

export default function VoicingEditor({
  steps,
  keyRoot,
  mode,
  editIdx,
  onChangeEditIdx,
  onMoveVoice,
  onShiftChordOctave,
  onClose,
}: VoicingEditorProps) {
  const isMobile = useIsMobile();
  const useFlat = keyUsesFlat(keyRoot);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const editIdxRef = useRef(editIdx);
  editIdxRef.current = editIdx;

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= steps.length) return;
      panelRefs.current[idx]?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    },
    [steps.length],
  );

  useLayoutEffect(() => {
    panelRefs.current[editIdxRef.current]?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }, []);

  useEffect(() => {
    const root = stripRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const idx = panelRefs.current.indexOf(e.target as HTMLElement);
          if (idx >= 0 && idx !== editIdxRef.current) onChangeEditIdx(idx);
        }
      },
      { root, rootMargin: "0px -49% 0px -49%", threshold: 0 },
    );
    panelRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [steps, onChangeEditIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(editIdxRef.current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(editIdxRef.current + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-[var(--paper-card)]"
      style={{ height: isMobile ? "100dvh" : "70dvh" }}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          Voice Leading · Editing
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="btn-sculpt-amber inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold"
        >
          <Check className="h-3.5 w-3.5" />
          Done
        </button>
      </div>

      <div ref={stripRef} className="flex flex-1 snap-x snap-mandatory overflow-x-auto">
        {steps.map((step, i) => {
          const octEntries = [...step.pitches.entries()].reverse();
          return (
            <section
              key={step.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className="flex w-full shrink-0 snap-center flex-col gap-2 p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono-chord text-2xl font-bold leading-none text-ink">
                  {step.chord.display}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                  {i + 1} / {steps.length}
                </span>
              </div>

              <div
                className="flex flex-col gap-2"
                style={{ height: isMobile ? "60dvh" : "40dvh" }}
              >
                <div className="flex flex-1 flex-col justify-center gap-2 overflow-y-auto">
                  {octEntries.map(([v, pitch]) => {
                    const shapeIdx = Math.min(v, 3);
                    return (
                      <div
                        key={v}
                        className="flex items-center gap-2 rounded-lg border border-border bg-[var(--paper)] px-2.5 py-2"
                      >
                        <span
                          className="flex h-8 w-8 items-center justify-center text-lg leading-none"
                          style={{ color: VOICE_COLORS[shapeIdx] }}
                        >
                          {VOICE_SYMBOLS[shapeIdx]}
                        </span>
                        <div className="min-w-0">
                          <div className="font-mono-chord text-xl font-bold leading-tight text-ink">
                            {pcToName(((pitch % 12) + 12) % 12, useFlat)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-ink-soft">
                            {VOICE_NAMES[shapeIdx]} · oct {Math.floor(pitch / 12) - 1}
                          </div>
                        </div>
                        <div className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            aria-label={`Raise ${VOICE_NAMES[shapeIdx]} an octave`}
                            onClick={() => onMoveVoice(i, v, 1)}
                            className="btn-sculpt-cream flex h-11 w-11 items-center justify-center rounded-lg"
                          >
                            <ChevronUp className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Lower ${VOICE_NAMES[shapeIdx]} an octave`}
                            onClick={() => onMoveVoice(i, v, -1)}
                            className="btn-sculpt-cream flex h-11 w-11 items-center justify-center rounded-lg"
                          >
                            <ChevronDown className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-[var(--primary-halo)] px-2.5 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink">
                    Whole chord
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <button
                      type="button"
                      aria-label="Raise whole chord an octave"
                      onClick={() => onShiftChordOctave(i, 1)}
                      className="btn-sculpt-amber flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Lower whole chord an octave"
                      onClick={() => onShiftChordOctave(i, -1)}
                      className="btn-sculpt-amber flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <ChordDescription step={step} keyRoot={keyRoot} mode={mode} />
            </section>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border p-2">
        <button
          type="button"
          aria-label="Previous chord"
          onClick={() => goTo(editIdx - 1)}
          disabled={editIdx <= 0}
          className="btn-sculpt-cream flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <Droppable droppableId="explorer-strip" direction="horizontal">
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="flex flex-1 gap-1.5 overflow-x-auto"
            >
              {steps.map((step, i) => (
                <Draggable key={step.id} draggableId={step.id} index={i}>
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`flex shrink-0 items-center rounded-lg border ${
                        i === editIdx
                          ? "border-[var(--primary)] bg-[var(--primary-halo)]"
                          : "border-border bg-[var(--paper)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        className="font-mono-chord px-2 py-1.5 text-sm font-bold text-ink"
                      >
                        {step.chord.display}
                      </button>
                      <span
                        {...dragProvided.dragHandleProps}
                        aria-label="Reorder chord"
                        className="flex h-7 w-5 cursor-grab items-center justify-center text-ink-soft/40 active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>

        <button
          type="button"
          aria-label="Next chord"
          onClick={() => goTo(editIdx + 1)}
          disabled={editIdx >= steps.length - 1}
          className="btn-sculpt-cream flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
