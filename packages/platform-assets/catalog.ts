/** Display names and source aliases shared by the mobile app and admin dashboard. */
export const BRAND_LABELS = {
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  facebook: "Facebook",
  tiktok: "TikTok",
  reddit: "Reddit",
  slack: "Slack",
  whatsapp: "WhatsApp",
  threads: "Threads",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  google: "Google",
} as const;
export type Brand = keyof typeof BRAND_LABELS;
const ALIASES: Record<string, Brand> = {
  instagram_dm: "instagram",
  instagram_export: "instagram",
  youtube_playlist: "youtube",
  twitter: "x",
};
export function brandForPlatform(platform: string): Brand | null {
  const key = platform.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BRAND_LABELS, key))
    return key as Brand;
  return Object.prototype.hasOwnProperty.call(ALIASES, key)
    ? ALIASES[key]!
    : null;
}
export function platformName(platform: string): string {
  const brand = brandForPlatform(platform);
  return brand
    ? BRAND_LABELS[brand]
    : platform === "web"
      ? "Web"
      : platform === "note"
        ? "Note"
        : platform;
}
