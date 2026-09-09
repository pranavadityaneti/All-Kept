import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { IconButton } from "../../components/IconButton";
import { ItemCard } from "../../components/ItemCard";
import { CategoryTile } from "../../components/CategoryTile";
import { SaveLinkField } from "../../components/SaveLinkField";
import { SearchOverlay } from "../../components/SearchOverlay";
import { SectionHeader } from "../../components/SectionHeader";
import { ScreenHeader } from "../../components/ScreenHeader";
import { categoryLabel } from "../../lib/sorting";
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
  const [searching, setSearching] = useState(false);


  // Only a pull the person actually made turns this indicator on. Binding it to isRefetching held it
  // open for every background refetch, and realtime causes plenty, which left a spinner stuck at the
  // top of the screen with the library pushed down beneath it.
  const [pulled, setPulled] = useState(false);
  const onRefresh = () => {
    setPulled(true);
    void Promise.allSettled([recent.refetch(), facets.refetch()]).then(() => setPulled(false));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <ScreenHeader>
        <IconButton name="search" label="Search your saves" onPress={() => setSearching(true)} />
        <IconButton name="bell" label="Activity" onPress={() => router.push("/activity")} />
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={pulled} onRefresh={onRefresh} tintColor={p.inkMuted} />}
      >


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


        <SaveLinkField />
        {categories.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Categories"
              actionLabel={categories.length > shown ? "See all" : undefined}
              onAction={() => setShown(categories.length)}
            />
            <View style={styles.grid}>
              {categories.slice(0, shown).map((c) => (
                <View key={c.value} style={styles.cell}>
                  <CategoryTile name={c.value} count={c.n} onPress={() => router.push({ pathname: "/library", params: { category: c.value } })} />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

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
  page: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: TAB_BAR_CLEARANCE },
  section: { gap: space.md },
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.md },
  railCard: { width: 156 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { flexBasis: "47.5%", flexGrow: 1 },
});
