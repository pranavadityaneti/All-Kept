import { saveLink } from "@allkept/normalize";

/** Long enough for a redirect, short enough that saving never feels stuck behind it. */
const BUDGET_MS = 6_000;

/**
 * Follows a share link to the thing it points at, from the phone.
 *
 * The server cannot do this for every site. Reddit refuses to resolve the /s/ links its own app
 * produces when the request comes from a datacentre, which is where our functions run, so a share
 * link saved that way arrives with no title and no picture. A phone is an ordinary client and is not
 * refused, so the resolving happens here and the server is handed an address it can already read.
 *
 * Only links the parser says need following are touched, and any failure returns the original: a save
 * must never be lost to a redirect that would not resolve.
 */
export async function resolveForSave(text: string, doFetch: typeof fetch = fetch): Promise<string> {
  const trimmed = text.trim();
  const link = saveLink(trimmed);
  if (!link?.needsExpansion || !link.sourceUrl) return trimmed;

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), BUDGET_MS);
  try {
    const res = await doFetch(link.sourceUrl, { redirect: "follow", signal: stop.signal });
    const final = res.url;
    if (!final || final === link.sourceUrl) return trimmed;
    // Only accept somewhere we can actually read. A redirect to a login wall still needs following.
    const resolved = saveLink(final);
    return resolved && !resolved.needsExpansion ? final : trimmed;
  } catch {
    return trimmed; // offline, blocked, or too slow: the server does what it did before
  } finally {
    clearTimeout(timer);
  }
}
