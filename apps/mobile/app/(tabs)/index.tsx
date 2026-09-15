import { useRouter } from "expo-router";
import { useState } from "react";
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { IconButton } from "../../components/IconButton";
import { ItemCard } from "../../components/ItemCard";
import { CategoryTile } from "../../components/CategoryTile";
import { CategorySheet } from "../../components/CategorySheet";
import { SaveLinkField } from "../../components/SaveLinkField";
import { SavesStanding } from "../../components/SavesStanding";
import { StandingCard } from "../../components/StandingCard";
import { InterestPills } from "../../components/InterestPills";
import { SearchOverlay } from "../../components/SearchOverlay";
import { SectionHeader } from "../../components/SectionHeader";
import { PlatformPills } from "../../components/PlatformPills";
import { FILTER_LABEL } from "../../lib/platforms";
import { ScreenHeader } from "../../components/ScreenHeader";
import { categoryLabel } from "../../lib/sorting";
import { arrangeGrid } from "../../lib/category-grid";
import { useCategoryActivity, useInterests, useRecentSaves } from "../../lib/home";
import { rankInterests, showInterests, type Interest } from "../../lib/interests";
import { usePreferences, useSetPreference } from "../../lib/preferences";
import { RESERVED_NAMES } from "../../lib/user-categories";
import { ownCategories, useCreateCategory, useFacets, type LibraryItem } from "../../lib/library";
import { track, useTrackOnce } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { useLinkedSource } from "../../lib/sources";
import { setCollection } from "../../lib/collection";
import { useThumbnails } from "../../lib/thumbnails";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { radius, space, type, usePalette } from "../../lib/theme";

const GUTTER = space.sm + 2;
const { width } = Dimensions.get("window");

export default function Home() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  // Home's own narrowing, deliberately not shared with Library: filtering a glance should not quietly
  // change what the other tab shows when you get there.
  const [onlyFrom, setOnlyFrom] = useState<string[]>([]);
  const toggleFrom = (v: string) => setOnlyFrom((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  const recent = useRecentSaves(ready, onlyFrom);
  const facets = useFacets(ready);
  useTrackOnce(ready ? session.userId : null, "app_open");
  useTrackOnce(ready ? session.userId : null, "library_view");

  const items: LibraryItem[] = recent.data ?? [];
  const categories = facets.data?.categories ?? [];
  const thumbnails = useThumbnails(items.map((i) => i.thumbnailPath));
  const activity = useCategoryActivity(ready);
  const [allCategories, setAllCategories] = useState(false);
  const [naming, setNaming] = useState(false);
  const createCategory = useCreateCategory(ready ? session.userId : null);
  const places = categories.filter((c) => !(RESERVED_NAMES as readonly string[]).includes(c.value));
  const grid = arrangeGrid(places, activity.data ?? [], allCategories);
  const openCategory = (value: string) => router.push({ pathname: "/library", params: { category: value } });
  const [searching, setSearching] = useState(false);
  // A pill pulls its thread through search; a tap on the magnifier starts empty.
  const [searchFor, setSearchFor] = useState<string | undefined>(undefined);

  // Interests are counted before they are asked about — that is what says whether there is anything
  // to ask. Nothing is shown until the answer is yes; "No thanks" ends the question for good.
  const userId = ready ? session.userId : null;
  const prefs = usePreferences(userId);
  const setPref = useSetPreference(userId);
  // Undefined while the settings have not arrived — distinct from null, which means "never asked".
  // Conflating the two would put the question to someone who already answered it whenever the
  // settings read hiccups, and their answer is the one thing this card must respect.
  const wantsInterests: boolean | null | undefined = prefs.data ? prefs.data.interestsEnabled : undefined;
  const interestRows = useInterests(ready && wantsInterests !== false && wantsInterests !== undefined);
  const now = new Date();
  const interests = rankInterests(interestRows.data ?? [], { taken: ownCategories(facets.data).map((c) => c.value), now });
  const openInterest = (interest: Interest) => {
    track(userId, "interest_opened", { kind: interest.kind, saves: interest.n });
    setSearchFor(interest.name);
    setSearching(true);
  };


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

        {ready && <StandingCard userId={userId} />}

        {ready && !linked.data && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Start with Instagram</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>Send a reel or post to @allkeptapp and it lands here, sorted. Connecting takes about half a minute.</Text>
            <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
          </Card>
        )}

        <View style={styles.section}>
          <PlatformPills options={facets.data?.platforms} selected={onlyFrom} onToggle={toggleFrom} showCounts={false} inset={false} />
          <SectionHeader title="Recent saves" actionLabel={items.length > 0 ? "See all" : undefined} onAction={() => router.push("/library")} />
          {recent.isPending ? (
            <Text style={[type.body, { color: p.inkMuted }]}>Loading…</Text>
          ) : items.length === 0 && onlyFrom.length > 0 ? (
            // An empty row because of a pill is not an empty library, and telling someone to go and
            // save their first reel when they have thirty is the kind of thing that reads as broken.
            <Card>
              <Text style={[type.body, { color: p.inkMuted }]}>Nothing recent from {onlyFrom.map((v) => FILTER_LABEL[v] ?? v).join(" or ")}.</Text>
              <Button label="Show all" variant="secondary" onPress={() => setOnlyFrom([])} />
            </Card>
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


        <View style={styles.standing}>
          <SaveLinkField />
          <SavesStanding userId={userId} />
        </View>

        {ready && showInterests(interests) && wantsInterests === null && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Allkept noticed what you keep saving</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>
              The people, places and things that turn up again and again — counted from the sorting it already does, shown only to you.
              You can switch it off any time in Settings.
            </Text>
            <Button label="Show my interests" onPress={() => setPref.mutate({ name: "interestsEnabled", value: true })} />
            <Button label="No thanks" variant="secondary" onPress={() => setPref.mutate({ name: "interestsEnabled", value: false })} />
          </Card>
        )}

        {ready && showInterests(interests) && wantsInterests === true && (
          <View style={styles.section}>
            <SectionHeader title="Explore interests" actionLabel="See all" onAction={() => router.push("/interests")} />
            <InterestPills interests={interests} now={now} onPress={openInterest} />
          </View>
        )}

        {ready && (
          <View style={styles.section}>
            <SectionHeader
              title="Categories"
              actionLabel={grid.actionLabel}
              onAction={() => setAllCategories((open) => !open)}
              pill={{ label: "+ Custom", onPress: () => setNaming(true) }}
            />
            {grid.wide.length > 0 && (
              <View style={styles.grid}>
                {grid.wide.map((c) => (
                  <View key={c.value} style={styles.wideCell}>
                    <CategoryTile name={c.value} chosen={c.icon} large onPress={() => openCategory(c.value)} />
                  </View>
                ))}
              </View>
            )}
            <View style={styles.grid}>
              {grid.rest.map((c) => (
                <View key={c.value} style={styles.cell}>
                  <CategoryTile name={c.value} chosen={c.icon} onPress={() => openCategory(c.value)} />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <CategorySheet
        visible={naming}
        existing={ownCategories(facets.data).map((c) => c.value)}
        onClose={() => setNaming(false)}
        onSubmit={async ({ name, icon }) => {
          try {
            await createCategory.mutateAsync({ name, icon });
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not make the category.";
          }
        }}
      />

      <SearchOverlay
        visible={searching}
        enabled={ready}
        userId={ready ? session.userId : null}
        initialQuery={searchFor}
        onClose={() => { setSearching(false); setSearchFor(undefined); }}
        onOpenItem={(id) => { setSearching(false); router.push({ pathname: "/item/[id]", params: { id } }); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: TAB_BAR_CLEARANCE },
  section: { gap: space.md },
  standing: { gap: space.sm },
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.md },
  railCard: { width: 156 },
  // Three across with a fixed gutter, left-aligned. "space-between" spread a two-item last row to
  // the edges and left a hole in the middle, which the New tile — always last — made routine.
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", columnGap: GUTTER, rowGap: space.md },
  cell: { width: (width - 2 * space.lg - 2 * GUTTER) / 3 },
  wideCell: { width: (width - 2 * space.lg - GUTTER) / 2 },
});
