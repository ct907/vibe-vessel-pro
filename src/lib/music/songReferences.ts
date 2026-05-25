import type { Quality, ChordFamily } from "./chords";

export interface SongReference {
  title: string;
  artist: string;
  qualities: Quality[];
  chordFamily: ChordFamily;
  context: string;
  genre: string;
  progression?: string;
}

export const SONG_REFERENCES: SongReference[] = [
  // Suspended
  {
    title: "Every Breath You Take", artist: "The Police",
    qualities: ["add9", "sus2"], chordFamily: "special",
    context: "The Aadd9 riff is built on a sus2 voicing that never fully resolves — creating the song's obsessive tension.",
    genre: "Pop/Rock",
    progression: "Aadd9 → F#m → Dadd9 → E",
  },
  {
    title: "Clocks", artist: "Coldplay",
    qualities: ["sus2"], chordFamily: "special",
    context: "The piano riff arpeggiates through Ebsus2 and other suspended voicings — the sustained openness defines the sound.",
    genre: "Alternative",
    progression: "Eb → Bbm → Fm",
  },
  {
    title: "Pinball Wizard", artist: "The Who",
    qualities: ["sus4"], chordFamily: "special",
    context: "The opening Bsus4 → B power chord hit is the blueprint for every rock sus4 resolution.",
    genre: "Rock",
    progression: "Bsus4 → B → Asus4 → A → Gsus4 → G",
  },
  {
    title: "Tom Sawyer", artist: "Rush",
    qualities: ["sus4"], chordFamily: "special",
    context: "Uses sus4 chords extensively in the verse riff — the unresolved fourth gives the synth line its restless quality.",
    genre: "Progressive Rock",
  },
  {
    title: "Brass in Pocket", artist: "The Pretenders",
    qualities: ["sus2", "sus4"], chordFamily: "special",
    context: "Asus2 and Asus4 alternate with A major throughout the verse — classic sus delay resolution.",
    genre: "Pop/Rock",
    progression: "Asus2 → A → Asus4 → A",
  },
  {
    title: "I Still Haven't Found What I'm Looking For", artist: "U2",
    qualities: ["sus4"], chordFamily: "special",
    context: "The guitar delays on sus4 voicings before resolving to major — the spiritual yearning sound of The Edge.",
    genre: "Rock",
  },

  // Augmented
  {
    title: "Oh! Darling", artist: "The Beatles",
    qualities: ["aug"], chordFamily: "special",
    context: "E augmented leads into A — the raised fifth pulls up chromatically into the root of the next chord.",
    genre: "Rock/Blues",
    progression: "A → A+ → D → Dm",
  },
  {
    title: "Crying", artist: "Roy Orbison",
    qualities: ["aug"], chordFamily: "special",
    context: "The augmented chord appears in the ascending chromatic bass line that defines the verse — I → I+ → IV.",
    genre: "Pop/Ballad",
    progression: "A → A+ → D → Dm → A",
  },
  {
    title: "Baby Hold On", artist: "Eddie Money",
    qualities: ["aug"], chordFamily: "special",
    context: "The verse walks through C → C+ → C6 — an ascending line cliché using the augmented chord as a passing voice.",
    genre: "Pop/Rock",
  },
  {
    title: "All My Loving", artist: "The Beatles",
    qualities: ["aug"], chordFamily: "special",
    context: "C+ appears between C and Am — the augmented triad connects the two chords via chromatic voice movement in the fifth.",
    genre: "Pop",
  },

  // Line cliché
  {
    title: "Stairway to Heaven", artist: "Led Zeppelin",
    qualities: ["minMaj7", "min7", "min6"], chordFamily: "minor",
    context: "The intro is the definitive minor line cliché: Am → AmMaj7 → Am7 → Am6 — a single note descends chromatically while the root holds.",
    genre: "Rock",
    progression: "Am → AmMaj7 → Am7 → Am6 → F → G → Am",
  },
  {
    title: "My Funny Valentine", artist: "Chet Baker / Miles Davis",
    qualities: ["minMaj7", "min7", "min6"], chordFamily: "minor",
    context: "Cm → CmMaj7 → Cm7 → Cm6 opens the standard — the descending inner voice over a static bass is the heart of jazz ballad writing.",
    genre: "Jazz",
    progression: "Cm → CmMaj7 → Cm7 → Cm6 → Abmaj7 → Fm7 → Dm7b5 → G7",
  },
  {
    title: "Something", artist: "The Beatles",
    qualities: ["minMaj7", "min7"], chordFamily: "minor",
    context: "The C → Cmaj7 → C7 → F line in the verse uses the major-side cliché — a descending voice from the major 7th through the dominant 7th.",
    genre: "Pop/Rock",
    progression: "C → Cmaj7 → C7 → F",
  },
  {
    title: "James Bond Theme", artist: "Monty Norman",
    qualities: ["minMaj7", "min6"], chordFamily: "minor",
    context: "The iconic Em → EmMaj7 → Em7 → Em6 vamp IS the Bond sound — dark, descending, and relentless.",
    genre: "Cinematic",
    progression: "Em → EmMaj7 → Em7 → Em6",
  },
  {
    title: "Michelle", artist: "The Beatles",
    qualities: ["minMaj7"], chordFamily: "minor",
    context: "Fm → FmMaj7 → Fm7 → Fm6 appears in the verse — the descending chromatic line against the static bass creates the bittersweet French feel.",
    genre: "Pop/Ballad",
    progression: "Fm → FmMaj7 → Fm7 → Fm6 → Db → C",
  },

  // Extended / neo soul
  {
    title: "Tyrone", artist: "Erykah Badu",
    qualities: ["min9", "9"], chordFamily: "minor",
    context: "The vamp sits on minor 9th and dominant 9th voicings — the extended harmony is what makes neo soul feel like neo soul.",
    genre: "Neo Soul",
  },
  {
    title: "Untitled (How Does It Feel)", artist: "D'Angelo",
    qualities: ["min9", "min7", "9"], chordFamily: "minor",
    context: "Stacked extended voicings throughout — the chord choices float between min9, dom9, and min7 creating a liquid harmonic bed.",
    genre: "Neo Soul/R&B",
  },
  {
    title: "Ordinary People", artist: "John Legend",
    qualities: ["maj9", "min9", "9"], chordFamily: "major",
    context: "The verse uses Bbmaj9 → Eb9 → Cm9 — every chord is an extended voicing, keeping the texture smooth and layered.",
    genre: "Neo Soul/Pop",
    progression: "Bbmaj9 → Eb9 → Cm9 → F9",
  },
  {
    title: "Just the Two of Us", artist: "Grover Washington Jr.",
    qualities: ["maj7", "min7", "9"], chordFamily: "major",
    context: "Dbmaj7 → Cb9 → Bbm7 → Eb9 — the classic chord loop that launched a thousand neo soul tracks.",
    genre: "Jazz/R&B",
    progression: "Dbmaj7 → Cb9 → Bbm7 → Eb9",
  },
  {
    title: "Killing Me Softly", artist: "Fugees (Roberta Flack)",
    qualities: ["min7", "maj7"], chordFamily: "minor",
    context: "Am7 → Dm7 → G7 → Cmaj7 — a textbook minor ii-V-I with extended voicings, smooth and understated.",
    genre: "R&B/Soul",
  },

  // Altered dominants
  {
    title: "Autumn Leaves", artist: "Miles Davis / Bill Evans",
    qualities: ["7b9"], chordFamily: "altered",
    context: "The V7b9 resolves to the minor tonic throughout — the defining cadence of the minor ii-V-i.",
    genre: "Jazz",
  },
  {
    title: "Purple Haze", artist: "Jimi Hendrix",
    qualities: ["7#9"], chordFamily: "altered",
    context: "E7#9 is the entire harmonic identity — the chord sits unresolved as a vamp, containing both major and minor thirds simultaneously.",
    genre: "Rock",
  },
  {
    title: "Superstition", artist: "Stevie Wonder",
    qualities: ["7#9"], chordFamily: "altered",
    context: "The riff implies Eb7#9 throughout — the sharp nine gives the funk groove its gritty edge.",
    genre: "Funk/Soul",
  },
  {
    title: "My Funny Valentine (altered)", artist: "Chet Baker / Miles Davis",
    qualities: ["7#5", "minMaj7"], chordFamily: "altered",
    context: "C7#5 resolves to Fm — the raised fifth moves up by semitone to the tonic root, a signature jazz voice-leading move.",
    genre: "Jazz",
  },
  {
    title: "Cry Me a River", artist: "Julie London",
    qualities: ["7b9"], chordFamily: "altered",
    context: "G7b9 creates the brooding tension before resolving to Cm in the verse.",
    genre: "Jazz/Torch",
  },
  {
    title: "Foxy Lady", artist: "Jimi Hendrix",
    qualities: ["7#9"], chordFamily: "altered",
    context: "F#7#9 vamps for the entire song, using the Hendrix chord as a tonal centre rather than a passing tension.",
    genre: "Rock",
  },

  // Power chords
  {
    title: "Smells Like Teen Spirit", artist: "Nirvana",
    qualities: ["5"], chordFamily: "neutral",
    context: "F5 → Bb5 → Ab5 → Db5 — power chords with no thirds, keeping the harmony ambiguous between major and minor.",
    genre: "Grunge/Rock",
    progression: "F5 → Bb5 → Ab5 → Db5",
  },
  {
    title: "Smoke on the Water", artist: "Deep Purple",
    qualities: ["5"], chordFamily: "neutral",
    context: "The riff is entirely power chords — G5 → Bb5 → C5 — the absence of thirds gives the raw, open sound.",
    genre: "Hard Rock",
    progression: "G5 → Bb5 → C5 → G5 → Bb5 → Db5 → C5",
  },
  {
    title: "Iron Man", artist: "Black Sabbath",
    qualities: ["5"], chordFamily: "neutral",
    context: "B5 → D5 → E5 → G5 → F#5 — power chords walking through a heavy metal riff where quality ambiguity is the point.",
    genre: "Metal",
    progression: "B5 → D5 → E5",
  },
  {
    title: "Blitzkrieg Bop", artist: "Ramones",
    qualities: ["5"], chordFamily: "neutral",
    context: "A5 → D5 → E5 → A5 — the punk I-IV-V played entirely as power chords, proving three notes are enough.",
    genre: "Punk",
    progression: "A5 → D5 → E5 → A5",
  },
];

export function findSongReferences(quality: Quality, limit = 3): SongReference[] {
  return SONG_REFERENCES.filter((s) => s.qualities.includes(quality)).slice(0, limit);
}

const HIDE_FOR_PLAIN_TRIAD: Quality[] = ["maj", "min"];

export function shouldShowSongRefs(quality: Quality): boolean {
  return !HIDE_FOR_PLAIN_TRIAD.includes(quality);
}
