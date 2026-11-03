import { beforeEach, describe, expect, it } from "vitest";
import { useSongStore } from "@/store/song";
import { DEFAULT_SOUND, resolveBass, resolveDrums, resolvePad, presetVoice, useSoundStore } from "@/store/sound";
import dreamon from "./dreamon-song.json";

const load = () => useSongStore.getState().loadFromJSON(JSON.parse(JSON.stringify(dreamon)));
const sound = () => useSoundStore.getState();

describe("per-section sound", () => {
  beforeEach(() => {
    useSoundStore.setState({ ...structuredClone(DEFAULT_SOUND) });
  });

  it("follows the song until a section changes something", () => {
    sound().setMix("drums", { on: true });
    expect(resolvePad(sound(), "x")).toEqual({ on: true, preset: sound().preset, arp: sound().arp });
    sound().setSectionPart("x", "drums", { energy: 0.9 });
    sound().setSectionPart("x", "bass", { on: true, sound: "acid" });
    expect(resolveDrums(sound(), "x").settings.energy).toBe(0.9);
    expect(resolveDrums(sound(), "x").settings.genre).toBe(sound().drums.genre);
    expect(resolveDrums(sound(), "y").settings.energy).toBe(sound().drums.energy);
    expect(resolveBass(sound(), "x")).toEqual({ on: true, settings: { ...sound().bass, sound: "acid" } });
    expect(resolveBass(sound(), "y").on).toBe(false);
  });

  it("an unset field never blanks the song's value, and empty overrides disappear", () => {
    sound().setSectionPart("x", "bass", { sound: "sub" });
    sound().setSectionPart("x", "bass", { sound: undefined });
    expect(resolveBass(sound(), "x").settings.sound).toBe(sound().bass.sound);
    expect(sound().sectionSound.x).toBeUndefined();
    sound().setSectionPart("x", "pad", { on: false });
    sound().setSectionPart("x", "pad", { on: undefined });
    expect(sound().sectionSound.x).toBeUndefined();
  });

  it("a section's own pad preset uses that preset's envelope; the song's keeps its tweaks", () => {
    sound().setADSR({ attack: 1.5 });
    sound().setSectionPart("x", "pad", { preset: "organ" });
    const pad = resolvePad(sound(), "x");
    expect(pad.preset).toBe("organ");
    expect(presetVoice(sound(), pad.preset).adsr.attack).not.toBe(1.5);
    expect(presetVoice(sound(), sound().preset).adsr.attack).toBe(1.5);
  });

  it("turns the old per-section Arpeggiator switch into a Hold pattern on load", () => {
    const off = dreamon.sections.filter((s) => (s as { arpArmed?: boolean }).arpArmed === false).map((s) => s.id);
    expect(off.length).toBeGreaterThan(0);
    load();
    for (const id of off) expect(resolvePad(sound(), id).arp.pattern).toBe("hold");
    expect(useSongStore.getState().sections.some((s) => s.arpArmed !== undefined)).toBe(false);
    const other = dreamon.sections.find((s) => !off.includes(s.id))!;
    expect(resolvePad(sound(), other.id).arp.pattern).not.toBe("hold");
  });

  it("keeps a section's sound when it is duplicated, and drops it for a new song", () => {
    load();
    const id = useSongStore.getState().sections[0].id;
    sound().setSectionPart(id, "drums", { genre: "shuffle" });
    const copy = useSongStore.getState().duplicateSection(id)!;
    expect(resolveDrums(sound(), copy).settings.genre).toBe("shuffle");
    useSongStore.getState().resetSong();
    expect(sound().sectionSound).toEqual({});
  });

  it("saves and reloads section sound with the song", () => {
    load();
    const id = useSongStore.getState().sections[1].id;
    sound().setSectionPart(id, "drums", { energy: 0.2, on: true });
    const json = JSON.parse(JSON.stringify(useSongStore.getState().toJSON()));
    useSoundStore.setState({ sectionSound: {} });
    useSongStore.getState().loadFromJSON(json);
    expect(resolveDrums(sound(), id)).toMatchObject({ on: true, settings: { energy: 0.2 } });
  });
});
