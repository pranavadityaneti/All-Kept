// Reading what someone pasted when they point us at a YouTube playlist.

/** Playlist ids are 13 to 42 of these; YouTube has used several prefixes over the years. */
const ID = /^[A-Za-z0-9_-]{13,42}$/;

/** The two YouTube will not let anyone read, whoever is asking. */
const PRIVATE_TO_YOUTUBE: Record<string, string> = {
  WL: "Watch Later",
  LL: "Liked videos",
};

export type PlaylistParse =
  | { ok: true; id: string }
  | { ok: false; reason: "empty" | "not_youtube" | "no_playlist" | "closed"; closed?: string };

/**
 * The playlist id in a link, however it was pasted: a playlist page, a watch link that happens to
 * carry a list, a share link, or the bare id itself.
 */
export function parsePlaylistInput(input: string): PlaylistParse {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };

  // A bare id, which is what someone gets if they copy from the address bar by hand.
  if (!/[/:.\s]/.test(text)) return check(text);

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "not_youtube" };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "music.youtube.com") {
    return { ok: false, reason: "not_youtube" };
  }

  const list = url.searchParams.get("list");
  if (list) return check(list);

  // youtube.com/playlist/<id> is rare but does appear in shares.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "playlist" && parts[1]) return check(parts[1]);

  return { ok: false, reason: "no_playlist" };
}

function check(id: string): PlaylistParse {
  const closed = PRIVATE_TO_YOUTUBE[id.toUpperCase()];
  if (closed) return { ok: false, reason: "closed", closed };
  return ID.test(id) ? { ok: true, id } : { ok: false, reason: "no_playlist" };
}
