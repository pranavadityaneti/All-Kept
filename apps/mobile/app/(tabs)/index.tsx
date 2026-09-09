import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { IconButton } from "../../components/IconButton";
import { ItemCard } from "../../components/ItemCard";
import { SearchField } from "../../components/SearchField";
import { SectionHeader } from "../../components/SectionHeader";
import { Wordmark } from "../../components/Wordmark";
import { useRecentSaves } from "../../lib/home";
import { useFacets, type LibraryItem } from "../../lib/library";
import { useTrackOnce } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { useLinkedSource } from "../../lib/sources";
import { setCollection } from "../../lib/collection";
import { useThumbnails } from "../../lib/thumbnails";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { radius, space, type, usePalette } from "../../lib/theme";

const CATEGORIES_SHOWN = 6;

export default function Home() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  const recent = useRecentSaves(ready);
  const facets = useFacets(ready);
  useTrackOnce(ready ? session.userId : null, "app_open");
  useTrackOnce(ready ? session.userId : null, "library_view");

  const items: LibraryItem[] = recent.data ?? [];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const categories = facets.data?.categories ?? [];
  const [shown, setShown] = useState(CATEGORIES_SHOWN);

  // A category tile borrows the newest picture saved under it.
  const pictureFor = (category: string) => {
    const match = items.find((i) => (i.category ?? "Sorting") === category && i.thumbnailPath);
    return match?.thumbnailPath ? thumbnails[match.thumbnailPath] : undefined;
  };

  const refreshing = recent.isRefetching || facets.isRefetching;
  const onRefresh = () => { void recent.refetch(); void facets.refetch(); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={p.inkMuted} />}
      >
        <View style={styles.header}>
          <Wordmark height={24} />
          <IconButton name="bell" label="Activity" onPress={() => router.push("/activity")} />
        </View>

        <SearchField onPress={() => router.push("/search")} />

        {session.status === "error" && (
          <Card>
            <Text style={[type.heading, { color: p.bad }]}>Could not start your library</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>{session.message}</Text>
            <Button label="Try again" onPress={session.retry} />
          </Card>
        )}

        {ready && !linked.data && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Start with Instagram</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>Send a reel or post to @allkeptapp and it lands here, sorted. Connecting takes about half a minute.</Text>
            <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
          </Card>
        )}

        <View style={styles.section}>
          <SectionHeader title="Recent saves" actionLabel={items.length > 0 ? "See all" : undefined} onAction={() => router.push("/library")} />
          {recent.isPending ? (
            <Text style={[type.body, { color: p.inkMuted }]}>Loading…</Text>
          ) : items.length === 0 ? (
            <Card>
              <Text style={[type.body, { color: p.inkMuted }]}>Nothing saved yet. In Instagram, tap the paper plane under a reel and send it to @allkeptapp.</Text>
            </Card>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railInner}>
              {items.slice(0, 8).map((item) => (
                <View key={item.id} style={styles.railCard}>
                  <ItemCard item={item} thumbnail={item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined} onPress={() => { setCollection(items.map((i) => i.id)); router.push({ pathname: "/item/[id]", params: { id: item.id } }); }} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {categories.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Categories"
              actionLabel={categories.length > shown ? "See all" : undefined}
              onAction={() => setShown(categories.length)}
            />
            <View style={styles.grid}>
              {categories.slice(0, shown).map((c) => {
                const picture = pictureFor(c.value);
                return (
                  <Pressable
                    key={c.value}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.value}, ${c.n} saved`}
                    onPress={() => router.push({ pathname: "/library", params: { category: c.value } })}
                    style={({ pressed }) => [styles.tile, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <View style={[styles.tileArt, { backgroundColor: p.accentSoft }]}>
                      {picture ? (
                        <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                      ) : (
                        <Text style={[type.section, { color: p.accent }]}>{c.value.slice(0, 1)}</Text>
                      )}
                    </View>
                    <View style={styles.tileText}>
                      <Text numberOfLines={2} style={[type.body, { color: p.ink }]}>{c.value}</Text>
                      <Text style={[type.label, { color: p.inkMuted }]}>{c.n}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { padding: space.lg, gap: space.xl, paddingBottom: TAB_BAR_CLEARANCE },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: { gap: space.md },
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.md },
  railCard: { width: 156 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg },
  tileArt: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  tileText: { flex: 1, gap: 2 },
});
