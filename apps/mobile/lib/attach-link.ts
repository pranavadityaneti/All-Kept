// Checking a pasted link. Kept free of React and of anything native so it can be tested directly.
import { instagramPermalink, normalize } from "@allkept/normalize";

export interface AttachedLink {
  platform: string; kind: string; sourceUrl: string; canonicalUrl: string | null; externalId: string | null; needsExpansion: boolean;
}

/**
 * Checks a pasted link before it is allowed to replace a save's identity.
 *
 * Two layers, because syntax alone is not enough: the host must at least have a dot and a
 * letters-only ending, which rejects "localhost" and half-typed words, and where the save already
 * knows which platform it belongs to, the link must be for that platform. The second layer is what
 * catches a truncated paste such as "https://www.instagram", which is a perfectly valid host name
 * that simply does not exist; no client-side rule can know that without asking the network.
 * When something still slips through, enrichment fails and the card offers the paste again.
 */
export function parseAttachedLink(pasted: string, expectPlatform?: string): AttachedLink {
  const trimmed = pasted.trim();
  if (!trimmed) throw new Error("Paste the link first.");

  // People paste "www.instagram.com/p/…" as often as the full address, so fill in the scheme once
  // and use that same string for both the check and the normaliser.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    throw new Error("That does not look like a link.");
  }
  // A real host has a dot and a letter-only ending: "www.instagram" and "localhost" do not.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error("That link is missing part of its address. Paste the whole thing.");

  const link = normalize({ url: withScheme });
  if (link.platform === "note" || !link.sourceUrl) throw new Error("That does not look like a link.");
  if (expectPlatform && link.platform !== expectPlatform) {
    throw new Error(expectPlatform === "instagram" ? "Paste the link to the Instagram post itself." : `That is not a ${expectPlatform} link.`);
  }
  if (expectPlatform === "instagram" && !instagramPermalink(withScheme)) {
    throw new Error("Paste the link to the Instagram post or reel, not a profile or story.");
  }
  return { platform: link.platform, kind: link.kind, sourceUrl: link.sourceUrl, canonicalUrl: link.canonicalUrl, externalId: link.externalId, needsExpansion: link.needsExpansion };
}

/**
 * Attaches the real link to a post Instagram sent without one, then asks the server to fetch the
 * preview immediately. The identity columns are rewritten, so the unique index can reject a link
 * that is already in the library.
 */
