import { BRAND_LABELS } from "../../../packages/platform-assets/catalog";
import type { IconName } from "../components/Icon";

/** How each platform is named on screen. */
export const PLATFORM_LABEL: Record<string, string> = { ...BRAND_LABELS, web: "Web", note: "Note" };

export const platformLabel = (platform: string): string => PLATFORM_LABEL[platform] ?? platform;

/** Shorter names for the filter chips, where the row is tight. */
export const FILTER_LABEL: Record<string, string> = { ...PLATFORM_LABEL, note: "Notes", web: "Links" };

/** The logo to show on a save's "open where it came from" button. */
export const PLATFORM_ICON: Record<string, IconName> = {
  instagram: "instagram", youtube: "youtube", x: "x", facebook: "facebook", tiktok: "tiktok",
  slack: "slack", whatsapp: "whatsapp", reddit: "reddit", threads: "threads", linkedin: "linkedin", pinterest: "pinterest", web: "web", note: "note",
};

export const platformIcon = (platform: string): IconName => PLATFORM_ICON[platform] ?? "web";
