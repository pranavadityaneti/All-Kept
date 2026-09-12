import { PlatformLogo } from "./PlatformLogo";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryLabel, sortingNote, statusNote } from "../lib/sorting";
import { hostLabel, platformLabel } from "../lib/platforms";
import type { LibraryItem } from "../lib/library";
import { radius, space, type, usePalette } from "../lib/theme";


/**
 * Where a save came from. A platform has a name of its own; a link has an address, which is more
 * use than the word "Web" — especially for the sites that will not give us a preview, where it is
 * the only thing distinguishing one card from the next.
 */
export function sourceLabel(item: LibraryItem): string {
  if (item.platform !== "web") return platformLabel(item.platform);
  return hostLabel(item.canonicalUrl ?? item.sourceUrl) ?? platformLabel(item.platform);
}

/** One line that says what the card is, whatever the item has. */
export function cardTitle(item: LibraryItem): string {
  const first = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return item.title?.trim() || first(item.text ?? "") || item.authorName?.trim() || sourceLabel(item) || "Saved";
}

export function ItemCard({ item, thumbnail, onPress }: { item: LibraryItem; thumbnail?: string; onPress: () => void }) {
  const p = usePalette();
  const note = statusNote(item);
  const category = categoryLabel(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cardTitle(item)}, ${category}, ${sourceLabel(item)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.placeholder}><PlatformLogo platform={item.platform} size={40}/><Text numberOfLines={2} style={[type.label, styles.placeholderLabel, { color: p.inkMuted }]}>{sourceLabel(item)}</Text></View>
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
  placeholder: { alignItems: "center", gap: space.sm, paddingHorizontal: space.sm },
  // A long host has to wrap inside the card rather than run out of it.
  placeholderLabel: { textAlign: "center" },
  platformBadge: { position: "absolute", right: space.sm, bottom: space.sm, padding: 7, borderRadius: radius.sm },
  badge: { position: "absolute", left: space.sm, top: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  body: { padding: space.md, gap: space.xs },
});
