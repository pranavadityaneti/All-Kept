import { StyleSheet, View } from "react-native";
import { VIEWS, type LibraryView } from "../lib/library-view";
import { space } from "../lib/theme";
import { IconButton } from "./IconButton";

const LABEL: Record<LibraryView, string> = { grid: "Show as a grid", list: "Show as a list", map: "Show on a map" };

/** Grid, list or map: three marks in a row, the one in use filled in. */
export function ViewSwitch({ view, onChange }: { view: LibraryView; onChange: (view: LibraryView) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {VIEWS.map((v) => (
        <IconButton key={v} name={v} label={LABEL[v]} tone={v === view ? "accent" : "surface"} onPress={() => onChange(v)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: space.xs } });
