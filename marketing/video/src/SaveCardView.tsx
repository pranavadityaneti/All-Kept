import { Img, staticFile } from "remotion";
import type { Ratio, SaveCard } from "./cards";
import { INK } from "./theme";

/** Picture box per shape. Widths differ so a Short reads tall and a YouTube video reads wide. */
const PICTURE: Record<Ratio, { w: number; h: number }> = {
  "1:1": { w: 300, h: 300 },
  "4:5": { w: 300, h: 375 },
  "9:16": { w: 270, h: 480 },
  "16:9": { w: 400, h: 225 },
  "2:3": { w: 280, h: 420 },
};

const TITLE_STRIP = 112;

/** Text-style cards (no photo) carry their line inside the post, so they get no title strip. */
export const cardSize = (card: SaveCard) => {
  const p = PICTURE[card.ratio];
  return { w: p.w, h: p.h + (card.photo ? TITLE_STRIP : 0) };
};

const isVideo = (card: SaveCard) => card.duration !== undefined;

/** X-style card: no picture, the post is the text. Dark field, avatar dot, the line itself. */
const TextPost: React.FC<{ title: string; icon: string; width: number }> = ({ title, icon, width }) => (
  <div style={{ position: "absolute", inset: 0, background: "#15131c", padding: 24, color: "white" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.18)" }} />
      <div style={{ width: 110, height: 14, borderRadius: 7, background: "rgba(255,255,255,0.25)" }} />
    </div>
    <div style={{ marginTop: 22, fontSize: 30, fontWeight: 600, lineHeight: 1.25, width: width - 48 }}>
      {title} <Img src={staticFile(`emoji/${icon}.png`)} style={{ width: 34, height: 34, verticalAlign: "-6px" }} />
    </div>
  </div>
);

const Globe: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
  </svg>
);

/** Looks like an All Kept library card: picture, title, platform badge — in the shape the platform is known for. */
export const SaveCardView: React.FC<{ card: SaveCard; fontFamily: string }> = ({ card, fontFamily }) => {
  const pic = PICTURE[card.ratio];
  const { w, h } = cardSize(card);
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 28,
        background: "white",
        boxShadow: "0 18px 40px rgba(36,31,68,0.18)",
        overflow: "hidden",
        fontFamily,
      }}
    >
      <div
        style={{
          position: "relative",
          width: pic.w,
          height: pic.h,
          background: `linear-gradient(160deg, hsl(${(card.hue + 345) % 360} 72% 82%), hsl(${(card.hue + 12) % 360} 68% 60%))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {card.photo ? (
          <Img
            src={staticFile(`photos/${card.photo}.jpg`)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <TextPost title={card.title} icon={card.icon} width={pic.w} />
        )}
        {isVideo(card) ? (
          <>
            <div
              style={{
                position: "absolute",
                width: 72,
                height: 72,
                borderRadius: 36,
                background: "rgba(255,255,255,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill={INK}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div
              style={{
                position: "absolute",
                left: 16,
                bottom: 16,
                padding: "6px 12px",
                borderRadius: 12,
                background: "rgba(23,21,27,0.7)",
                color: "white",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {card.duration}
            </div>
          </>
        ) : null}
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {card.platform === "web" ? (
            <Globe />
          ) : (
            <Img src={staticFile(`platforms/${card.platform}.png`)} style={{ width: 40, height: 40 }} />
          )}
        </div>
      </div>
      {card.photo ? (
        <div style={{ padding: "18px 22px 0", color: INK, fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>
          {card.title}
        </div>
      ) : null}
    </div>
  );
};
