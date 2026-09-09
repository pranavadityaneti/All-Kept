import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Icon, type IconName } from "./Icon";
import { usePalette } from "../lib/theme";

/** A decorative glimpse of one library gathering saves from many apps. */
export function WelcomeIllustration() {
  const p = usePalette(), { width, height } = useWindowDimensions();
  const scale = Math.min(1, (width - 40) / 350, Math.max(0.58, (height - 570) / 358));
  const dark = p.blur === "dark";
  const platforms: { name: IconName; color: string; left: number; top: number; rotate: string }[] = [
    { name: "instagram", color: "#D83B87", left: 12, top: 58, rotate: "-12deg" },
    { name: "youtube", color: "#ED3833", left: 281, top: 39, rotate: "12deg" },
    { name: "x", color: p.ink, left: 166, top: 2, rotate: "8deg" },
    { name: "reddit", color: "#F36132", left: 291, top: 174, rotate: "-8deg" },
    { name: "whatsapp", color: dark ? "#62D695" : "#20864D", left: 26, top: 251, rotate: "10deg" },
    { name: "tiktok", color: p.ink, left: 260, top: 284, rotate: "-10deg" },
    { name: "slack", color: dark ? "#80CBDF" : "#25829C", left: 7, top: 170, rotate: "-7deg" },
    { name: "facebook", color: "#3981EA", left: 104, top: 302, rotate: "5deg" },
  ];
  return <View style={{ height: 358 * scale, alignItems: "center", justifyContent: "center" }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={[styles.canvas, { transform: [{ scale }] }]}>
      <View style={[styles.halo, { backgroundColor: dark ? "#211C38" : "#EDE7FC" }]} />
      <View style={[styles.orbit, { borderColor: dark ? "#39304C" : "#DDD2F3" }]} />
      <View style={[styles.backCard, { backgroundColor: dark ? "#674631" : "#FFD4B5", transform: [{ rotate: "-12deg" }] }]} />
      <View style={[styles.backCard, { backgroundColor: dark ? "#514478" : "#CABAF4", transform: [{ rotate: "9deg" }] }]} />
      <View style={[styles.library, { backgroundColor: p.surface, borderColor: p.border, shadowColor: dark ? "#000000" : "#655084" }]}>
        <View style={styles.cardHeading}><Text style={[styles.libraryTitle, { color: p.ink }]}>Your library</Text><Icon name="library" size={19} color={p.accent} /></View>
        <View style={[styles.search, { backgroundColor: p.surfaceAlt }]}><Icon name="search" size={13} color={p.inkMuted} /><Text style={[styles.searchText, { color: p.inkMuted }]}>Find anything you saved</Text></View>
        {[
          { icon: "youtube" as const, color: "#E94840", tint: dark ? "#41292E" : "#FFEAE5", title: "A little inspiration", tag: "Design" },
          { icon: "instagram" as const, color: "#C94F8E", tint: dark ? "#3C293D" : "#F8E9F5", title: "Somewhere to go", tag: "Travel" },
          { icon: "web" as const, color: dark ? "#88BBA4" : "#3E8065", tint: dark ? "#253C36" : "#E6F1E8", title: "Something to try", tag: "Food" },
        ].map((item) => <View key={item.tag} style={styles.row}>
          <View style={[styles.thumbnail, { backgroundColor: item.tint }]}><Icon name={item.icon} size={23} color={item.color} /></View>
          <View style={{ gap: 4 }}><Text style={[styles.rowTitle, { color: p.ink }]}>{item.title}</Text><Text style={[styles.tag, { color: p.inkMuted }]}>{item.tag}</Text></View>
          <View style={{ marginLeft: "auto" }}><Icon name="open" size={12} color={p.inkMuted} /></View>
        </View>)}
      </View>
      {platforms.map((platform) => <View key={platform.name} style={[styles.platform, { left: platform.left, top: platform.top, backgroundColor: p.surface, borderColor: p.border, transform: [{ rotate: platform.rotate }] }]}><Icon name={platform.name} size={23} color={platform.color} /></View>)}
      <View style={[styles.sorted, { backgroundColor: p.accent, shadowColor: p.accent }]}><Icon name="check" size={15} color="#FFFFFF" /><Text style={styles.sortedText}>Sorted for you</Text></View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  canvas: { width: 350, height: 358 },
  halo: { position: "absolute", width: 292, height: 292, borderRadius: 146, left: 29, top: 32 },
  orbit: { position: "absolute", width: 338, height: 338, borderRadius: 169, left: 6, top: 9, borderWidth: 1 },
  backCard: { position: "absolute", width: 213, height: 226, borderRadius: 23, top: 69, left: 69 },
  library: { position: "absolute", width: 236, top: 67, left: 57, padding: 17, borderWidth: 1, borderRadius: 22, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.17, shadowRadius: 22, elevation: 8, gap: 12 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  libraryTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.5 },
  search: { flexDirection: "row", alignItems: "center", gap: 6, padding: 9, borderRadius: 9 },
  searchText: { fontSize: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  thumbnail: { width: 36, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 11, fontWeight: "600" },
  tag: { fontSize: 10 },
  platform: { position: "absolute", width: 46, height: 46, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  sorted: { position: "absolute", top: 291, left: 148, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5, transform: [{ rotate: "-5deg" }], shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 9 },
  sortedText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
});
