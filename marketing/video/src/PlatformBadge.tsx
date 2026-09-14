import { Img, staticFile } from "remotion";
import type { Platform } from "./cards";
import { INK } from "./theme";

const Globe: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
  </svg>
);

/** A platform's mark on a white rounded square — the badge a card wears, and the row scene 3 lines up. */
export const PlatformBadge: React.FC<{ platform: Platform; size: number }> = ({ platform, size }) => {
  const mark = Math.round(size * 0.625);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 6px 18px rgba(36,31,68,0.10)",
      }}
    >
      {platform === "web" ? <Globe size={mark} /> : <Img src={staticFile(`platforms/${platform}.png`)} style={{ width: mark, height: mark }} />}
    </div>
  );
};

export const ALL_PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "reddit", "x", "facebook", "pinterest", "web"];
