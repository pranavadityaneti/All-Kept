/**
 * The address that plays a save inside Allkept.
 *
 * Instagram and YouTube both publish an embed page meant for exactly this; the video file itself is
 * never touched, which is what their terms require and what keeps the @allkeptapp account safe.
 */
export interface EmbeddableItem {
  platform: string; kind: string; canonicalUrl: string | null; sourceUrl: string | null; externalId: string | null;
  /** What enrichment concluded. Only TikTok reads it, and only to stay out of its player (see below). */
  status?: string;
  /** False when the provider will not play this in a frame, whatever address we build. */
  embeddable?: boolean | null;
}

const INSTAGRAM = /instagram\.com\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
/** A Reddit post, or one comment under it. Anything else on reddit.com is not a thing to embed. */
const REDDIT_POST = /reddit\.com(\/(?:r|user)\/[^/]+\/comments\/[A-Za-z0-9]+(?:\/comment\/[A-Za-z0-9]+)?)\/?/i;

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
  if (item.platform === "youtube") {
    // A playlist is not a video, and its id is not a video id. Saved from a /playlist?list= link,
    // the id stored is the playlist's, and asking for /embed/PLxxxx got exactly what asking for a
    // video that does not exist gets: "An error occurred. Please try again later." YouTube embeds a
    // playlist through videoseries instead. A watch link that merely carries a list= alongside its
    // v= is still a video, so the video wins wherever both are present.
    const link = item.canonicalUrl ?? item.sourceUrl ?? "";
    const list = /[?&]list=([A-Za-z0-9_-]+)/.exec(link);
    if (list && !/[?&]v=[A-Za-z0-9_-]/.test(link)) {
      // Only a public playlist plays in a frame. An unlisted one answers "This video is unavailable"
      // inside the player, so there is nothing to gain by asking — the card and its picture say more
      // than a black rectangle does. Enrichment records which it is.
      if (item.embeddable === false) return null;
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${list[1]}&playsinline=1&rel=0&autoplay=1&mute=1&origin=${encodeURIComponent(EMBED_ORIGIN)}`;
    }
  }
  if (item.platform === "youtube" && item.externalId) {
    // The no-cookie host, and inline playback so it does not take over the screen.
    // origin is what stops YouTube answering with "Video player configuration error (153)": their
    // player refuses an embed that arrives with no referrer, and a WebView loading a bare address
    // sends none. The value must match the referrer the player is given (see EmbedPlayer).
    // autoplay and mute are asked of YouTube in its own words too, so its controls start in
    // agreement with the state the player script applies; the speaker button decides the sound.
    return `https://www.youtube-nocookie.com/embed/${item.externalId}?playsinline=1&rel=0&autoplay=1&mute=1&origin=${encodeURIComponent(EMBED_ORIGIN)}`;
  }
  if (item.platform === "reddit") {
    // Reddit gives us a title and an author through oEmbed and nothing more — no picture — and it
    // answers our server 403 for the post page itself, so the link-preview fallback can never fill
    // the card either. Its own embed is the only way to show the post, and the phone loading it is
    // an ordinary client rather than the datacentre Reddit refuses.
    const m = REDDIT_POST.exec(item.canonicalUrl ?? item.sourceUrl ?? "");
    if (!m) return null;
    // Light to match the frame the embed is drawn in, as Instagram's card is.
    return `https://www.redditmedia.com${m[1]}/?embed=true&theme=light&showtitle=true&showmedia=true`;
  }
  if (item.platform === "tiktok" && item.externalId && (item.kind === "short_video" || item.kind === "video" || item.kind === "image")) {
    // TikTok's Embed Player. loop, and none of the chrome we draw ourselves. Our speaker button owns
    // the sound for a video, so TikTok's volume control is hidden; a photo post's sound is its
    // music, which we never start, so TikTok keeps that control. `muted=1` is never sent: TikTok
    // documents it as locking the volume for the viewer, not merely starting quiet.
    // A TikTok video is marked preview_unavailable only when its oEmbed refused outright, and for a
    // video that means the post is not there. A photo post is exempt: TikTok answers 400 for every
    // one of them, describing none, so the same status there says nothing about whether it exists. Opening the player then shows TikTok's own error page — which
    // fills the space with a carousel of other people's videos. Allkept shows nobody a feed of
    // strangers, so the save keeps its own card instead. Instagram is deliberately not treated this
    // way: it earns the same status from a login wall, which says nothing about whether it embeds.
    const photo = item.kind === "image";
    if (item.status === "preview_unavailable" && !photo) return null;
    // autoplay defaults to 0 in TikTok's player, so it must be asked in its own words as well as
    // driven through its message API — without this a TikTok save waited for a tap. Never asked of a
    // photo post, whose "play" means starting its music.
    const autoplay = photo ? "" : "&autoplay=1";
    // rel=0: should TikTok ever suggest anything anyway, keep it to this save's own author.
    return `https://www.tiktok.com/player/v1/${item.externalId}?loop=1&description=0&music_info=0&fullscreen_button=0&native_context_menu=0&rel=0&volume_control=${photo ? 1 : 0}${autoplay}`;
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
  return platform === "youtube" || platform === "tiktok" ? "player" : "card";
}

/** What a video is drawn as when its real shape was never learned. Most of the web is 16:9. */
export const DEFAULT_ASPECT = 16 / 9;

/** The shape a player starts at before enrichment has learned the real one. TikTok is tall; photo posts are usually 3:4. */
export function initialAspect(platform: string, kind: string): number {
  if (platform === "tiktok") return kind === "image" ? 3 / 4 : 9 / 16;
  return DEFAULT_ASPECT;
}

/**
 * Whether a page is one of the player pages this app shows, as opposed to the provider's site.
 * The WebView refuses to navigate its top frame anywhere else, so a stray tap can never replace a
 * save with instagram.com. Every provider's embed page has "/embed" in it; TikTok's player does not.
 */
export function isPlayerAddress(url: string): boolean {
  return /\/embed\b/i.test(url) || /^https:\/\/www\.tiktok\.com\/player\/v1\//i.test(url) || /^https:\/\/www\.redditmedia\.com\//i.test(url);
}

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
