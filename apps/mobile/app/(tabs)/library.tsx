import { FlashList } from "@shopify/flash-list";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { SearchOverlay } from "../../components/SearchOverlay";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Card } from "../../components/Card";
import { FilterBar } from "../../components/FilterBar";
import { FilterSheet } from "../../components/FilterSheet";
import { ItemCard } from "../../components/ItemCard";
import { activeFilters, exactMatches, type Matches } from "../../lib/filter-options";
import { useFilters } from "../../lib/filters";
import { NO_FILTERS, useFacets, useLibrary, type LibraryItem } from "../../lib/library";
import { useTrackOnce } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { useLinkedSource } from "../../lib/sources";
import { setCollection } from "../../lib/collection";
import { useThumbnails } from "../../lib/thumbnails";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { space, type, usePalette } from "../../lib/theme";

export default function Library() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  const { filters, loaded, set, toggle, clear, hasFilters } = useFilters();
  const params = useLocalSearchParams<{ category?: string }>();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    // Arriving from a category tile: show exactly what the tile counted, once. It waits for the stored
    // filters, because the read that is already in flight lands afterwards and would put them back.
    const wanted = params.category;
    if (!loaded || !wanted || applied.current === wanted) return;
    applied.current = wanted;
    set({ ...NO_FILTERS, categories: [wanted] });
  }, [loaded, params.category, set]);
  const library = useLibrary(filters, ready && loaded);
  const facets = useFacets(ready);
  const userId = ready ? session.userId : null;
  useTrackOnce(userId, "app_open");
  useTrackOnce(userId, "library_view");

  const items: LibraryItem[] = library.data?.pages.flatMap((page) => page.items) ?? [];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const [searching, setSearching] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const busy = library.isPending || linked.isPending || (!loaded && ready);

  // The counts answer a selection within one group on their own. Across two groups they cannot, and
  // then the only honest number is what the pages already loaded hold, said as a floor.
  const exact = exactMatches(facets.data, filters);
  const matches: Matches = exact === null
    ? { n: items.length, more: library.hasNextPage, pending: library.isPending }
    : { n: exact, more: false, pending: false };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <ScreenHeader>
        {(items.length > 0 || hasFilters) && <IconButton name="search" label="Search your saves" onPress={() => setSearching(true)} />}
      </ScreenHeader>

      <FilterBar facets={facets.data} filters={filters} matches={matches} onOpen={() => setFiltering(true)} onRemove={toggle} onClear={clear} />

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
            <ItemCard item={item} thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined} onPress={() => { setCollection(items.map((i) => i.id)); router.push({ pathname: "/item/[id]", params: { id: item.id } }); }} />
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
            ) : library.isError ? (
              <Card>
                <Text style={[type.heading, { color: p.bad }]}>Could not load your library</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>{library.error instanceof Error ? library.error.message : "Something went wrong."}</Text>
                <Button label="Try again" onPress={() => { void library.refetch(); }} />
              </Card>
            ) : !linked.data ? (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Start with Instagram</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>Send a reel or post to @allkeptapp and it lands here, sorted. Connecting takes about half a minute.</Text>
                <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
              </Card>
            ) : hasFilters ? (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Nothing under these filters</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>{activeFilters(filters).map((f) => f.label).join(" · ")}</Text>
                <Button label="Change filters" onPress={() => setFiltering(true)} />
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

      <FilterSheet
        visible={filtering}
        facets={facets.data}
        filters={filters}
        matches={matches}
        onToggle={toggle}
        onClear={clear}
        onClose={() => setFiltering(false)}
      />

      <SearchOverlay
        visible={searching}
        enabled={ready}
        userId={ready ? session.userId : null}
        onClose={() => setSearching(false)}
        onOpenItem={(id) => { setSearching(false); router.push({ pathname: "/item/[id]", params: { id } }); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  cell: { flex: 1 },
  cellLeft: { paddingRight: space.sm },
  cellRight: { paddingLeft: space.sm },
  empty: { padding: space.lg, gap: space.lg },
  footer: { textAlign: "center", padding: space.lg },
});
