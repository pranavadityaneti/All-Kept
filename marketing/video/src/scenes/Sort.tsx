import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { SaveCard } from "../cards";
import { CategoryTile } from "../CategoryTile";
import { fontFamily } from "../font";
import type { Category } from "../props";
import { cardSize, SaveCardView } from "../SaveCardView";
import { DEEP, PAPER } from "../theme";
import { restingPlace } from "./Pile";

/** The app's grid: two wide tiles, then a row of three. Positions are the tile's top-left. */
export const tileLayout = (n: number) => {
  const gap = 24;
  const top = 780;
  const wide = { w: (1080 - 120 - gap) / 2, h: 300 };
  const narrow = { w: (1080 - 120 - gap * 2) / 3, h: 300 };
  return Array.from({ length: n }, (_, i) =>
    i < 2
      ? { x: 60 + i * (wide.w + gap), y: top, ...wide }
      : { x: 60 + (i - 2) * (narrow.w + gap), y: top + wide.h + gap, ...narrow },
  );
};

const MARK_IN = 0;
const TILES_IN = 12;
const FLIGHTS_FROM = 34;
const FLIGHT_STAGGER = 3;
const FLIGHT_LENGTH = 26;

export const flightStart = (i: number) => FLIGHTS_FROM + i * FLIGHT_STAGGER;

/** Scene 3: the mark appears, the tiles snap in, and every card flies home. */
export const Sort: React.FC<{ cards: SaveCard[]; categories: Category[] }> = ({ cards, categories }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tiles = tileLayout(categories.length);
  const tileFor = (card: SaveCard) => {
    const i = categories.findIndex((c) => c.name === card.category);
    return i === -1 ? categories.length - 1 : i;
  };

  const markIn = spring({ frame: frame - MARK_IN, fps, config: { damping: 12, stiffness: 150 } });
  const captionIn = spring({ frame: frame - MARK_IN - 8, fps, config: { damping: 16, stiffness: 120 } });

  // How many cards have landed on each tile by now — drives the count chip and the bump.
  const landed = categories.map(() => 0);
  const lastLanding = categories.map(() => -Infinity);
  cards.forEach((card, i) => {
    const arrive = flightStart(i) + FLIGHT_LENGTH;
    if (frame >= arrive) {
      const t = tileFor(card);
      landed[t] = (landed[t] ?? 0) + 1;
      lastLanding[t] = Math.max(lastLanding[t] ?? -Infinity, arrive);
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily }}>
      {/* The mark and the line — above the resting heap, below cards in flight */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 0,
          right: 0,
          zIndex: 5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
        }}
      >
        <Img
          src={staticFile("brand/mark.png")}
          style={{
            width: 150,
            height: 150,
            opacity: markIn,
            transform: `scale(${interpolate(markIn, [0, 1], [0.4, 1])})`,
          }}
        />
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: DEEP,
            letterSpacing: -2,
            textShadow: "0 2px 24px rgba(246,245,250,0.9)",
            opacity: captionIn,
            transform: `translateY(${interpolate(captionIn, [0, 1], [30, 0])}px)`,
          }}
        >
          Sorted by AI.
        </div>
      </div>

      {/* Tiles */}
      {categories.map((category, i) => {
        const t = tiles[i];
        if (!t) return null;
        const pop = spring({ frame: frame - TILES_IN - i * 4, fps, config: { damping: 13, stiffness: 170 } });
        const sinceLanding = frame - (lastLanding[i] ?? -Infinity);
        const bump = sinceLanding >= 0 && sinceLanding < 12 ? 1 + 0.06 * Math.sin((sinceLanding / 12) * Math.PI) : 1;
        return (
          <div
            key={category.name}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              opacity: pop,
              transform: `scale(${interpolate(pop, [0, 1], [0.6, 1]) * bump})`,
              transformOrigin: "50% 50%",
            }}
          >
            <CategoryTile category={category} width={t.w} height={t.h} count={landed[i] ?? 0} fontFamily={fontFamily} />
          </div>
        );
      })}

      {/* Cards: at rest in the heap, then one by one in flight */}
      {cards.map((card, i) => {
        const local = frame - flightStart(i);
        if (local >= FLIGHT_LENGTH) return null;
        const { x, y, rot } = restingPlace(i, card);
        const { w, h } = cardSize(card);
        const target = tiles[tileFor(card)];
        if (!target) return null;
        const p = local < 0 ? 0 : spring({ frame: local, fps, config: { damping: 18, stiffness: 95 }, durationInFrames: FLIGHT_LENGTH });
        const cx = interpolate(p, [0, 1], [x + w / 2, target.x + target.w / 2]);
        const cy = interpolate(p, [0, 1], [y + h / 2, target.y + target.h / 2]) - Math.sin(p * Math.PI) * 140;
        const scale = interpolate(p, [0, 1], [1, 0.18]);
        const opacity = interpolate(p, [0.8, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div
            key={card.title}
            style={{
              position: "absolute",
              left: cx - w / 2,
              top: cy - h / 2,
              transform: `rotate(${interpolate(p, [0, 1], [rot, 0])}deg) scale(${scale})`,
              transformOrigin: "50% 50%",
              opacity,
              zIndex: local >= 0 ? 10 : 1,
            }}
          >
            <SaveCardView card={card} fontFamily={fontFamily} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
