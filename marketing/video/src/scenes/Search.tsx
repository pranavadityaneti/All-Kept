import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { SaveCard } from "../cards";
import { Caption } from "../Caption";
import { CategoryTile, PT } from "../CategoryTile";
import { fontFamily } from "../font";
import type { Category } from "../props";
import { cardSize, SaveCardView } from "../SaveCardView";
import { INK, PAPER } from "../theme";
import { tileLayout } from "./Sort";

// Beats, in frames from the scene's start.
const HANDOVER = 0; // "Sorted by AI." leaves, "Found in one search." arrives.
const BAR_IN = 8;
const TYPE_FROM = 22;
const TYPE_EVERY = 6;
const RESULT_AFTER = 10; // frames after the last letter
const RESULT_LENGTH = 34;

const BAR_W = 1080 - 2 * 16 * PT;
const BAR_H = 112;
const BAR_Y = 440;

/** Scene 4: the search bar types the term; the one save that matches lifts out of its tile and lands centred. */
export const Search: React.FC<{ cards: SaveCard[]; categories: Category[]; term: string }> = ({ cards, categories, term }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tiles = tileLayout(categories.length);

  const handover = interpolate(frame, [HANDOVER, HANDOVER + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const foundIn = spring({ frame: frame - HANDOVER - 6, fps, config: { damping: 16, stiffness: 120 } });
  const barIn = spring({ frame: frame - BAR_IN, fps, config: { damping: 14, stiffness: 160 } });

  const typed = Math.max(0, Math.min(term.length, Math.floor((frame - TYPE_FROM) / TYPE_EVERY) + 1));
  const typing = frame >= TYPE_FROM && typed < term.length;
  const caretOn = typing || Math.floor(frame / 15) % 2 === 0;

  const resultFrom = TYPE_FROM + term.length * TYPE_EVERY + RESULT_AFTER;
  const p = frame < resultFrom ? 0 : spring({ frame: frame - resultFrom, fps, config: { damping: 15, stiffness: 90 }, durationInFrames: RESULT_LENGTH });

  // The save that answers the search, and the tile it comes out of.
  const found = cards.find((c) => c.title.toLowerCase().includes(term.toLowerCase()));
  const tileIndex = found ? Math.max(0, categories.findIndex((c) => c.name === found.category)) : 0;
  const origin = tiles[tileIndex];

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily }}>
      {/* Header: the mark, the caption handing over */}
      <div style={{ position: "absolute", top: 110, left: 0, right: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Img src={staticFile("brand/mark.png")} style={{ width: 150, height: 150 }} />
        <div style={{ position: "relative", height: 100, width: 1080, marginTop: 28 }}>
          <Caption text="Sorted by AI." opacity={1 - handover} y={-handover * 30} />
          <Caption text="Found in one search." opacity={foundIn} y={interpolate(foundIn, [0, 1], [30, 0])} />
        </div>
      </div>

      {/* The search bar */}
      <div
        style={{
          position: "absolute",
          left: (1080 - BAR_W) / 2,
          top: BAR_Y,
          width: BAR_W,
          height: BAR_H,
          borderRadius: 32,
          background: "white",
          boxShadow: "0 10px 30px rgba(36,31,68,0.10)",
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 34px",
          boxSizing: "border-box",
          opacity: barIn,
          transform: `translateY(${interpolate(barIn, [0, 1], [24, 0])}px)`,
          zIndex: 6,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <div style={{ fontSize: 44, fontWeight: 600, color: typed > 0 ? INK : "#8E8A9B", display: "flex", alignItems: "center" }}>
          {typed > 0 ? term.slice(0, typed) : "Search your saves"}
          <span style={{ display: "inline-block", width: 4, height: 50, marginLeft: 4, background: INK, opacity: frame >= BAR_IN && caretOn ? 1 : 0 }} />
        </div>
      </div>

      {/* The grid, dimming as the answer rises */}
      {categories.map((category, i) => {
        const t = tiles[i];
        if (!t) return null;
        return (
          <div key={category.name} style={{ position: "absolute", left: t.x, top: t.y, opacity: 1 - p * 0.7 }}>
            <CategoryTile category={category} size={t.size} large={t.large} fontFamily={fontFamily} />
          </div>
        );
      })}

      {/* The answer */}
      {found && origin && p > 0 ? (() => {
        const { w, h } = cardSize(found);
        const cx = interpolate(p, [0, 1], [origin.x + origin.size / 2, 540]);
        const cy = interpolate(p, [0, 1], [origin.y + origin.size / 2, 1040]);
        const scale = interpolate(p, [0, 1], [0.18, 1.25]);
        const opacity = interpolate(p, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });
        return (
          <div
            style={{
              position: "absolute",
              left: cx - w / 2,
              top: cy - h / 2,
              transform: `scale(${scale}) rotate(${interpolate(p, [0, 1], [-6, 0])}deg)`,
              transformOrigin: "50% 50%",
              opacity,
              zIndex: 10,
              filter: `drop-shadow(0 ${30 * p}px ${60 * p}px rgba(36,31,68,${0.25 * p}))`,
            }}
          >
            <SaveCardView card={found} fontFamily={fontFamily} highlight={typed === term.length ? term : undefined} />
          </div>
        );
      })() : null}
    </AbsoluteFill>
  );
};
