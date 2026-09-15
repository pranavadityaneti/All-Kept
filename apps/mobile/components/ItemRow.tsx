import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { PlatformLogo } from "./PlatformLogo";
import { cardTitle } from "../lib/card-text";
import type { LibraryItem } from "../lib/library";
import { rowMeta, rowMetaParts } from "../lib/library-view";
import { statusNote } from "../lib/sorting";
import { radius, space, type, usePalette } from "../lib/theme";

const THUMB = 64;

/**
 * One save as a row: the list view's compact card. The same picture, title and standing as the
 * card, laid side by side so a screen holds eight rather than four; the same tap, the same page.
 */
export function ItemRow({ item, thumbnail, onPress }: { item: LibraryItem; thumbnail?: string; onPress: () => void }) {
  const p = usePalette();
  const note = statusNote(item);
  const meta = rowMetaParts(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cardTitle(item)}, ${rowMeta(item)}${item.placeName ? `, at ${item.placeName}` : ""}${item.doneAt ? ", done" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
        {thumbnail
          ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
          : <PlatformLogo platform={item.platform} size={28} />}
        {thumbnail && <View style={[styles.platformBadge, { backgroundColor: p.surface }]}><PlatformLogo platform={item.platform} size={14} /></View>}
      </View>
      <View style={styles.words}>
        <Text numberOfLines={2} style={[type.body, { color: p.ink }]}>{cardTitle(item)}</Text>
        <Text numberOfLines={1} style={[type.label, { color: p.inkMuted }]}>
          <Text style={{ color: item.category ? p.accent : p.inkMuted }}>{meta.category}</Text>
          {` · ${meta.source} · ${meta.day}`}
          {note ? ` · ${note}` : ""}
        </Text>
      </View>
      {item.placeName && <Icon name="pin" size={18} color={p.accent} />}
      {item.doneAt && <Icon name="doneSet" size={18} color={p.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.sm, paddingRight: space.md },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  platformBadge: { position: "absolute", right: 4, bottom: 4, padding: 4, borderRadius: radius.sm },
  words: { flex: 1, gap: 2 },
});
