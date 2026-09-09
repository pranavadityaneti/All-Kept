import { PlatformLogo } from "./PlatformLogo";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryLabel, sortingNote } from "../lib/sorting";
import { platformLabel } from "../lib/platforms";
import type { LibraryItem } from "../lib/library";
import { radius, space, type, usePalette } from "../lib/theme";


/** One line that says what the card is, whatever the item has. */
export function cardTitle(item: LibraryItem): string {
  const first = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return item.title?.trim() || first(item.text ?? "") || item.authorName?.trim() || platformLabel(item.platform) || "Saved";
}

/** What the card says while the pipeline is still working, or when it could not finish. */
export function statusNote(item: LibraryItem): string | null {
  const sorting = sortingNote(item);
  if (sorting) return sorting;
  if (item.status === "no_link") return "No link";
  if (item.status === "preview_unavailable") return "No preview";
  return null;
}

export function ItemCard({ item, thumbnail, onPress }: { item: LibraryItem; thumbnail?: string; onPress: () => void }) {
  const p = usePalette();
  const note = statusNote(item);
  const category = categoryLabel(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cardTitle(item)}, ${category}, ${platformLabel(item.platform)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.placeholder}><PlatformLogo platform={item.platform} size={40}/><Text style={[type.label, { color: p.inkMuted }]}>{platformLabel(item.platform)}</Text></View>
        )}
        {thumbnail && <View style={[styles.platformBadge, { backgroundColor: p.surface }]}><PlatformLogo platform={item.platform} size={20}/></View>}
        {note && (
          <View style={[styles.badge, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Text style={[type.label, { color: p.inkMuted }]}>{note}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[type.body, { color: p.ink }]}>{cardTitle(item)}</Text>
        <Text numberOfLines={1} style={[type.label, { color: item.category ? p.accent : p.inkMuted }]}>{category}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  thumb: { aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { alignItems: "center", gap: space.sm },
  platformBadge: { position: "absolute", right: space.sm, bottom: space.sm, padding: 7, borderRadius: radius.sm },
  badge: { position: "absolute", left: space.sm, top: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  body: { padding: space.md, gap: space.xs },
});
