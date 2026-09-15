import { PlatformLogo } from "./PlatformLogo";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cardTitle, sourceLabel } from "../lib/card-text";
import { categoryLabel, statusNote } from "../lib/sorting";
import type { LibraryItem } from "../lib/library";
import { radius, space, type, usePalette } from "../lib/theme";

// The words on a card live in lib/card-text.ts, where the row can share them; kept here for the screens that import them from the card.
export { cardTitle, sourceLabel };

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
