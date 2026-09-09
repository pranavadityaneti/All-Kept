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

/** A rough starting height, replaced by the real one as soon as the page reports it. */
export function initialHeight(platform: string, width: number): number {
  if (platform === "youtube") return Math.round(width * 0.5625) + 8;
  return Math.round(width * 1.4);
}
