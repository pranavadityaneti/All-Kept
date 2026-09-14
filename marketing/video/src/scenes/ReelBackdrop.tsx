import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * A blurred, generic vertical-video feed: drifting colour behind a dark scrim, the silhouette of
 * the right-hand action column and a caption bar. No logo, no real post — just "you are scrolling".
 */
export const ReelBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const blob = (hue: number, x: number, y: number, r: number, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: x + Math.sin(t * 0.7 + phase) * 90,
        top: y + Math.cos(t * 0.5 + phase) * 120,
        width: r,
        height: r,
        borderRadius: r,
        background: `hsl(${hue} 80% 55%)`,
        opacity: 0.85,
      }}
    />
  );
  const pill = (top: number, w: number) => (
    <div style={{ position: "absolute", left: 48, top, width: w, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.35)" }} />
  );
  const button = (top: number) => (
    <div style={{ position: "absolute", right: 44, top, width: 84, height: 84, borderRadius: 42, background: "rgba(255,255,255,0.28)" }} />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#12101a", overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: "blur(70px)", transform: "scale(1.2)" }}>
        {blob(20, 80, 300, 700, 0)}
        {blob(200, 500, 900, 800, 2)}
        {blob(320, -100, 1200, 650, 4)}
        {blob(45, 600, 200, 500, 1)}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(18,16,26,0.35) 0%, rgba(18,16,26,0.55) 60%, rgba(18,16,26,0.9) 100%)" }} />
      {button(1180)}
      {button(1300)}
      {button(1420)}
      {button(1540)}
      <div style={{ position: "absolute", left: 48, top: 1560, width: 88, height: 88, borderRadius: 44, background: "rgba(255,255,255,0.35)" }} />
      {pill(1585, 260)}
      {pill(1680, 620)}
      {pill(1722, 440)}
    </AbsoluteFill>
  );
};
