import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { font, radius, space, type, usePalette } from "../lib/theme";
import { tripStatus, tripTitle, type TripSummary } from "../lib/weave";

/**
 * Your trips: every trip the person has asked for, newest first, each pictured by one of its own
 * saves and saying where it is — reading, ready to plan, weaving, ready, or stopped — in words with
 * a dot of the same tone, so the colour is never the only sign. A tap goes to where it is.
 */
export function TripList({ trips, pictures, now, onOpen }: {
  trips: TripSummary[];
  /** Thumbnail addresses by save id, for the trips that have a picture. */
  pictures: Record<string, string | undefined>;
  now: number;
  onOpen: (trip: TripSummary) => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.list}>
      {trips.map((trip) => {
        const title = tripTitle(trip.towns);
        const days = trip.days ? `${trip.days} ${trip.days === 1 ? "day" : "days"}` : null;
        const status = tripStatus(trip, now);
        const tone = status.tone === "good" ? p.good : status.tone === "bad" ? p.bad : p.accent;
        const picture = trip.pictureId ? pictures[trip.pictureId] : undefined;
        return (
          <Pressable
            key={trip.id}
            accessibilityRole="button"
            accessibilityLabel={`${title}${days ? `, ${days}` : ""}. ${status.text}`}
            onPress={() => onOpen(trip)}
            style={({ pressed }) => [styles.row, { backgroundColor: p.surface, borderColor: p.border }, pressed && styles.pressed]}
          >
            <View style={[styles.thumb, { backgroundColor: p.accentSoft }]}>
              {picture
                ? <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
                : <Icon name="route" size={20} color={p.accent} />}
            </View>
            <View style={styles.words}>
              <Text numberOfLines={1} style={[type.body, styles.title, { color: p.ink }]}>{title}{days ? ` · ${days}` : ""}</Text>
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: tone }]} />
                <Text numberOfLines={1} style={[type.label, styles.grow, { color: tone }]}>{status.text}</Text>
              </View>
            </View>
            <Icon name="chevron" size={18} color={p.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  thumb: { width: 44, height: 44, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  words: { flex: 1, gap: 2 },
  title: { ...font("600") },
  status: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  grow: { flex: 1 },
});
