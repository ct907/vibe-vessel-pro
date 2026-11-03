import { describe, expect, it } from "vitest";
import { makeEnvelope } from "@/lib/audio/voices";

type Ev = { t: number; v: number; kind: "set" | "linear" | "exp" };

/** AudioParam stand-in that evaluates its automation the way the Web Audio spec does. */
function fakeParam() {
  let events: Ev[] = [];
  const add = (e: Ev) => { events = [...events.filter((x) => x.t !== e.t || x.kind !== e.kind), e].sort((a, b) => a.t - b.t); };
  const param = {
    value: 0.0001,
    setValueAtTime(v: number, t: number) { add({ t, v, kind: "set" }); return param; },
    linearRampToValueAtTime(v: number, t: number) { add({ t, v, kind: "linear" }); return param; },
    exponentialRampToValueAtTime(v: number, t: number) { add({ t, v, kind: "exp" }); return param; },
    cancelScheduledValues(t: number) { events = events.filter((e) => e.t < t); return param; },
  };
  const valueAt = (t: number) => {
    let prev: Ev | undefined;
    for (const e of events) {
      if (e.t <= t) { prev = e; continue; }
      if (!prev) return 0.0001;
      if (e.kind === "set") return prev.v;
      const k = (t - prev.t) / (e.t - prev.t);
      return e.kind === "linear" ? prev.v + (e.v - prev.v) * k : prev.v * Math.pow(e.v / prev.v, k);
    }
    return prev?.v ?? 0.0001;
  };
  return { param: param as unknown as AudioParam, valueAt };
}

const adsr = { attack: 0.6, decay: 0.4, sustain: 0.5, release: 1.5 };
const sample = (from: number, to: number, step = 0.01) => {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push(t);
  return out;
};

describe("envelope", () => {
  it("rises linearly, decays to sustain, then holds", () => {
    const { param, valueAt } = fakeParam();
    const env = makeEnvelope(param, adsr, 1);
    env.start(1);
    expect(valueAt(1.3)).toBeCloseTo(0.5, 2);
    expect(valueAt(1.6)).toBeCloseTo(1, 5);
    expect(valueAt(3)).toBeCloseTo(0.5, 5);
    for (const t of sample(1, 3)) expect(env.levelAt(t)).toBeCloseTo(valueAt(t), 6);
  });

  it("a release scheduled before the note starts, inside the attack, still sounds and tails off", () => {
    const { param, valueAt } = fakeParam();
    const env = makeEnvelope(param, adsr, 1);
    env.start(1);
    const end = env.release(1.25, adsr.release);
    expect(end).toBeCloseTo(2.75, 6);
    // No silent span: the attack still runs up to the release point.
    expect(valueAt(1.2)).toBeGreaterThan(0.3);
    expect(valueAt(1.25)).toBeCloseTo(0.25 / 0.6, 2);
    // A real tail, not a cut.
    expect(valueAt(1.5)).toBeGreaterThan(0.1);
    expect(valueAt(2.75)).toBeLessThan(0.001);
    for (const t of sample(1, 3)) expect(env.levelAt(t)).toBeCloseTo(valueAt(t), 6);
  });

  it("a later, shorter release cuts into an earlier one without a jump", () => {
    const { param, valueAt } = fakeParam();
    const env = makeEnvelope(param, adsr, 1);
    env.start(0);
    env.release(2, adsr.release);
    const before = valueAt(2.4);
    const end = env.release(2.4, 0.05);
    expect(end).toBeCloseTo(2.45, 6);
    expect(valueAt(2.4)).toBeCloseTo(before, 6);
    expect(valueAt(2.45)).toBeLessThan(0.001);
    for (const t of sample(0, 3)) expect(env.levelAt(t)).toBeCloseTo(valueAt(t), 6);
  });

  it("never lengthens a fade that is already shorter", () => {
    const { param } = fakeParam();
    const env = makeEnvelope(param, adsr, 1);
    env.start(0);
    expect(env.release(1, 0.1)).toBeCloseTo(1.1, 6);
    expect(env.release(1.05, 2)).toBeCloseTo(1.1, 6);
    expect(env.release(1.2, 0.01)).toBeCloseTo(1.1, 6);
  });

  it("handles zero sustain and zero decay", () => {
    const { param, valueAt } = fakeParam();
    const env = makeEnvelope(param, { attack: 0.001, decay: 0, sustain: 0, release: 0.2 }, 0.8);
    env.start(0);
    env.release(0.5, 0.2);
    for (const t of sample(0, 1)) {
      expect(Number.isFinite(valueAt(t))).toBe(true);
      expect(env.levelAt(t) * 0.8).toBeCloseTo(valueAt(t), 6);
    }
  });
});
