import { FlashList } from "@shopify/flash-list";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { FilterBar } from "./FilterBar";
import { IconButton } from "./IconButton";
import { ItemCard } from "./ItemCard";
import { setCollection } from "../lib/collection";
import { useFacets, useSearch, NO_FILTERS, type Filters, type LibraryItem } from "../lib/library";
import { track } from "../lib/metrics";
import { useThumbnails } from "../lib/thumbnails";
import { radius, space, type, usePalette } from "../lib/theme";

const IN_MS = 200, OUT_MS = 140;

/**
 * Search over whatever is on screen rather than in place of it.
 *
 * Animated with React Native's own driver rather than Reanimated: Reanimated is here only as
 * somebody else's dependency, and a search box is not worth taking a native module on for.
 */
export function SearchOverlay({ visible, enabled, userId, onClose, onOpenItem }: {
  visible: boolean;
  /** False until the library is ready, so no query is fired before there is an account to query. */
  enabled: boolean;
  userId: string | null;
  onClose: () => void;
  onOpenItem: (id: string) => void;
}) {
  const p = usePalette();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) setMounted(false); });
  }, [visible, anim]);

  // Clearing on the way out rather than on the way in, so the closing frames do not flash an empty box.
  useEffect(() => {
    if (mounted || visible) return;
    setText(""); setTerm(""); setFilters(NO_FILTERS);
  }, [mounted, visible]);

  // One query per pause in typing, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const facets = useFacets(enabled && mounted);
  const results = useSearch(term, filters, enabled && mounted);
  const items: LibraryItem[] = [...new Map((results.data?.pages.flatMap((page) => page.items) ?? []).map((i) => [i.id, i])).values()];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const searched = term.trim().length > 0;

  useEffect(() => {
    if (!searched || results.isPending || results.isError) return;
    track(userId, "search", { length: term.trim().length, results: results.data?.pages[0]?.items.length ?? 0 });
  }, [term, searched, results.isPending, results.isError, results.data?.pages[0]?.items.length, userId]);

  if (!mounted) return null;

  const panel = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
        {/* The screen behind stays visible and out of focus, so nothing is lost by searching. */}
        <BlurView intensity={28} tint={p.blur} style={StyleSheet.absoluteFill} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: p.floating }]} />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]} pointerEvents="box-none">
        <Animated.View style={[styles.panel, panel]}>
          <View style={styles.row}>
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
            <IconButton name="close" label="Close search" onPress={onClose} />
          </View>

          {searched && (
            <FilterBar
              facets={facets.data}
              filters={filters}
              onToggle={(group, value) => setFilters((c) => ({ ...c, [group]: c[group].includes(value) ? c[group].filter((v) => v !== value) : [...c[group], value] }))}
              onClear={() => setFilters(NO_FILTERS)}
            />
          )}

          <FlashList
            data={items}
            onEndReached={() => { if (results.hasNextPage && !results.isFetching && !results.isError) void results.fetchNextPage(); }}
            onEndReachedThreshold={0.5}
            numColumns={2}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
            ListFooterComponent={results.isFetchingNextPage
              ? <Text style={[type.label, styles.empty, { color: p.inkMuted }]}>Loading more…</Text>
              : results.isError && items.length > 0
                ? <Button label="Retry loading results" onPress={() => { void (results.isFetchNextPageError ? results.fetchNextPage() : results.refetch()); }} />
                : null}
            renderItem={({ item, index }) => (
              <View style={[styles.cell, index % 2 === 0 ? styles.cellLeft : styles.cellRight]}>
                <ItemCard
                  item={item}
                  thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined}
                  onPress={() => { setCollection(items.map((i) => i.id)); onOpenItem(item.id); }}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[type.body, { color: p.inkMuted }]}>
                  {!searched ? "Type to search everything you have saved."
                    : results.isPending ? "Searching…"
                    : results.isError ? "Search failed. Try again."
                    : `Nothing matches “${term}”.`}
                </Text>
                {searched && results.isError && <Button label="Retry search" onPress={() => { void results.refetch(); }} />}
                {searched && !results.isPending && !results.isError && (filters.platforms.length > 0 || filters.categories.length > 0) && (
                  <Button label="Search all saves" onPress={() => setFilters(NO_FILTERS)} />
                )}
              </View>
            }
          />
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  panel: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  input: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48 },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  cell: { flex: 1 },
  cellLeft: { paddingRight: space.sm },
  cellRight: { paddingLeft: space.sm },
  empty: { padding: space.lg, gap: space.md },
});
