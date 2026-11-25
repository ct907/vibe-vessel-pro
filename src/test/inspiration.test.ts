import { describe, it, expect, beforeEach } from "vitest";
import { parseStreamingUrl, MAX_INSPIRATION_ITEMS } from "@/lib/inspiration";
import { useSongStore } from "@/store/song";
import song from "./dreamon-song.json";

const SPOTIFY_ID = "4cOdK2wGLETKBW3PvgPWqT";

describe("parseStreamingUrl", () => {
  it("parses Spotify links, including locale prefixes, tracking params and embed URLs", () => {
    for (const raw of [
      `https://open.spotify.com/track/${SPOTIFY_ID}`,
      `https://open.spotify.com/intl-de/track/${SPOTIFY_ID}?si=abc123`,
      `https://open.spotify.com/embed/track/${SPOTIFY_ID}`,
    ]) {
      const e = parseStreamingUrl(raw);
      expect(e?.service).toBe("spotify");
      expect(e?.url).toBe(`https://open.spotify.com/track/${SPOTIFY_ID}`);
      expect(e?.src).toBe(`https://open.spotify.com/embed/track/${SPOTIFY_ID}`);
      expect(e?.height).toBe(152);
    }
    expect(parseStreamingUrl(`https://open.spotify.com/album/${SPOTIFY_ID}`)?.height).toBe(352);
  });

  it("parses Apple Music songs and albums onto the embed host", () => {
    const song = parseStreamingUrl("https://music.apple.com/us/album/some-album/1440857781?i=1440857785&uo=4");
    expect(song?.service).toBe("apple");
    expect(song?.url).toBe("https://music.apple.com/us/album/some-album/1440857781?i=1440857785");
    expect(song?.src).toBe("https://embed.music.apple.com/us/album/some-album/1440857781?i=1440857785");
    expect(song?.height).toBe(175);
    expect(song?.sandbox).toContain("allow-scripts");
    expect(parseStreamingUrl("https://music.apple.com/gb/album/some-album/1440857781")?.height).toBe(450);
    expect(parseStreamingUrl("https://music.apple.com/us/playlist/mix/pl.abc123")?.service).toBe("apple");
  });

  it("parses YouTube video links onto the privacy-enhanced embed host", () => {
    for (const raw of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
      "https://youtu.be/dQw4w9WgXcQ?si=xyz",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const e = parseStreamingUrl(raw);
      expect(e?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(e?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      expect(e?.height).toBeUndefined();
    }
    expect(parseStreamingUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")?.url).toBe(
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(parseStreamingUrl("https://www.youtube.com/playlist?list=PLabcdefghij123")?.src).toBe(
      "https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdefghij123",
    );
  });

  it("parses SoundCloud tracks and sets", () => {
    const track = parseStreamingUrl("https://soundcloud.com/forss/flickermood?utm_source=x");
    expect(track?.url).toBe("https://soundcloud.com/forss/flickermood");
    expect(track?.src).toContain("https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood");
    expect(track?.src).toContain("auto_play=false");
    expect(track?.height).toBe(166);
    expect(parseStreamingUrl("https://soundcloud.com/forss/sets/soulhack")?.height).toBe(300);
  });

  it("rejects short links, unsupported hosts, bad IDs and non-http schemes", () => {
    for (const raw of [
      "https://spotify.link/abc123",
      "https://on.soundcloud.com/abc123",
      "https://example.com/track/x",
      "https://open.spotify.com.evil.com/track/" + SPOTIFY_ID,
      "https://evil.com/?u=https://open.spotify.com/track/" + SPOTIFY_ID,
      "https://open.spotify.com/track/short",
      "https://open.spotify.com/user/someone",
      "https://www.youtube.com/watch?v=tooshort",
      "https://soundcloud.com/discover",
      "https://music.apple.com/us/artist/someone/123",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(parseStreamingUrl(raw), raw).toBeNull();
    }
  });

  it("never lets input text reach the iframe src or link href", () => {
    const e = parseStreamingUrl(`https://open.spotify.com/track/${SPOTIFY_ID}?x="><script>alert(1)</script>`);
    expect(e?.src).toBe(`https://open.spotify.com/embed/track/${SPOTIFY_ID}`);
    expect(e?.url).not.toContain("script");
  });
});

describe("inspiration items in the song store", () => {
  const photo = (id: string) => ({ id, dataUrl: "data:image/webp;base64,AAAA", x: 0, y: 0 });
  const link = (id: string) => ({
    id,
    kind: "link" as const,
    service: "spotify" as const,
    url: `https://open.spotify.com/track/${SPOTIFY_ID}`,
  });

  beforeEach(() => {
    useSongStore.setState({ inspirationPhotos: [] });
  });

  it("enforces a combined limit across photos and links", () => {
    const { addInspirationPhoto } = useSongStore.getState();
    for (let i = 0; i < 3; i++) addInspirationPhoto(photo(`p${i}`));
    for (let i = 0; i < 4; i++) addInspirationPhoto(link(`l${i}`));
    expect(useSongStore.getState().inspirationPhotos).toHaveLength(MAX_INSPIRATION_ITEMS);
  });

  it("loads projects saved before links existed (no kind on photos)", () => {
    useSongStore.getState().loadFromJSON({ ...song, inspirationPhotos: [photo("a"), photo("b")] });
    expect(useSongStore.getState().inspirationPhotos.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("re-validates links from imported files and drops anything unsafe", () => {
    useSongStore.getState().loadFromJSON({
      ...song,
      inspirationPhotos: [
        photo("keep-photo"),
        link("keep-link"),
        { id: "evil-1", kind: "link", service: "spotify", url: "javascript:alert(1)" },
        { id: "evil-2", kind: "link", service: "spotify", url: "https://evil.com/track/x" },
        { id: "no-url", kind: "link", service: "spotify" },
        { id: "bad-photo", kind: "image" },
        null,
        { kind: "link", url: `https://open.spotify.com/track/${SPOTIFY_ID}` },
        // service and url are re-derived, so a tampered service field can't survive
        { id: "tampered", kind: "link", service: "youtube", url: `https://open.spotify.com/track/${SPOTIFY_ID}` },
      ],
    });
    const items = useSongStore.getState().inspirationPhotos;
    expect(items.map((p) => p.id)).toEqual(["keep-photo", "keep-link", "tampered"]);
    expect(items[2]).toMatchObject({ kind: "link", service: "spotify" });
  });

  it("caps imported files at the limit", () => {
    useSongStore.getState().loadFromJSON({
      ...song,
      inspirationPhotos: Array.from({ length: 9 }, (_, i) => photo(`p${i}`)),
    });
    expect(useSongStore.getState().inspirationPhotos).toHaveLength(MAX_INSPIRATION_ITEMS);
  });

  it("stores a trimmed, length-capped label on links only, and clears it when emptied", () => {
    const { addInspirationPhoto, setInspirationLabel } = useSongStore.getState();
    addInspirationPhoto(link("l1"));
    addInspirationPhoto(photo("p1"));
    setInspirationLabel("l1", "  Dreams — Fleetwood Mac  ");
    expect(useSongStore.getState().inspirationPhotos[0]).toMatchObject({ label: "Dreams — Fleetwood Mac" });
    setInspirationLabel("l1", "x".repeat(200));
    expect((useSongStore.getState().inspirationPhotos[0] as { label: string }).label).toHaveLength(60);
    setInspirationLabel("p1", "nope");
    expect(useSongStore.getState().inspirationPhotos[1]).not.toHaveProperty("label");
    setInspirationLabel("l1", "   ");
    expect(useSongStore.getState().inspirationPhotos[0]).not.toHaveProperty("label");
  });

  it("sanitises labels from imported files (non-strings dropped, long ones capped)", () => {
    useSongStore.getState().loadFromJSON({
      ...song,
      inspirationPhotos: [
        { ...link("a"), label: "Good Song, Great Artist" },
        { ...link("b"), label: { evil: true } },
        { ...link("c"), label: "y".repeat(500) },
      ],
    });
    const items = useSongStore.getState().inspirationPhotos as Array<{ label?: string }>;
    expect(items[0].label).toBe("Good Song, Great Artist");
    expect(items[1]).not.toHaveProperty("label");
    expect(items[2].label).toHaveLength(60);
  });
});
