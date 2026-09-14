import { Img, staticFile } from "remotion";
import type { Category } from "./props";
import { INK, PURPLE } from "./theme";

/** The app's home-grid tile: soft field, one 3D icon, the name, and (here) a live save count. */
export const CategoryTile: React.FC<{
  category: Category;
  width: number;
  height: number;
  count: number;
  fontFamily: string;
}> = ({ category, width, height, count, fontFamily }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 40,
      background: "#EEEDF6",
      border: "2px solid rgba(109,70,242,0.10)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      fontFamily,
      position: "relative",
    }}
  >
    <Img src={staticFile(`emoji/${category.icon}.png`)} style={{ width: 132, height: 132 }} />
    <div style={{ fontSize: 40, fontWeight: 600, color: INK }}>{category.name}</div>
    {count > 0 ? (
      <div
        style={{
          position: "absolute",
          top: 22,
          right: 22,
          minWidth: 56,
          height: 56,
          padding: "0 18px",
          borderRadius: 28,
          background: PURPLE,
          color: "white",
          fontSize: 30,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {count}
      </div>
    ) : null}
  </div>
);
