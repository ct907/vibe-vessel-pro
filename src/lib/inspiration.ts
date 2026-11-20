export const MAX_INSPIRATION_ITEMS = 5;

export type InspirationService = "spotify" | "apple" | "youtube" | "soundcloud";

export const SERVICE_LABEL: Record<InspirationService, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
};

export interface EmbedInfo {
  service: InspirationService;
  /** Canonical page URL on the provider; safe to use as an external link. */
  url: string;
  /** Provider-hosted player URL, always built from parsed IDs on a fixed origin. */
  src: string;
  /** Fixed player height in px; omitted for 16:9 video players. */
  height?: number;
  allow: string;
  sandbox?: string;
}

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const SOUNDCLOUD_SEGMENT = /^[\w.~%-]+$/;
const APPLE_SLUG = /^[\w.~%-]+$/;

const SPOTIFY_ALLOW = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
const APPLE_ALLOW = "autoplay *; encrypted-media *; fullscreen *; clipboard-write";
const APPLE_SANDBOX =
  "allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation";

function parseSpotify(u: URL): EmbedInfo | null {
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  if (parts[0] === "embed") parts.shift();
  const [type, id] = parts;
  if (parts.length !== 2 || !SPOTIFY_ID.test(id)) return null;
  if (!["track", "album", "playlist", "episode", "show", "artist"].includes(type)) return null;
  return {
    service: "spotify",
    url: `https://open.spotify.com/${type}/${id}`,
    src: `https://open.spotify.com/embed/${type}/${id}`,
    height: type === "track" || type === "episode" ? 152 : 352,
    allow: SPOTIFY_ALLOW,
  };
}

function parseApple(u: URL): EmbedInfo | null {
  const [cc, type, ...rest] = u.pathname.split("/").filter(Boolean);
  if (!/^[a-z]{2}$/.test(cc ?? "") || !["album", "song", "playlist"].includes(type) || rest.length < 1 || rest.length > 2) {
    return null;
  }
  const id = rest[rest.length - 1];
  const slug = rest.length === 2 ? rest[0] : null;
  const idOk = type === "playlist" ? /^pl\.[A-Za-z0-9]+$/.test(id) : /^\d+$/.test(id);
  if (!idOk || (slug && !APPLE_SLUG.test(slug))) return null;
  const track = type === "album" ? u.searchParams.get("i") : null;
  if (track && !/^\d+$/.test(track)) return null;
  const path = `/${cc}/${type}/${slug ? `${slug}/` : ""}${id}${track ? `?i=${track}` : ""}`;
  return {
    service: "apple",
    url: `https://music.apple.com${path}`,
    src: `https://embed.music.apple.com${path}`,
    height: type === "song" || track ? 175 : 450,
    allow: APPLE_ALLOW,
    sandbox: APPLE_SANDBOX,
  };
}

function parseYouTube(u: URL): EmbedInfo | null {
  const short = u.hostname === "youtu.be";
  const parts = u.pathname.split("/").filter(Boolean);
  let video: string | null = null;
  if (short) video = parts[0] ?? null;
  else if (u.pathname === "/watch") video = u.searchParams.get("v");
  else if (["embed", "shorts", "live"].includes(parts[0])) video = parts[1] ?? null;
  const host = u.hostname === "music.youtube.com" ? "music.youtube.com" : "www.youtube.com";
  if (video) {
    if (!YOUTUBE_VIDEO_ID.test(video)) return null;
    return {
      service: "youtube",
      url: `https://${host}/watch?v=${video}`,
      src: `https://www.youtube-nocookie.com/embed/${video}`,
      allow: YOUTUBE_ALLOW,
    };
  }
  const list = !short && u.pathname === "/playlist" ? u.searchParams.get("list") : null;
  if (!list || !YOUTUBE_LIST_ID.test(list)) return null;
  return {
    service: "youtube",
    url: `https://${host}/playlist?list=${list}`,
    src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
    allow: YOUTUBE_ALLOW,
  };
}

function parseSoundCloud(u: URL): EmbedInfo | null {
  const parts = u.pathname.split("/").filter(Boolean);
  const isSet = parts.length === 3 && parts[1] === "sets";
  if (!(parts.length === 2 || isSet) || !parts.every((p) => SOUNDCLOUD_SEGMENT.test(p))) return null;
  const url = `https://soundcloud.com/${parts.join("/")}`;
  return {
    service: "soundcloud",
    url,
    src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&hide_related=true&show_comments=false&visual=false`,
    height: isSet ? 300 : 166,
    allow: "autoplay",
  };
}

/**
 * Turns a pasted streaming link into an official provider embed. Returns null for
 * anything that isn't a full link to a supported service (short links such as
 * spotify.link can't be resolved without a server). The iframe src is rebuilt from
 * validated IDs, never taken from the input, so imported project files can't smuggle
 * in an arbitrary URL.
 */
export function parseStreamingUrl(raw: string): EmbedInfo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "open.spotify.com") return parseSpotify(u);
  if (host === "music.apple.com" || host === "embed.music.apple.com") return parseApple(u);
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return parseYouTube(u);
  if (host === "soundcloud.com" || host === "www.soundcloud.com" || host === "m.soundcloud.com") return parseSoundCloud(u);
  return null;
}
