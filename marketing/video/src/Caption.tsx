import { DEEP } from "./theme";

/** The one line under the mark. Scenes hand one caption over to the next by crossing opacity. */
export const Caption: React.FC<{ text: string; opacity: number; y: number }> = ({ text, opacity, y }) => (
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
