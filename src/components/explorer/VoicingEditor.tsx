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
import { playNotes } from "@/lib/music/audio";
import {
  VOICE_COLORS,
  VOICE_NAMES,
  VOICE_SHAPES,
  VOICE_SYMBOLS,
  findVoiceLinks,
  keyUsesFlat,
  nashvilleNumeral,
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

const MINI_H = 120;
const MINI_PAD_T = 28;
const MINI_PAD_B = 12;
const MINI_PLOT = MINI_H - MINI_PAD_T - MINI_PAD_B;
const MINI_LX = 80;
const MINI_RX = 220;

function shapePoints(shape: string, cx: number, cy: number, sz: number): string {
  switch (shape) {
    case "triangle":
      return `${cx},${cy - sz} ${cx - sz * 0.866},${cy + sz * 0.5} ${cx + sz * 0.866},${cy + sz * 0.5}`;
    case "square": {
      const s = sz * 0.82;
      return `${cx - s},${cy - s} ${cx + s},${cy - s} ${cx + s},${cy + s} ${cx - s},${cy + s}`;
    }
    case "pentagon": {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        pts.push(`${cx + sz * Math.cos(a)},${cy + sz * Math.sin(a)}`);
      }
      return pts.join(" ");
    }
    case "diamond":
      return `${cx},${cy - sz} ${cx + sz * 0.82},${cy} ${cx},${cy + sz} ${cx - sz * 0.82},${cy}`;
    default:
      return "";
  }
}

function VoiceLeadingMiniChart({
  leftStep,
  rightStep,
  useFlat,
}: {
  leftStep: ExplorerStep;
  rightStep: ExplorerStep;
  useFlat: boolean;
}) {
  const all = [...leftStep.pitches, ...rightStep.pitches];
  const minP = Math.min(...all) - 3;
  const maxP = Math.max(...all) + 3;
  const range = maxP - minP || 1;
  const yFor = (p: number) => MINI_PAD_T + MINI_PLOT - ((p - minP) / range) * MINI_PLOT;
  const links = findVoiceLinks(leftStep.pitches, rightStep.pitches);

  const renderChord = (step: ExplorerStep, cx: number) =>
    step.pitches.map((pitch, v) => {
      const shapeIdx = Math.min(v, 3);
      const cy = yFor(pitch);
      return (
        <g key={`${cx}-${v}`}>
          <polygon
            points={shapePoints(VOICE_SHAPES[shapeIdx], cx, cy, 7)}
            fill={VOICE_COLORS[shapeIdx]}
            stroke="oklch(1 0 0 / 0.75)"
            strokeWidth="0.75"
          />
          <text
            x={cx}
            y={cy + (VOICE_SHAPES[shapeIdx] === "triangle" ? 7 * 0.22 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={8}
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="700"
            fill="oklch(1 0 0)"
            stroke="oklch(0.2 0.02 60 / 0.45)"
            strokeWidth="0.5"
            paintOrder="stroke"
          >
            {pcToName(((pitch % 12) + 12) % 12, useFlat)}
          </text>
        </g>
      );
    });

  return (
    <svg
      width="100%"
      height={MINI_H}
      viewBox={`0 0 300 ${MINI_H}`}
      className="block"
      role="img"
      aria-label="Voice leading between the two chords"
    >
      {[MINI_LX, MINI_RX].map((cx) => (
        <rect
          key={cx}
          x={cx - 44}
          y={MINI_PAD_T - 8}
          width={88}
          height={MINI_PLOT + 16}
          rx="8"
          fill="oklch(0 0 0 / 0.025)"
        />
      ))}
      {links.map((lk, li) => (
        <line
          key={li}
          x1={MINI_LX}
          y1={yFor(leftStep.pitches[lk.fromVoice])}
          x2={MINI_RX}
          y2={yFor(rightStep.pitches[lk.toVoice])}
          stroke={VOICE_COLORS[Math.min(lk.fromVoice, 3)]}
          strokeWidth={lk.type === "direct" ? (lk.dist === 0 ? 3 : 2.2) : 1.6}
          strokeOpacity={lk.type === "direct" ? 0.7 : 0.4}
          strokeDasharray={lk.type === "octave" ? "4 3" : undefined}
        />
      ))}
      {renderChord(leftStep, MINI_LX)}
      {renderChord(rightStep, MINI_RX)}
    </svg>
  );
}

function VoiceColumn({
  step,
  stepIdx,
  editable,
  useFlat,
  onMoveVoice,
}: {
  step: ExplorerStep;
  stepIdx: number;
  editable: boolean;
  useFlat: boolean;
  onMoveVoice: (stepIdx: number, voiceIdx: number, dir: 1 | -1) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {[...step.pitches.entries()].reverse().map(([v, pitch]) => {
        const shapeIdx = Math.min(v, 3);
        const name = pcToName(((pitch % 12) + 12) % 12, useFlat);
        return (
          <div
            key={v}
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
              onClick={() => void playNotes([pitch], 0.5)}
              aria-label={`Play ${name}`}
              className="font-mono-chord rounded px-1 text-base font-bold text-ink hover:bg-[var(--paper-shade)]"
            >
              {name}
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

      <div className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        {steps.map((editStep, i) => {
          const isFirst = i === 0;
          const neighbor = isFirst ? steps[1] ?? null : steps[i - 1];
          const leftStep = isFirst ? editStep : neighbor;
          const rightStep = isFirst ? neighbor : editStep;
          const editableIsLeft = isFirst;
          return (
            <section
              key={editStep.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className="flex w-full shrink-0 snap-center flex-col gap-2 overflow-y-auto p-3"
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
                        <span className="font-semibold text-[var(--primary-strong)]">
                          {" "}
                          · editing
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {leftStep && rightStep ? (
                <VoiceLeadingMiniChart
                  leftStep={leftStep}
                  rightStep={rightStep}
                  useFlat={useFlat}
                />
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg bg-[var(--paper-shade)] px-4 text-center text-[11px] italic text-ink-soft"
                  style={{ height: MINI_H }}
                >
                  Add a chord from the palette to see voice leading.
                </div>
              )}

              <div className={`grid gap-x-3 ${rightStep ? "grid-cols-2" : "grid-cols-1"}`}>
                <VoiceColumn
                  step={leftStep!}
                  stepIdx={i}
                  editable={editableIsLeft}
                  useFlat={useFlat}
                  onMoveVoice={onMoveVoice}
                />
                {rightStep && (
                  <VoiceColumn
                    step={rightStep}
                    stepIdx={i}
                    editable={!editableIsLeft}
                    useFlat={useFlat}
                    onMoveVoice={onMoveVoice}
                  />
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
