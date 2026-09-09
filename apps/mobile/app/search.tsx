import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "../components/IconButton";
import { ItemCard } from "../components/ItemCard";
import { FilterBar } from "../components/FilterBar";
import { Button } from "../components/Button";
import { useSearch, useFacets, NO_FILTERS, type Filters, type LibraryItem } from "../lib/library";
import { track } from "../lib/metrics";
import { useSession } from "../lib/session";
import { setCollection } from "../lib/collection";
import { useThumbnails } from "../lib/thumbnails";
import { radius, space, type, usePalette } from "../lib/theme";

export default function Search() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const facets = useFacets(session.status === "ready");
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");

  // One query per pause in typing, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const results = useSearch(term, filters, session.status === "ready");
  const items: LibraryItem[] = [...new Map((results.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const searched = term.trim().length > 0;
  const userId = session.status === "ready" ? session.userId : null;

  useEffect(() => {
    if (!searched || results.isPending || results.isError) return;
    track(userId, "search", { length: term.trim().length, results: results.data?.pages[0]?.items.length ?? 0 });
  }, [term, searched, results.isPending, results.isError, results.data?.pages[0]?.items.length, userId]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TextInput
          accessibilityLabel="Search your library"
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder="Search words, people, or ideas"
          maxLength={300}
          placeholderTextColor={p.inkMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.input, type.body, { backgroundColor: p.surface, borderColor: p.border, color: p.ink }]}
        />
        <IconButton name="close" label="Close search" onPress={() => router.back()} />
      </View>

      <FilterBar facets={facets.data} filters={filters}
        onToggle={(group, value) => setFilters((current) => ({ ...current, [group]: current[group].includes(value) ? current[group].filter((v) => v !== value) : [...current[group], value] }))}
        onClear={() => setFilters(NO_FILTERS)}
      />
      <FlashList
        data={items}
        onEndReached={() => { if (results.hasNextPage && !results.isFetching && !results.isError) void results.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        refreshing={searched && results.isRefetching && !results.isFetchingNextPage}
        onRefresh={() => { if (searched) void results.refetch(); }}
        ListFooterComponent={results.isFetchingNextPage ? <Text style={[type.label, styles.empty, { color: p.inkMuted }]}>Loading more…</Text> : results.isError && items.length > 0 ? <Button label="Retry loading results" onPress={() => { void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch()); }} /> : null}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
            <ItemCard item={item} thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined} onPress={() => { setCollection(items.map((i) => i.id)); router.push({ pathname: "/item/[id]", params: { id: item.id } }); }} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[type.body, { color: p.inkMuted }]}>
              {!searched ? "Type to search everything you have saved." : results.isPending ? "Searching…" : results.error ? "Search failed. Try again." : `Nothing matches “${term}”.`}
            </Text>
            {searched && results.isError && <Button label="Retry search" onPress={() => { void results.refetch(); }} />}
            {searched && !results.isPending && !results.isError && (filters.platforms.length > 0 || filters.categories.length > 0) && <Button label="Search all saves" onPress={() => setFilters(NO_FILTERS)} />}
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
