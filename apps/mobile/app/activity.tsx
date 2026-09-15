import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { cardTitle } from "../components/ItemCard";
import { PlatformLogo } from "../components/PlatformLogo";
import { describe, entriesFor, groupEntries, when } from "../lib/activity";
import { useRecentSaves } from "../lib/home";
import { useFiredReminders } from "../lib/library";
import { useSession } from "../lib/session";
import { font, radius, space, type, usePalette } from "../lib/theme";
import { useThumbnails } from "../lib/thumbnails";

export default function Activity() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const recent = useRecentSaves(session.status === "ready");
  const reminded = useFiredReminders(session.status === "ready");
  // A reminder that has fired is an entry beside the saves, at the time it fired.
  const entries = useMemo(() => entriesFor(recent.data ?? [], reminded.data ?? []), [recent.data, reminded.data]);
  const sections = useMemo(() => groupEntries(entries, new Date()), [entries]);
  const thumbnails = useThumbnails(entries.map((e) => e.item.thumbnailPath));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      {/* Back on the left with the name centred, the way a pushed screen is titled everywhere else. */}
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(e) => e.key}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.day}>
            <View style={[styles.dayRule, { backgroundColor: p.border }]} />
            <Text style={[type.label, styles.dayLabel, { color: p.inkMuted }]}>{section.title}</Text>
            <View style={[styles.dayRule, { backgroundColor: p.border }]} />
          </View>
        )}
        renderItem={({ item: entry }) => {
          const item = entry.item;
          const thumbnail = item.thumbnailPath ? thumbnails[item.thumbnailPath] : undefined;
          const line = entry.kind === "reminder" ? "You asked to be reminded" : describe(item.status, item.category, !!item.thumbnailPath);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${cardTitle(item)}. ${line}`}
              onPress={() => router.push(`/item/${item.id}`)}
              style={styles.row}
            >
              <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
                {thumbnail ? (
                  <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
                ) : (
                  <Icon name="note" size={18} color={p.inkMuted} />
                )}
              </View>

              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[type.body, styles.rowTitle, { color: p.ink }]}>{cardTitle(item)}</Text>
                <Text numberOfLines={1} style={[type.label, { color: p.inkMuted }]}>
                  {line} · {when(entry.at)}
                </Text>
              </View>

              {/* Where the reference puts the face that acted, ours puts the place the save came from — or the bell, for a reminder. */}
              {entry.kind === "reminder" ? <Icon name="bell" size={22} color={p.accent} /> : <PlatformLogo platform={item.platform} size={24} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[type.body, styles.empty, { color: p.inkMuted }]}>
            {recent.isPending ? "Loading…" : "Nothing has arrived yet. Send a reel to @allkeptapp and it shows up here."}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md },
  headerTitle: { flex: 1, textAlign: "center" },
  // Balances the back button so the title sits in the true centre rather than pushed off it.
  headerSpacer: { width: 44 },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  day: { flexDirection: "row", alignItems: "center", gap: space.md, paddingTop: space.xl, paddingBottom: space.sm },
  dayRule: { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel: { letterSpacing: 0.8 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  thumb: { width: 48, height: 48, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...font("600") },
  empty: { padding: space.lg },
});
