import { StyleSheet, View } from "react-native";
import { otherFlat, type FlatView, type LibraryView } from "../lib/library-view";
import { space } from "../lib/theme";
import { IconButton } from "./IconButton";

/**
 * Two marks: one toggle for grid and list, wearing the view a tap would give, and the map, which
 * switches on over whichever of the two was last used and off back to it.
 */
export function ViewSwitch({ view, flat, onChange }: { view: LibraryView; flat: FlatView; onChange: (view: LibraryView) => void }) {
  const next = otherFlat(flat);
  return (
    <View style={styles.row}>
      <IconButton name={next} label={next === "list" ? "Show as a list" : "Show as a grid"} onPress={() => onChange(next)} />
      <IconButton name="map" label={view === "map" ? "Hide the map" : "Show on a map"} tone={view === "map" ? "accent" : "surface"} onPress={() => onChange(view === "map" ? flat : "map")} />
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: space.xs } });
