import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NO_FILTERS } from "../lib/filter-groups";
import { distanceWord, nearby } from "../lib/geo";
import { hoursLine } from "../lib/hours";
import { useHere } from "../lib/location";
import { usePlacedSaves } from "../lib/places";
import { font, radius, space, type, usePalette } from "../lib/theme";
import { useThumbnails } from "../lib/thumbnails";
import { Icon } from "./Icon";
import { SectionHeader } from "./SectionHeader";

/** How far a saved place may be to count as near: a walk or a short ride. */
export const NEAR_KM = 5;
const SHOWN = 3;

/**
 * "You saved CEMNT — 1.2 km away." The saved places within a few kilometres of where the phone
 * is, nearest first — shown only once the person has let the app know where they are (from
 * "Near me" on the map), never asked for here. Nothing at all, for nearly everyone, nearly always.
 */
export function NearYou({ enabled, onSeeMap }: { enabled: boolean; onSeeMap: () => void }) {
  const p = usePalette();
  const router = useRouter();
  const { here } = useHere();
  const placed = usePlacedSaves(NO_FILTERS, enabled && here.status === "granted");
  const near = nearby(placed.data ?? [], here.coords, NEAR_KM);
  const thumbnails = useThumbnails(near.slice(0, SHOWN).map((n) => n.thumbnailPath));
  if (near.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Near you" actionLabel={near.length > SHOWN ? "See on the map" : undefined} onAction={onSeeMap} />
      {near.slice(0, SHOWN).map((n) => {
        const thumbnail = n.thumbnailPath ? thumbnails[n.thumbnailPath] : undefined;
        const hours = hoursLine(n.place.periods, n.place.utcOffsetMinutes, new Date());
        const title = n.title?.trim() || n.text?.trim().split("\n")[0] || n.place.name;
        return (
          <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.place.name}, ${distanceWord(n.km)} away, saved as ${title}`} onPress={() => router.push({ pathname: "/item/[id]", params: { id: n.id } })} style={({ pressed }) => [styles.row, { backgroundColor: p.surface, borderColor: p.border }, pressed && styles.pressed]}>
            <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
              {thumbnail ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors /> : <Icon name="pin" size={18} color={p.inkMuted} />}
            </View>
            <View style={styles.text}>
              <Text numberOfLines={1} style={[type.body, styles.name, { color: p.ink }]}>{n.place.name} · {distanceWord(n.km)}</Text>
              <Text numberOfLines={1} style={[type.label, { color: p.inkMuted }]}>{hours ? `${hours} · ` : ""}{title}</Text>
            </View>
            <Icon name="chevron" size={18} color={p.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.85 },
  thumb: { width: 48, height: 48, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  name: { ...font("600") },
});
