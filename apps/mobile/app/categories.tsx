import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { CategorySheet } from "../components/CategorySheet";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { TAB_BAR_CLEARANCE } from "../components/FloatingTabBar";
import { categoryIcon } from "../lib/category-icons";
import { useDeleteCategory, useCreateCategory, useEditCategory, useFacets, ownCategories } from "../lib/library";
import { useSession } from "../lib/session";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * The categories a person made, to add to, rename, or remove.
 *
 * Removing one is safe in a way worth saying out loud on the screen: the model's answer was never
 * overwritten, so every save inside goes back to the category Allkept first chose for it.
 */
export default function Categories() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const facets = useFacets(ready);
  const mine = ownCategories(facets.data);
  const names = mine.map((c) => c.value);

  const create = useCreateCategory(ready ? session.userId : null);
  const edit = useEditCategory();
  const remove = useDeleteCategory();

  const [sheet, setSheet] = useState<{ open: boolean; editing?: { name: string; icon: string } }>({ open: false });

  const confirmRemove = (name: string, count: number) => {
    Alert.alert(
      `Delete ${name}?`,
      count === 0
        ? "Nothing is filed under it."
        : count === 1
          ? "The save inside goes back to the category Allkept first chose for it. Nothing is deleted."
          : `The ${count} saves inside go back to the category Allkept first chose for each of them. Nothing is deleted.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => remove.mutate(name) },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Your categories</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[type.body, { color: p.inkMuted }]}>
          Categories you make are yours to file into. Allkept keeps sorting new saves into the ones it knows, and you can
          move any save into one of yours from the save itself.
        </Text>

        {mine.length === 0 ? (
          <Card>
            <Text style={[type.body, { color: p.inkMuted }]}>You have not made any yet.</Text>
          </Card>
        ) : (
          <View style={[styles.list, { backgroundColor: p.surface, borderColor: p.border }]}>
            {mine.map((c, i) => (
              <View key={c.value} style={[styles.row, i < mine.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.border }]}>
                <View style={[styles.mark, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}>
                  <Icon name={categoryIcon(c.icon)} size={20} color={p.accent} />
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[type.body, { color: p.ink }]}>{c.value}</Text>
                  <Text style={[type.label, { color: p.inkMuted }]}>{c.n} {c.n === 1 ? "save" : "saves"}</Text>
                </View>
                <IconButton name="edit" label={`Edit ${c.value}`} onPress={() => setSheet({ open: true, editing: { name: c.value, icon: categoryIcon(c.icon) } })} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${c.value}`}
                  onPress={() => confirmRemove(c.value, c.n)}
                  style={({ pressed }) => [styles.remove, { backgroundColor: p.surfaceAlt, borderColor: p.border }, pressed && styles.pressed]}
                >
                  <Icon name="trash" size={18} color={p.bad} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {(create.error ?? edit.error ?? remove.error) && (
          <Text accessibilityRole="alert" style={[type.label, { color: p.bad }]}>
            {(create.error ?? edit.error ?? remove.error)?.message}
          </Text>
        )}

        <Button label="New category" disabled={!ready} onPress={() => setSheet({ open: true })} />
      </ScrollView>

      <CategorySheet
        visible={sheet.open}
        initial={sheet.editing}
        existing={names}
        onClose={() => setSheet({ open: false })}
        onSubmit={async ({ name, icon }) => {
          try {
            if (sheet.editing) await edit.mutateAsync({ from: sheet.editing.name, name, icon });
            else await create.mutateAsync({ name, icon });
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not save the category.";
          }
        }}
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
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  rowText: { flex: 1, gap: 1 },
  mark: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  pressed: { opacity: 0.7 },
});
