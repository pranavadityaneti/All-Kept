// Where each platform serves post pictures. A phone may hand the server a picture address for a
// save (the picture door, and a pasted link's own page read on the phone); the server then fetches
// whatever address it is given, so this list is the whole defence against being pointed elsewhere.

/**
 * Exact hosts where the set is known, and whole-domain suffixes where the subdomain varies —
 * matched on a dot boundary, so "tiktokcdn-us.com.evil.com" and "eviltiktokcdn.com" are refused.
 */
export const PICTURE_HOSTS: Record<string, { exact?: string[]; domains?: string[] }> = {
  reddit: { exact: ["preview.redd.it", "external-preview.redd.it", "i.redd.it", "a.thumbs.redditmedia.com", "b.thumbs.redditmedia.com"] },
  // TikTok names a different signing host per region and post — p16-common-sign, p19-…-us, and more.
  tiktok: { domains: ["tiktokcdn.com", "tiktokcdn-us.com"] },
  // The poster a post's page names: scontent.cdninstagram.com, a regional scontent-xxx-n, or
  // instagram.fxxx-n.fna.fbcdn.net. The DM door's own CDN (lookaside.fbsbx.com) is deliberately
  // absent: the server is handed those addresses, never a phone.
  instagram: { domains: ["cdninstagram.com", "fbcdn.net"] },
};

/** True when `url` is an https address on one of `platform`'s own picture hosts. */
export function isPictureHost(url: string, platform: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    const allowed = PICTURE_HOSTS[platform];
    if (!allowed) return false;
    if (allowed.exact?.includes(host)) return true;
    return (allowed.domains ?? []).some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}
