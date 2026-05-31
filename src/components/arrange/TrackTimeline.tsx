import { useState } from "react";
import { Plus, Trash2, Timer, GripVertical, Copy, Star } from "lucide-react";
import { useSongStore } from "@/store/song";
import { useRecordingsStore, type RecTrack } from "@/store/recordings";
import { useTakesStore } from "@/store/takes";
import { useIsMobile } from "@/hooks/use-mobile";
import { Waveform } from "@/components/common/Waveform";

const PX_PER_BAR = 26;

/** Hash a string into a stable waveform seed. */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100;
  return h;
}

/** Bars for a section = sum of its pattern bars, or a sensible default. */
function useSectionBars() {
  const sections = useSongStore((s) => s.sections);
  const progression = useSongStore((s) => s.progression);
  const beatsPerBar = useSongStore((s) => s.meta.beatsPerBar);
  let cursor = 0;
  const layout = sections.map((sec) => {
    const bars =
      progression
        .filter((p) => (p.sectionId ?? p.id) === sec.id)
        .reduce((a, p) => a + p.bars, 0) || 4;
    const chords = [...new Map(sec.chords.map((c) => [c.chord.display, c.chord])).values()].slice(0, 4);
    const tintKey = sec.color;
    const block = { id: sec.id, label: sec.label, bars, chords, startBar: cursor, tintKey };
    cursor += bars;
    return block;
  });
  return { layout, totalBars: cursor, beatsPerBar };
}

/** Best-takes clipboard tray, pinned at the top of Track view. */
function BestTakesTray() {
  const best = useTakesStore((s) => s.takes.filter((t) => t.best));
  return (
    <div className="px-4 pb-3">
      <div className="rounded-xl border border-border p-2.5" style={{ background: "var(--paper-shade-soft)" }}>
        <div className="mb-2 flex items-center gap-1.5">
          <Copy className="h-3.5 w-3.5 text-ink-soft" />
          <span className="font-mono-chord text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Best takes — drag into a track
          </span>
        </div>
        <div className="hide-scroll flex gap-2 overflow-x-auto">
          {best.length === 0 ? (
            <span className="py-1.5 text-xs italic text-ink-soft">Star takes in Write to pin them here.</span>
          ) : (
            best.map((take) => (
              <div
                key={take.id}
                className="flex shrink-0 cursor-grab items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-2 pr-2.5"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <GripVertical className="h-3.5 w-3.5 text-ink-soft" />
                <Star className="h-3 w-3" style={{ fill: "var(--star,#e8a838)", color: "var(--star,#e8a838)" }} />
                <span className="whitespace-nowrap text-xs font-bold text-ink">{take.name}</span>
                <Waveform width={44} height={14} seed={take.seed} color="var(--primary)" />
                <span className="font-mono-chord text-[9px] text-ink-soft">{take.duration}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Delay-compensation stepper panel (±1s / ±100ms / ±10ms). UI state only. */
function DelayPanel({ offsetMs, onNudge }: { offsetMs: number; onNudge: (d: number) => void }) {
  const rows: Array<{ label: string; delta: number }> = [
    { label: "±1 s", delta: 1000 },
    { label: "±100 ms", delta: 100 },
    { label: "±10 ms", delta: 10 },
  ];
  return (
    <div
      className="flex flex-col gap-1.5 border-t border-border p-3"
      style={{ background: "var(--paper-shade-soft)" }}
    >
      <div className="font-mono-chord text-[9.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
        Delay compensation
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2">
            <span className="w-14 text-[11px] text-ink-soft">{r.label}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNudge(-r.delta)}
                aria-label={`Back ${r.label}`}
                className="inline-flex h-7 w-[30px] items-center justify-center rounded-md border border-border bg-paper text-base font-bold text-ink"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onNudge(r.delta)}
                aria-label={`Forward ${r.label}`}
                className="inline-flex h-7 w-[30px] items-center justify-center rounded-md border border-border bg-paper text-base font-bold text-ink"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-soft">
        Offset:{" "}
        <span className="font-mono-chord text-ink">
          {(offsetMs >= 0 ? "+" : "") + (offsetMs / 1000).toFixed(3)} s
        </span>
      </div>
    </div>
  );
}

/** BandLab-style rolling timeline. */
export function TrackTimeline() {
  const isMobile = useIsMobile();
  const { layout, totalBars, beatsPerBar } = useSectionBars();
  const bpm = useSongStore((s) => s.meta.bpm);
  const tracks = useRecordingsStore((s) => s.tracks);
  const addTrack = useRecordingsStore((s) => s.addTrack);
  const removeClip = useRecordingsStore((s) => s.removeClip);
  const recordingTrackId = useRecordingsStore((s) => s.recordingTrackId);
  const setRecording = useRecordingsStore((s) => s.setRecording);

  const [delayOpen, setDelayOpen] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});

  const LANE_H = isMobile ? 114 : 78;
  const LABEL_W = isMobile ? 138 : 156;
  const timelineW = totalBars * PX_PER_BAR;
  const secPerBar = (60 / bpm) * beatsPerBar;

  const nudge = (tid: string, d: number) =>
    setOffsets((o) => ({ ...o, [tid]: Math.max(-2000, Math.min(2000, (o[tid] || 0) + d)) }));
  const clearTrack = (t: RecTrack) => t.clips.forEach((c) => removeClip(t.id, c.blobId));
  const toggleRecord = (tid: string) =>
    setRecording(recordingTrackId !== tid, recordingTrackId === tid ? null : tid);

  return (
    <div className="pb-32">
      <BestTakesTray />

      <div className="flex items-center gap-2.5 px-4 pb-2.5">
        <span className="font-mono-chord text-[11px] text-ink-soft">
          {totalBars} bars · {beatsPerBar}/4
        </span>
        <div className="flex-1" />
        <span className="text-[11px] font-bold text-ink-soft">{tracks.length} tracks</span>
      </div>

      <div className="hide-scroll overflow-x-auto border-t border-border">
        <div style={{ width: timelineW + LABEL_W, position: "relative" }}>
          {/* Bar ruler */}
          <div
            className="flex h-[18px]"
            style={{ paddingLeft: LABEL_W, background: "var(--paper-shade-soft)" }}
          >
            {Array.from({ length: Math.ceil(totalBars / 4) }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 border-l border-border pl-1 font-mono-chord text-[9px] text-ink-soft"
                style={{ width: PX_PER_BAR * 4, boxSizing: "border-box" }}
              >
                {i * 4 + 1}
              </div>
            ))}
          </div>

          {/* Section / chord lane */}
          <div className="flex gap-0.5 py-1" style={{ paddingLeft: LABEL_W }}>
            {layout.map((sec) => (
              <div
                key={sec.id}
                className="shrink-0 overflow-hidden rounded-md px-1.5 py-1"
                style={{
                  width: sec.bars * PX_PER_BAR - 2,
                  background: sec.tintKey ? `var(--section-tint-${sec.tintKey})` : "var(--paper-shade)",
                  boxSizing: "border-box",
                }}
              >
                <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.04em] text-cocoa-deep">
                  {sec.label}
                </span>
                <div className="mt-0.5 flex gap-0.5">
                  {sec.chords.map((c, i) => (
                    <span
                      key={i}
                      className="whitespace-nowrap rounded px-1 py-px font-mono-chord text-[8.5px] font-bold text-cocoa-deep"
                      style={{ background: "rgba(255,255,255,0.45)" }}
                    >
                      {c.display}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Track lanes */}
          <div className="relative">
            {/* Playhead at the start of the timeline */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-[6] w-0.5"
              style={{ left: LABEL_W, background: "var(--destructive)" }}
            >
              <div
                className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--destructive)" }}
              />
            </div>

            {tracks.map((track) => {
              const isRec = recordingTrackId === track.id;
              const showDelay = delayOpen === track.id;
              const offBars = ((offsets[track.id] || 0) / 1000 / secPerBar);
              return (
                <div key={track.id}>
                  <div className="flex items-stretch border-b border-border" style={{ minHeight: LANE_H }}>
                    {/* Sticky label + controls */}
                    <div
                      className="sticky left-0 z-[5] flex shrink-0 flex-col justify-center gap-3 border-r border-border px-2.5 py-2"
                      style={{ width: LABEL_W, background: isRec ? "#fbe9e9" : "var(--paper-shade-soft)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: track.color }}
                        />
                        <span className="truncate text-xs font-bold text-ink">{track.name}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleRecord(track.id)}
                          aria-label="Record"
                          className={
                            "inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border" +
                            (isRec ? " animate-rec-pulse" : "")
                          }
                          style={{
                            borderColor: isRec ? "var(--destructive)" : "var(--border)",
                            background: isRec ? "var(--destructive)" : "var(--paper)",
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: isRec ? 2 : 5,
                              background: isRec ? "#fff" : "var(--destructive)",
                            }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => clearTrack(track)}
                          aria-label="Clear track"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDelayOpen(showDelay ? null : track.id)}
                          aria-label="Delay compensation"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:text-ink"
                        >
                          <Timer className="h-3.5 w-3.5" />
                        </button>
                        {offsets[track.id] ? (
                          <span className="font-mono-chord text-[8.5px] text-ink-soft">
                            {(offsets[track.id] > 0 ? "+" : "") + offsets[track.id]}ms
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Lane */}
                    <div
                      className="relative flex-1"
                      style={{ background: isRec ? "#fdf3f3" : "var(--card)" }}
                    >
                      {Array.from({ length: totalBars }).map((_, i) => (
                        <div
                          key={i}
                          className="absolute bottom-0 top-0"
                          style={{
                            left: i * PX_PER_BAR,
                            width: 1,
                            background: i % 4 === 0 ? "var(--border)" : "transparent",
                            opacity: 0.6,
                          }}
                        />
                      ))}
                      {track.clips.map((clip) => {
                        const len = clip.trimEndSec - clip.trimStartSec;
                        const startBar = clip.startSec / secPerBar + offBars;
                        const lengthBars = Math.max(0.5, len / secPerBar);
                        const seed = seedFromId(clip.blobId);
                        return (
                          <div
                            key={clip.blobId}
                            className="absolute flex cursor-grab flex-col justify-center overflow-hidden rounded-md px-1.5"
                            style={{
                              top: 6,
                              bottom: 6,
                              left: startBar * PX_PER_BAR + 2,
                              width: lengthBars * PX_PER_BAR - 4,
                              background: track.color,
                              boxShadow: "0 1px 4px rgba(61,43,26,0.18)",
                            }}
                          >
                            <span
                              className="truncate text-[9px] font-bold text-white"
                              style={{ textShadow: "0 1px 1px rgba(0,0,0,0.2)" }}
                            >
                              {track.name}
                            </span>
                            <Waveform
                              width={Math.max(8, lengthBars * PX_PER_BAR - 16)}
                              height={isMobile ? 34 : 22}
                              seed={seed}
                              color="#fff"
                              opacity={0.55}
                            />
                          </div>
                        );
                      })}
                      {track.clips.length === 0 && !isRec && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] italic text-ink-soft">
                          Drop a take or record
                        </div>
                      )}
                      {isRec && (
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-destructive">
                          ● Recording along…
                        </div>
                      )}
                    </div>
                  </div>
                  {showDelay && (
                    <div className="flex border-b border-border">
                      <div className="sticky left-0 z-[5]" style={{ width: "min(92vw, 320px)" }}>
                        <DelayPanel offsetMs={offsets[track.id] || 0} onNudge={(d) => nudge(track.id, d)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add track */}
            <div className="flex h-10 items-center">
              <div className="sticky left-0 z-[5] shrink-0 px-2" style={{ width: LABEL_W }}>
                <button
                  type="button"
                  onClick={() => addTrack()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-bold text-ink-soft"
                  style={{ border: "1.5px dashed var(--border)" }}
                >
                  <Plus className="h-3 w-3" /> Add track
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
