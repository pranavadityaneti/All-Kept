import { BRAND_LABELS } from "../../../packages/platform-assets/catalog";
import type { IconName } from "../components/Icon";

/** How each platform is named on screen. */
export const PLATFORM_LABEL: Record<string, string> = { ...BRAND_LABELS, web: "Web", note: "Note" };

export const platformLabel = (platform: string): string => PLATFORM_LABEL[platform] ?? platform;

/**
 * The site a link came from, said the way a person would say it: "primevideo.com", not "Web".
 *
 * Every link save used to read "Web", so two saves from different places were the same anonymous
 * card — and for a site that refuses to give us a preview at all, the address is the only thing we
 * have to tell one from another. "www." goes because nobody says it out loud.
 */
export function hostLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").trim();
    return host || null;
  } catch {
    return null; // not a URL we can read; the caller falls back to the platform's own name
  }
}

/** Shorter names for the filter chips, where the row is tight. */
export const FILTER_LABEL: Record<string, string> = { ...PLATFORM_LABEL, note: "Notes", web: "Links" };

/** The logo to show on a save's "open where it came from" button. */
export const PLATFORM_ICON: Record<string, IconName> = {
  instagram: "instagram", youtube: "youtube", x: "x", facebook: "facebook", tiktok: "tiktok",
  slack: "slack", whatsapp: "whatsapp", reddit: "reddit", threads: "threads", linkedin: "linkedin", pinterest: "pinterest", web: "web", note: "note",
};

export const platformIcon = (platform: string): IconName => PLATFORM_ICON[platform] ?? "web";
