import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "../components/IconButton";
import { InterestPill } from "../components/InterestPills";
import { SearchOverlay } from "../components/SearchOverlay";
import { TAB_BAR_CLEARANCE } from "../components/FloatingTabBar";
import { useInterests } from "../lib/home";
import { isNewInterest, rankInterests, type Interest } from "../lib/interests";
import { ownCategories, useFacets } from "../lib/library";
import { track } from "../lib/metrics";
import { useSession } from "../lib/session";
import { space, type, usePalette } from "../lib/theme";

/** Every interest, not only the dozen the home row has room for. */
export default function Interests() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const userId = ready ? session.userId : null;
  const facets = useFacets(ready);
  const rows = useInterests(ready);
  const now = new Date();
  const interests = rankInterests(rows.data ?? [], { taken: ownCategories(facets.data).map((c) => c.value), now, limit: 40 });
  const [searchFor, setSearchFor] = useState<string | undefined>(undefined);

  const open = (interest: Interest) => {
    track(userId, "interest_opened", { kind: interest.kind, saves: interest.n });
    setSearchFor(interest.name);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Your interests</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[type.body, { color: p.inkMuted }]}>
          What keeps turning up in your saves. Nobody sets these up — a name appears once you have saved it three times, and fades if you stop.
        </Text>
        <View style={styles.wrap}>
          {interests.map((interest) => (
            <InterestPill key={interest.name} interest={interest} fresh={isNewInterest(interest, now)} onPress={() => open(interest)} />
          ))}
        </View>
        {rows.isPending && <Text style={[type.body, { color: p.inkMuted }]}>Counting…</Text>}
      </ScrollView>

      <SearchOverlay
        visible={!!searchFor}
        enabled={ready}
        userId={userId}
        initialQuery={searchFor}
        onClose={() => setSearchFor(undefined)}
        onOpenItem={(id) => { setSearchFor(undefined); router.push({ pathname: "/item/[id]", params: { id } }); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.md },
  headerTitle: { flex: 1, textAlign: "center" },
  headerSpacer: { width: 44 },
  page: { paddingHorizontal: space.lg, paddingBottom: TAB_BAR_CLEARANCE, gap: space.lg },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
