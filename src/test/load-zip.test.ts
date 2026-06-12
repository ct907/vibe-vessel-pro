import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseChord } from "@/lib/music/chords";

const SONG_JSON = {
  "version": 3,
  "meta": { "beatsPerBar": 4, "beatUnit": 4, "title": "Dream On", "keyRoot": "A", "keyMode": "maj", "bpm": 97 },
  "sections": [
    {
      "id": "B8_JzI5n-fHmtv5uDmt7x",
      "type": "verse",
      "label": "Verse",
      "collapsed": false,
      "chords": [
        { "id": "UA0n7ZmtICdO5FwG3MN2g", "chord": { "root": "A", "quality": "maj", "display": "A", "octave": 3 }, "lyricsPlacement": { "lineId": "ZlXuqH7scKsMLTOTz__V7", "slotIndex": 0 }, "progressionPlacement": { "patternId": "B8_JzI5n-fHmtv5uDmt7x", "startBeat": 0, "lengthBeats": 4 } },
        { "id": "tH7p0taWj8ZMt5nhVm0fb", "chord": { "root": "E", "quality": "7b9", "display": "E7b9", "octave": 3 }, "lyricsPlacement": { "lineId": "ZlXuqH7scKsMLTOTz__V7", "slotIndex": 6 }, "progressionPlacement": { "patternId": "B8_JzI5n-fHmtv5uDmt7x", "startBeat": 12, "lengthBeats": 4 } }
      ],
      "lines": [
        {
          "id": "ZlXuqH7scKsMLTOTz__V7",
          "text": "Kept up all night",
          "chords": [
            { "id": "UA0n7ZmtICdO5FwG3MN2g", "offset": 0, "slotIndex": 0, "chord": { "root": "A", "quality": "maj", "display": "A", "octave": 3 }, "mirrorId": "UA0n7ZmtICdO5FwG3MN2g" },
            { "id": "tH7p0taWj8ZMt5nhVm0fb", "offset": 6, "slotIndex": 6, "chord": { "root": "E", "quality": "7b9", "display": "E7b9", "octave": 3 }, "mirrorId": "tH7p0taWj8ZMt5nhVm0fb" }
          ]
        }
      ]
    }
  ],
  "progression": [
    {
      "id": "B8_JzI5n-fHmtv5uDmt7x",
      "sectionId": "B8_JzI5n-fHmtv5uDmt7x",
      "label": "Verse",
      "bars": 4,
      "beatsPerBar": 4,
      "chords": [
        { "id": "UA0n7ZmtICdO5FwG3MN2g", "chord": { "root": "A", "quality": "maj", "display": "A", "octave": 3 }, "startBeat": 0, "lengthBeats": 4, "mirrorId": "UA0n7ZmtICdO5FwG3MN2g" },
        { "id": "tH7p0taWj8ZMt5nhVm0fb", "chord": { "root": "E", "quality": "7b9", "display": "E7b9", "octave": 3 }, "startBeat": 12, "lengthBeats": 4, "mirrorId": "tH7p0taWj8ZMt5nhVm0fb" }
      ]
    }
  ],
  "suppressCrossTabDeleteWarning": false,
  "sound": { "preset": "rhodes", "volume": -10, "timbre": 0.45, "bpmRamp": true, "adsr": { "attack": 0.005, "decay": 0.9, "sustain": 0.25, "release": 1.4 }, "eq": { "low": 0, "mid": 0, "high": 0 }, "fx": { "delayWet": 0, "delayTime": 0.25, "delaySync": true, "delayDivision": "1/8", "delayFeedback": 0.25, "reverbWet": 0.18, "reverbDecay": 2.2, "chorusWet": 0, "chorusRate": 0.8, "chorusDepth": 0.4 }, "arp": { "pattern": "all", "repeat": "1/4", "bassMode": "off", "bassRepeat": "1", "swing": 0.5 } },
  "appTint": null,
  "appBackground": { "pattern": "none", "mask": "none" },
  "recordings": { "tracks": [] }
};

describe("zip loading", () => {
  it("parses all chord display strings from the zip", () => {
    const displays = ["A", "F#m", "Bm7", "E7b9", "Bm", "C#m", "F#", "D", "E7", "C#"];
    for (const d of displays) {
      const result = parseChord(d);
      expect(result, `parseChord("${d}") should not be null`).not.toBeNull();
    }
  });

  it("can build a zip with song.json and read it back", async () => {
    const zip = new JSZip();
    zip.file("song.json", JSON.stringify(SONG_JSON, null, 2));
    zip.folder("audio");
    const blob = await zip.generateAsync({ type: "blob" });

    // Read it back
    const zip2 = await JSZip.loadAsync(blob);
    const songFile = zip2.file("song.json");
    expect(songFile).not.toBeNull();

    const songText = await songFile!.async("string");
    const parsed = JSON.parse(songText);
    expect(parsed.version).toBe(3);
    expect(parsed.meta.title).toBe("Dream On");
  });

  it("simulates the full loadFromJSON validation path without throwing", async () => {
    // This mirrors the key parts of loadFromJSON to catch any runtime errors
    const parsed = SONG_JSON as any;
    expect(parsed.version === 2 || parsed.version === 3).toBe(true);

    const validateChord = (c: unknown) => {
      if (!c || typeof c !== "object") return null;
      const display = (c as { display?: unknown }).display;
      if (typeof display !== "string") return null;
      return parseChord(display);
    };

    let invalidCount = 0;
    for (const sec of parsed.sections) {
      for (const line of sec.lines) {
        for (const anchor of line.chords) {
          const v = validateChord(anchor.chord);
          if (!v) invalidCount++;
        }
      }
      for (const sc of (sec.chords ?? [])) {
        const v = validateChord(sc.chord);
        if (!v) invalidCount++;
      }
    }
    for (const p of parsed.progression) {
      for (const c of p.chords) {
        const v = validateChord(c.chord);
        if (!v) invalidCount++;
      }
    }
    expect(invalidCount).toBe(0);
  });
});
