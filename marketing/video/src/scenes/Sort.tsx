import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { SaveCard } from "../cards";
import { CategoryTile, PT } from "../CategoryTile";
import { fontFamily } from "../font";
import { ALL_PLATFORMS, PlatformBadge } from "../PlatformBadge";
import type { Category } from "../props";
import { cardSize, SaveCardView } from "../SaveCardView";
import { DEEP, PAPER } from "../theme";
import { restingPlace } from "./Pile";

/**
 * The app's home grid at video scale: two wide squares on top, three across beneath — the same
 * margins and gutters as apps/mobile/app/(tabs)/index.tsx. Positions are each tile's top-left.
 */
export const tileLayout = (n: number) => {
  const margin = 16 * PT;
  const gutter = 10 * PT;
  const rowGap = 12 * PT;
  const top = 600;
  const wide = (1080 - 2 * margin - gutter) / 2;
  const narrow = (1080 - 2 * margin - 2 * gutter) / 3;
  return Array.from({ length: n }, (_, i) =>
    i < 2
      ? { x: margin + i * (wide + gutter), y: top, size: wide, large: true }
      : { x: margin + (i - 2) * (narrow + gutter), y: top + wide + rowGap, size: narrow, large: false },
  );
};

// Beats, in frames from the scene's start.
const MARK_IN = 0;
const ONE_PLACE_IN = 4;
const BADGES_IN = 8;
const BADGE_STAGGER = 4;
const HANDOVER = 56; // "Every platform. One place." leaves, "Sorted by AI." arrives, badges go.
const TILES_IN = 62;
const FLIGHTS_FROM = 76;
const FLIGHT_STAGGER = 2;
const FLIGHT_LENGTH = 24;

export const flightStart = (i: number) => FLIGHTS_FROM + i * FLIGHT_STAGGER;

const BADGE = 96;
const BADGE_GAP = 20;

/** Scene 3: the mark; every platform gathers into one row; the tiles snap in; every card flies home. */
export const Sort: React.FC<{ cards: SaveCard[]; categories: Category[] }> = ({ cards, categories }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tiles = tileLayout(categories.length);
  const tileFor = (card: SaveCard) => {
    const i = categories.findIndex((c) => c.name === card.category);
    return i === -1 ? categories.length - 1 : i;
  };

  const markIn = spring({ frame: frame - MARK_IN, fps, config: { damping: 12, stiffness: 150 } });
  const onePlaceIn = spring({ frame: frame - ONE_PLACE_IN, fps, config: { damping: 16, stiffness: 120 } });
  const handover = interpolate(frame, [HANDOVER, HANDOVER + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sortedIn = spring({ frame: frame - HANDOVER - 6, fps, config: { damping: 16, stiffness: 120 } });

  // When did the latest save land on each tile — drives the bump and the glow.
  const lastLanding = categories.map(() => -Infinity);
  cards.forEach((card, i) => {
    const arrive = flightStart(i) + FLIGHT_LENGTH;
    if (frame >= arrive) {
      const t = tileFor(card);
      lastLanding[t] = Math.max(lastLanding[t] ?? -Infinity, arrive);
    }
  });

  const rowWidth = ALL_PLATFORMS.length * BADGE + (ALL_PLATFORMS.length - 1) * BADGE_GAP;

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily }}>
      {/* Header: the mark, then one caption handing over to the next — above the resting heap */}
      <div style={{ position: "absolute", top: 110, left: 0, right: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Img
          src={staticFile("brand/mark.png")}
          style={{ width: 150, height: 150, opacity: markIn, transform: `scale(${interpolate(markIn, [0, 1], [0.4, 1])})` }}
        />
        <div style={{ position: "relative", height: 100, width: 1080, marginTop: 28 }}>
          <Caption
            text="Every platform. One place."
            opacity={onePlaceIn * (1 - handover)}
            y={interpolate(onePlaceIn, [0, 1], [30, 0]) - handover * 30}
          />
          <Caption text="Sorted by AI." opacity={sortedIn} y={interpolate(sortedIn, [0, 1], [30, 0])} />
        </div>
        {/* The eight platforms, gathered into one row */}
        <div style={{ position: "relative", width: rowWidth, height: BADGE, marginTop: 36 }}>
          {ALL_PLATFORMS.map((platform, i) => {
            const pop = spring({ frame: frame - BADGES_IN - i * BADGE_STAGGER, fps, config: { damping: 12, stiffness: 180 } });
            const gone = interpolate(frame, [HANDOVER, HANDOVER + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div
                key={platform}
                style={{
                  position: "absolute",
                  left: i * (BADGE + BADGE_GAP),
                  top: 0,
                  opacity: pop * (1 - gone),
                  transform: `scale(${interpolate(pop, [0, 1], [0.4, 1]) * (1 - gone * 0.4)}) translateY(${-gone * 20}px)`,
                }}
              >
                <PlatformBadge platform={platform} size={BADGE} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tiles */}
      {categories.map((category, i) => {
        const t = tiles[i];
        if (!t) return null;
        const pop = spring({ frame: frame - TILES_IN - i * 4, fps, config: { damping: 13, stiffness: 170 } });
        const since = frame - (lastLanding[i] ?? -Infinity);
        const pulse = since >= 0 && since < 14 ? Math.sin((since / 14) * Math.PI) : 0;
        return (
          <div
            key={category.name}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              opacity: pop,
              transform: `scale(${interpolate(pop, [0, 1], [0.6, 1]) * (1 + 0.05 * pulse)})`,
              transformOrigin: "50% 50%",
            }}
          >
            <CategoryTile category={category} size={t.size} large={t.large} fontFamily={fontFamily} glow={pulse} />
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
        const cx = interpolate(p, [0, 1], [x + w / 2, target.x + target.size / 2]);
        const cy = interpolate(p, [0, 1], [y + h / 2, target.y + target.size / 2]) - Math.sin(p * Math.PI) * 140;
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

const Caption: React.FC<{ text: string; opacity: number; y: number }> = ({ text, opacity, y }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 68,
      fontWeight: 800,
      color: DEEP,
      letterSpacing: -2,
      textShadow: "0 2px 24px rgba(246,245,250,0.9)",
      opacity,
      transform: `translateY(${y}px)`,
    }}
  >
    {text}
  </div>
);
