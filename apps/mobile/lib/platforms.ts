/** How each platform is named on screen. */
export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", youtube: "YouTube", x: "X", facebook: "Facebook", tiktok: "TikTok",
  reddit: "Reddit", threads: "Threads", linkedin: "LinkedIn", pinterest: "Pinterest", web: "Web", note: "Note",
};

export const platformLabel = (platform: string): string => PLATFORM_LABEL[platform] ?? platform;

/** Shorter names for the filter chips, where the row is tight. */
export const FILTER_LABEL: Record<string, string> = { ...PLATFORM_LABEL, note: "Notes", web: "Links" };
