import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../font";
import { PURPLE } from "../theme";
import { ReelBackdrop } from "./ReelBackdrop";

/** Scene 1: over a blurred, generic reel feed, the headline slams in, the subline follows, both leave fast. */
export const Hook: React.FC<{ headline: string; subline: string; length: number }> = ({
  headline,
  subline,
  length,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headIn = spring({ frame, fps, config: { damping: 14, stiffness: 160, mass: 0.8 } });
  const subIn = spring({ frame: frame - Math.round(fps * 0.55), fps, config: { damping: 16, stiffness: 140 } });
  const out = interpolate(frame, [length - 8, length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const headScale = interpolate(headIn, [0, 1], [1.8, 1]) * (1 + out * 0.25);
  const subY = interpolate(subIn, [0, 1], [60, 0]);

  return (
    <AbsoluteFill style={{ fontFamily, justifyContent: "center", alignItems: "center" }}>
      <ReelBackdrop />
      <div style={{ width: 1000, textAlign: "center", color: "white", opacity: 1 - out, textShadow: "0 8px 40px rgba(0,0,0,0.45)" }}>
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -5,
            whiteSpace: "nowrap",
            opacity: headIn,
            transform: `scale(${headScale})`,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            opacity: subIn,
            transform: `translateY(${subY}px)`,
          }}
        >
          <span style={{ background: PURPLE, padding: "6px 26px", borderRadius: 18, boxDecorationBreak: "clone" }}>{subline}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
