import { Img, staticFile } from "remotion";
import marks from "./marks.generated.json";
import type { Category } from "./props";
import { INK } from "./theme";

type Mark = { key: string; card: string; ink: string; wash: string };
const MARKS = marks as Record<string, Mark>;

/** The video is 1080 px across where the phone is 390 pt: every app metric scales by this. */
export const PT = 1080 / 390;

/**
 * The app's category tile, as apps/mobile/components/CategoryTile.tsx draws it: a square washed
 * in the category's pastel, its flat two-tone mark printed small in the middle, the short name
 * beneath. No border, no count, no photograph. `large` is the wide top row: same square, bigger.
 */
export const CategoryTile: React.FC<{
  category: Category;
  size: number;
  large?: boolean;
  fontFamily: string;
  /** 0–1: how strongly the tile is lit by a landing save — a pulse of its own ink. */
  glow?: number;
}> = ({ category, size, large = false, fontFamily, glow = 0 }) => {
  const mark = MARKS[category.app];
  if (!mark) throw new Error(`No generated mark for "${category.app}" — run the asset sync`);
  const markSize = (large ? 48 : 40) * PT;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 24 * PT,
        background: mark.card,
        boxShadow: glow > 0 ? `0 0 0 ${6 * glow}px ${mark.ink}${Math.round(glow * 110).toString(16).padStart(2, "0")}` : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `${12 * PT}px ${8 * PT}px`,
        gap: 8 * PT,
        fontFamily,
        boxSizing: "border-box",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Img src={staticFile(`marks/${mark.key}.svg`)} style={{ width: markSize, height: markSize }} />
      </div>
      <div style={{ fontSize: 15 * PT, lineHeight: `${18 * PT}px`, fontWeight: 600, letterSpacing: -0.2 * PT, color: INK }}>
        {category.label}
      </div>
    </div>
  );
};
