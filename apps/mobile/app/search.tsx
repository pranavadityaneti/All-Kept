import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { ItemCard } from "../components/ItemCard";
import { useFilters } from "../lib/filters";
import { useSearch, type LibraryItem } from "../lib/library";
import { useSession } from "../lib/session";
import { useThumbnails } from "../lib/thumbnails";
import { radius, space, type, usePalette } from "../lib/theme";

export default function Search() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const { filters } = useFilters();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");

  // One query per pause in typing, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const results = useSearch(term, filters, session.status === "ready");
  const items: LibraryItem[] = results.data ?? [];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const searched = term.trim().length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TextInput
          accessibilityLabel="Search your library"
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="Search captions, tags, people"
          placeholderTextColor={p.inkMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.input, type.body, { backgroundColor: p.surface, borderColor: p.border, color: p.ink }]}
        />
        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </View>

      <FlashList
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
            <ItemCard item={item} thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined} onPress={() => router.push(`/item/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[type.body, { color: p.inkMuted }]}>
              {!searched ? "Type to search everything you have saved." : results.isPending ? "Searching…" : results.error ? "Search failed. Try again." : `Nothing matches “${term}”.`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 },
  list: { padding: space.lg },
  cell: { flex: 1 },
  cellLeft: { paddingRight: space.sm },
  cellRight: { paddingLeft: space.sm },
  empty: { padding: space.lg },
});
