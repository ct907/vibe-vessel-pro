import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { pcToName, type ChordSymbol } from "@/lib/music/chords";
import { playNotes } from "@/lib/music/audio";
import {
  VOICE_COLORS,
  VOICE_NAMES,
  VOICE_SYMBOLS,
  findVoiceLinks,
  keyUsesFlat,
  nashvilleNumeral,
  type ExplorerMode,
  type ExplorerStep,
} from "@/lib/music/explorerEngine";
import { useIsMobile } from "@/hooks/use-mobile";
import ChordDescription from "./ChordDescription";
import VoiceTrajectorySheet from "./VoiceTrajectorySheet";

interface VoicingEditorProps {
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  editIdx: number;
  guitarMode: boolean;
  onChangeEditIdx: (idx: number) => void;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
  onShiftChordOctave: (stepIdx: number, dir: 1 | -1) => void;
  onSetVoicing: (stepIdx: number, pitches: number[]) => void;
  onSetStepChord: (stepIdx: number, chord: ChordSymbol) => void;
  onClose: () => void;
}

function VoiceColumn({
  step,
  stepIdx,
  editable,
  useFlat,
  onMoveVoice,
  onSelectVoice,
  rowRef,
}: {
  step: ExplorerStep;
  stepIdx: number;
  editable: boolean;
  useFlat: boolean;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
  onSelectVoice?: (stepIdx: number, voiceIdx: number) => void;
  rowRef?: (el: HTMLDivElement | null, v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {[...step.pitches.entries()].reverse().map(([v, pitch]) => {
        const shapeIdx = Math.min(v, 3);
        const name = pcToName(((pitch % 12) + 12) % 12, useFlat);
        const octave = Math.floor(pitch / 12) - 1;
        return (
          <div
            key={v}
            ref={(el) => rowRef?.(el, v)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-[var(--paper)] px-1.5 py-1.5"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none"
              style={{ color: VOICE_COLORS[shapeIdx] }}
            >
              {VOICE_SYMBOLS[shapeIdx]}
            </span>
            <button
              type="button"
              onClick={() => {
                void playNotes([pitch], 0.5);
                if (editable) onSelectVoice?.(stepIdx, v);
              }}
              aria-label={
                editable ? `Edit ${name}${octave} line` : `Play ${name}${octave}`
              }
              className={`font-mono-chord rounded px-1 text-base font-bold text-ink hover:bg-[var(--paper-shade)] ${
                editable ? "underline decoration-dotted underline-offset-4" : ""
              }`}
            >
              {name}
              <sub className="ml-0.5 align-baseline text-[10px] font-semibold text-ink-soft">
                {octave}
              </sub>
            </button>
            {editable && (
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  aria-label={`Raise ${VOICE_NAMES[shapeIdx]} an octave`}
                  onClick={() => onMoveVoice(stepIdx, v, 1)}
                  className="btn-sculpt-cream flex h-8 w-8 items-center justify-center rounded-md"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Lower ${VOICE_NAMES[shapeIdx]} an octave`}
                  onClick={() => onMoveVoice(stepIdx, v, -1)}
                  className="btn-sculpt-cream flex h-8 w-8 items-center justify-center rounded-md"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface LineSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dash?: string;
  width: number;
  opacity: number;
}

function SectionPanel({
  editStep,
  i,
  steps,
  keyRoot,
  mode,
  useFlat,
  onMoveVoice,
  onShiftChordOctave,
  onSelectVoice,
  onPanelRef,
}: {
  editStep: ExplorerStep;
  i: number;
  steps: ExplorerStep[];
  keyRoot: string;
  mode: ExplorerMode;
  useFlat: boolean;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
  onShiftChordOctave: (stepIdx: number, dir: 1 | -1) => void;
  onSelectVoice: (stepIdx: number, voiceIdx: number) => void;
  onPanelRef: (el: HTMLElement | null) => void;
}) {
  const isFirst = i === 0;
  const neighbor = isFirst ? steps[1] ?? null : steps[i - 1];
  const leftStep = isFirst ? editStep : neighbor;
  const rightStep = isFirst ? neighbor : editStep;
  const editableIsLeft = isFirst;

  const gridWrapRef = useRef<HTMLDivElement>(null);
  const leftRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rightRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lineSpecs, setLineSpecs] = useState<LineSpec[]>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  const recomputeLines = useCallback(() => {
    const container = gridWrapRef.current;
    if (!container || !leftStep || !rightStep) {
      setLineSpecs((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const rect = container.getBoundingClientRect();
    setSvgSize((prev) =>
      prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height },
    );
    const links = findVoiceLinks(leftStep.pitches, rightStep.pitches);
    const specs: LineSpec[] = [];
    for (const lk of links) {
      const leftEl = leftRowRefs.current[lk.fromVoice];
      const rightEl = rightRowRefs.current[lk.toVoice];
      if (!leftEl || !rightEl) continue;
      const lr = leftEl.getBoundingClientRect();
      const rr = rightEl.getBoundingClientRect();
      specs.push({
        x1: lr.right - rect.left,
        y1: lr.top + lr.height / 2 - rect.top,
        x2: rr.left - rect.left,
        y2: rr.top + rr.height / 2 - rect.top,
        color: VOICE_COLORS[Math.min(lk.fromVoice, 3)],
        dash: lk.type === "octave" ? "4 3" : undefined,
        width: lk.type === "direct" ? (lk.dist === 0 ? 3 : 2.2) : 1.6,
        opacity: lk.type === "direct" ? 0.7 : 0.4,
      });
    }
    setLineSpecs((prev) => {
      if (
        prev.length === specs.length &&
        prev.every((p, i) =>
          p.x1 === specs[i].x1 && p.y1 === specs[i].y1 &&
          p.x2 === specs[i].x2 && p.y2 === specs[i].y2 &&
          p.color === specs[i].color && p.dash === specs[i].dash &&
          p.width === specs[i].width && p.opacity === specs[i].opacity,
        )
      ) {
        return prev;
      }
      return specs;
    });
  }, [leftStep, rightStep]);

  useLayoutEffect(() => {
    recomputeLines();
  }, [recomputeLines]);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recomputeLines);
    ro.observe(el);
    return () => ro.disconnect();
  }, [recomputeLines]);

  return (
    <section
      ref={onPanelRef}
      className="flex h-full w-full shrink-0 snap-center flex-col gap-2 overflow-y-auto p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="font-mono-chord text-xl font-bold leading-none text-ink">
            {leftStep!.chord.display}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
            {nashvilleNumeral(leftStep!.chord, keyRoot, mode)}
            {editableIsLeft && (
              <span className="font-semibold text-[var(--primary-strong)]"> · editing</span>
            )}
          </div>
        </div>
        {rightStep && (
          <div className="text-right">
            <div className="font-mono-chord text-xl font-bold leading-none text-ink">
              {rightStep.chord.display}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
              {nashvilleNumeral(rightStep.chord, keyRoot, mode)}
              {!editableIsLeft && (
                <span className="font-semibold text-[var(--primary-strong)]"> · editing</span>
              )}
            </div>
          </div>
        )}
      </div>

      {!rightStep && (
        <div className="flex items-center justify-center rounded-lg bg-[var(--paper-shade)] px-4 py-3 text-center text-[11px] italic text-ink-soft">
          Add a chord from the palette to see voice leading.
        </div>
      )}

      <div
        ref={gridWrapRef}
        className={`relative flex ${rightStep ? "items-stretch" : "justify-center"}`}
      >
        {rightStep && svgSize.w > 0 && (
          <svg
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: svgSize.w,
              height: svgSize.h,
              pointerEvents: "none",
              zIndex: 10,
              overflow: "visible",
            }}
          >
            {lineSpecs.map((ls, li) => (
              <line
                key={li}
                x1={ls.x1}
                y1={ls.y1}
                x2={ls.x2}
                y2={ls.y2}
                stroke={ls.color}
                strokeWidth={ls.width}
                strokeOpacity={ls.opacity}
                strokeDasharray={ls.dash}
                strokeLinecap="round"
              />
            ))}
          </svg>
        )}
        <div style={{ flex: rightStep ? "0 0 20%" : "0 0 auto" }}>
          <VoiceColumn
            step={leftStep!}
            stepIdx={i}
            editable={editableIsLeft}
            useFlat={useFlat}
            onMoveVoice={onMoveVoice}
            onSelectVoice={onSelectVoice}
            rowRef={(el, v) => {
              leftRowRefs.current[v] = el;
            }}
          />
        </div>
        {rightStep && (
          <>
            <div style={{ flex: "1 1 auto" }} aria-hidden="true" />
            <div style={{ flex: "0 0 20%" }}>
              <VoiceColumn
                step={rightStep}
                stepIdx={i}
                editable={!editableIsLeft}
                useFlat={useFlat}
                onMoveVoice={onMoveVoice}
                onSelectVoice={onSelectVoice}
                rowRef={(el, v) => {
                  rightRowRefs.current[v] = el;
                }}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[var(--primary-halo)] px-2.5 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink">
          Change chord octave
        </span>
        <span className="font-mono-chord text-[11px] text-ink-soft">
          {editStep.chord.display}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            aria-label="Raise whole chord an octave"
            onClick={() => onShiftChordOctave(i, 1)}
            className="btn-sculpt-amber flex h-10 w-10 items-center justify-center rounded-lg"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Lower whole chord an octave"
            onClick={() => onShiftChordOctave(i, -1)}
            className="btn-sculpt-amber flex h-10 w-10 items-center justify-center rounded-lg"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      <ChordDescription step={editStep} keyRoot={keyRoot} mode={mode} />
    </section>
  );
}

export default function VoicingEditor({
  steps,
  keyRoot,
  mode,
  editIdx,
  guitarMode,
  onChangeEditIdx,
  onMoveVoice,
  onShiftChordOctave,
  onSetVoicing,
  onSetStepChord,
  onClose,
}: VoicingEditorProps) {
  const isMobile = useIsMobile();
  const useFlat = keyUsesFlat(keyRoot);
  const [sheetVoice, setSheetVoice] = useState<
    { stepIdx: number; voiceIdx: number } | null
  >(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const editIdxRef = useRef(editIdx);
  editIdxRef.current = editIdx;

  const goTo = useCallback(
    (idx: number) => {
      const strip = stripRef.current;
      if (idx < 0 || idx >= steps.length || !strip) return;
      strip.scrollTo({ left: idx * strip.clientWidth, behavior: "smooth" });
    },
    [steps.length],
  );

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || editIdxRef.current < 0) return;
    strip.scrollLeft = editIdxRef.current * strip.clientWidth;
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

      <div
        ref={stripRef}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {steps.map((editStep, i) => (
          <SectionPanel
            key={editStep.id}
            editStep={editStep}
            i={i}
            steps={steps}
            keyRoot={keyRoot}
            mode={mode}
            useFlat={useFlat}
            onMoveVoice={onMoveVoice}
            onShiftChordOctave={onShiftChordOctave}
            onSelectVoice={(stepIdx, voiceIdx) => setSheetVoice({ stepIdx, voiceIdx })}
            onPanelRef={(el) => {
              panelRefs.current[i] = el;
            }}
          />
        ))}
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

      <VoiceTrajectorySheet
        step={sheetVoice ? steps[sheetVoice.stepIdx] ?? null : null}
        voiceIdx={sheetVoice?.voiceIdx ?? 0}
        guitarMode={guitarMode}
        useFlat={useFlat}
        onClose={() => setSheetVoice(null)}
        onCommitVoicing={(pitches) => {
          if (sheetVoice) onSetVoicing(sheetVoice.stepIdx, pitches);
          setSheetVoice(null);
        }}
        onCommitChord={(chord) => {
          if (sheetVoice) onSetStepChord(sheetVoice.stepIdx, chord);
          setSheetVoice(null);
        }}
      />
    </div>
  );
}
