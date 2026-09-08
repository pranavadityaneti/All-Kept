import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FilterBar } from "../components/FilterBar";
import { ItemCard } from "../components/ItemCard";
import { useFilters } from "../lib/filters";
import { useFacets, useLibrary, useLibraryRealtime, type LibraryItem } from "../lib/library";
import { useSession } from "../lib/session";
import { useLinkedSource } from "../lib/sources";
import { useThumbnails } from "../lib/thumbnails";
import { space, type, usePalette } from "../lib/theme";

export default function Library() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  const { filters, loaded, toggle, clear, hasFilters } = useFilters();
  const library = useLibrary(filters, ready && loaded);
  const facets = useFacets(ready);
  useLibraryRealtime(ready);

  const items: LibraryItem[] = library.data?.pages.flatMap((page) => page.items) ?? [];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const busy = library.isPending || (!loaded && ready);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={[type.title, { color: p.ink }]}>Allkept</Text>
        {items.length > 0 && <Button label="Search" variant="secondary" onPress={() => router.push("/search")} />}
      </View>

      <FilterBar facets={facets.data} filters={filters} onToggle={toggle} onClear={clear} />

      <FlashList
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={library.isRefetching && !library.isFetchingNextPage} onRefresh={() => { void library.refetch(); void facets.refetch(); }} tintColor={p.inkMuted} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (library.hasNextPage && !library.isFetchingNextPage) void library.fetchNextPage(); }}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
            <ItemCard item={item} thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined} onPress={() => router.push(`/item/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {session.status === "error" ? (
              <Card>
                <Text style={[type.heading, { color: p.bad }]}>Could not start your library</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>
                  {session.anonymousDisabled
                    ? "Anonymous sign-ins are switched off for this project. Turn them on in the Supabase dashboard under Authentication, then try again."
                    : session.message}
                </Text>
                <Button label="Try again" onPress={session.retry} />
              </Card>
            ) : busy ? (
              <Text style={[type.body, { color: p.inkMuted }]}>Loading your library…</Text>
            ) : !linked.data ? (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Start with Instagram</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>Send a reel or post to @allkeptapp and it lands here, sorted. Connecting takes about half a minute.</Text>
                <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
              </Card>
            ) : hasFilters ? (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Nothing under these filters</Text>
                <Button label="Clear filters" variant="secondary" onPress={clear} />
              </Card>
            ) : (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Nothing saved yet</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>In Instagram, tap the paper plane under any reel and send it to @allkeptapp. It appears here within seconds.</Text>
              </Card>
            )}
          </View>
        }
        ListFooterComponent={library.isFetchingNextPage ? <Text style={[type.label, styles.footer, { color: p.inkMuted }]}>Loading more…</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  list: { padding: space.lg },
  cell: { flex: 1 },
  cellLeft: { paddingRight: space.sm },
  cellRight: { paddingLeft: space.sm },
  empty: { padding: space.lg, gap: space.lg },
  footer: { textAlign: "center", padding: space.lg },
});
