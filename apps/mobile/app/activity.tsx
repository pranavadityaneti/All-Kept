import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "../components/IconButton";
import { cardTitle } from "../components/ItemCard";
import { useRecentSaves } from "../lib/home";
import { useSession } from "../lib/session";
import { space, type, usePalette } from "../lib/theme";

/** What has happened lately, read from the saves themselves: there is nothing else to notify about yet. */
function describe(status: string, category: string | null): string {
  if (status === "pending" || status === "failed") return "Saved, still sorting";
  if (status === "no_link") return category ? `Saved as ${category}, no link yet` : "Saved, no link yet";
  if (status === "preview_unavailable") return category ? `Saved as ${category}, no preview` : "Saved, no preview";
  return category ? `Saved as ${category}` : "Saved";
}

function when(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function Activity() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const recent = useRecentSaves(session.status === "ready");
  const items = recent.data ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={[type.title, { color: p.ink }]}>Activity</Text>
        <IconButton name="close" label="Close" onPress={() => router.back()} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={[styles.rule, { backgroundColor: p.border }]} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={[type.body, { color: p.ink }]}>{cardTitle(item)}</Text>
              <Text style={[type.label, { color: p.inkMuted }]}>{describe(item.status, item.category)}</Text>
            </View>
            <Text style={[type.label, { color: p.inkMuted }]}>{when(item.lastSavedAt)}</Text>
          </View>
        )}
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  rowText: { flex: 1, gap: 2 },
  rule: { height: StyleSheet.hairlineWidth },
  empty: { padding: space.lg },
});
