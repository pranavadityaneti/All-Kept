/**
 * The address that plays a save inside Allkept.
 *
 * Instagram and YouTube both publish an embed page meant for exactly this; the video file itself is
 * never touched, which is what their terms require and what keeps the @allkeptapp account safe.
 */
export interface EmbeddableItem { platform: string; canonicalUrl: string | null; sourceUrl: string | null; externalId: string | null }

const INSTAGRAM = /instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

/** The site the embeds are told they are running on. Our own, so it is honest and stable. */
export const EMBED_ORIGIN = "https://pranavadityaneti.github.io";

export function embedUrl(item: EmbeddableItem): string | null {
  const link = item.canonicalUrl ?? item.sourceUrl ?? "";
  if (item.platform === "instagram") {
    const m = INSTAGRAM.exec(link);
    if (!m) return null;
    const kind = m[1]!.toLowerCase() === "reels" ? "reel" : m[1]!.toLowerCase();
    return `https://www.instagram.com/${kind}/${m[2]}/embed/`;
  }
  if (item.platform === "youtube" && item.externalId) {
    // The no-cookie host, and inline playback so it does not take over the screen.
    // origin is what stops YouTube answering with "Video player configuration error (153)": their
    // player refuses an embed that arrives with no referrer, and a WebView loading a bare address
    // sends none. The value must match the referrer the player is given (see EmbedPlayer).
    return `https://www.youtube-nocookie.com/embed/${item.externalId}?playsinline=1&rel=0&origin=${encodeURIComponent(EMBED_ORIGIN)}`;
  }
  return null;
}

/**
 * How an embed decides its own size.
 *
 * A `card` carries a real height of its own — Instagram sends a picture with its chrome underneath —
 * so it is asked how tall it is and the frame is cut to fit. A `player` has no height of its own: it
 * fills whatever box it is given. Asking one how tall it is only measures the box we just drew, and
 * answering with that measurement shrinks the box a little each time round, which is why a YouTube
 * video used to close up on itself as it played. Players are laid out, never measured.
 */
export type EmbedFit = "card" | "player";

export function embedFit(platform: string): EmbedFit {
  return platform === "youtube" ? "player" : "card";
}

/** What a video is drawn as when its real shape was never learned. Most of the web is 16:9. */
export const DEFAULT_ASPECT = 16 / 9;

/**
 * The box to draw a player in: the largest rectangle of the video's own shape that fits the space.
 *
 * A tall video is narrowed rather than allowed to overflow, and a wide one keeps its width rather
 * than being stretched down the screen, so a video is never sitting inside a frame of the wrong
 * shape with black bars making up the difference.
 */
export function fitBox(aspect: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  let width = maxWidth;
  let height = width / a;
  if (height > maxHeight) { height = maxHeight; width = height * a; }
  return { width: Math.round(width), height: Math.round(height) };
}

/** A rough starting height for a card, replaced by the real one as soon as the page reports it. */
export function initialHeight(platform: string, width: number): number {
  if (platform === "youtube") return Math.round(width * 0.5625) + 8;
  return Math.round(width * 1.4);
}
