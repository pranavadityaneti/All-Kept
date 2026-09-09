import facebook from "../../../packages/platform-assets/assets/facebook.png";
import google from "../../../packages/platform-assets/assets/google.png";
import instagram from "../../../packages/platform-assets/assets/instagram.png";
import linkedin from "../../../packages/platform-assets/assets/linkedin.png";
import pinterest from "../../../packages/platform-assets/assets/pinterest.png";
import reddit from "../../../packages/platform-assets/assets/reddit.png";
import slack from "../../../packages/platform-assets/assets/slack.png";
import threads_dark from "../../../packages/platform-assets/assets/threads-dark.png";
import threads_light from "../../../packages/platform-assets/assets/threads-light.png";
import tiktok from "../../../packages/platform-assets/assets/tiktok.png";
import whatsapp from "../../../packages/platform-assets/assets/whatsapp.png";
import x_dark from "../../../packages/platform-assets/assets/x-dark.png";
import x_light from "../../../packages/platform-assets/assets/x-light.png";
import youtube from "../../../packages/platform-assets/assets/youtube.png";
import {
  brandForPlatform,
  type Brand,
} from "../../../packages/platform-assets/catalog";
const LOGOS: Record<Brand, { light: string; dark: string }> = {
  instagram: { light: instagram, dark: instagram },
  youtube: { light: youtube, dark: youtube },
  x: { light: x_light, dark: x_dark },
  facebook: { light: facebook, dark: facebook },
  tiktok: { light: tiktok, dark: tiktok },
  reddit: { light: reddit, dark: reddit },
  slack: { light: slack, dark: slack },
  whatsapp: { light: whatsapp, dark: whatsapp },
  threads: { light: threads_light, dark: threads_dark },
  linkedin: { light: linkedin, dark: linkedin },
  pinterest: { light: pinterest, dark: pinterest },
  google: { light: google, dark: google },
};
/** Logos are decorative beside a readable platform name. Never tint the original artwork. */
export function PlatformLogo({
  platform,
  size = 22,
  appearance = "dark",
}: {
  platform: string;
  size?: number;
  appearance?: "light" | "dark";
}) {
  const brand = brandForPlatform(platform);
  if (brand)
    return (
      <img
        className="platform-logo"
        src={LOGOS[brand][appearance]}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  return (
    <svg
      className="platform-logo generic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {platform === "note" ? (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h4M9 12h6M9 16h6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </>
      )}
    </svg>
  );
}
