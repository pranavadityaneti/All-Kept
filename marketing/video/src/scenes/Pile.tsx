import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SaveCard } from "../cards";
import { fontFamily } from "../font";
import { cardSize, SaveCardView } from "../SaveCardView";
import { PAPER } from "../theme";

/** The heap keeps below this line, so scene 3's mark, caption and platform row sit on clear ground. */
export const HEAP_TOP = 600;
const HEAP_BOTTOM = 1720;

/** Where card i comes to rest in the heap. Deterministic per index; always fully inside the band. */
export const restingPlace = (i: number, card: SaveCard) => {
  const { w, h } = cardSize(card);
  return {
    x: 90 + random(`x${i}`) * (1080 - w - 180),
    y: HEAP_TOP + random(`y${i}`) * (HEAP_BOTTOM - HEAP_TOP - h),
    rot: (random(`r${i}`) - 0.5) * 44,
  };
};

/** Frame (within the scene) at which card i starts falling: slow at first, then a downpour. */
export const dropStart = (i: number, count: number, length: number) =>
  Math.round((length - 40) * Math.pow(i / Math.max(1, count - 1), 1.7));

/** Scene 2: saves rain in and heap up. Nothing sorts them. */
export const Pile: React.FC<{ cards: SaveCard[]; length: number }> = ({ cards, length }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, fontFamily }}>
      {cards.map((card, i) => {
        const local = frame - dropStart(i, cards.length, length);
        if (local < 0) return null;
        const drop = spring({ frame: local, fps, config: { damping: 11, stiffness: 120, mass: 0.9 } });
        const { x, y, rot } = restingPlace(i, card);
        const yNow = interpolate(drop, [0, 1], [-cardSize(card).h - 60, y]);
        const rotNow = interpolate(drop, [0, 1], [rot * 2.2, rot]);
        return (
          <div
            key={card.title}
            style={{
              position: "absolute",
              left: x,
              top: yNow,
              transform: `rotate(${rotNow}deg)`,
              transformOrigin: "50% 50%",
            }}
          >
            <SaveCardView card={card} fontFamily={fontFamily} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
