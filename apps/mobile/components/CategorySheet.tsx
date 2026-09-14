import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { tint } from "../lib/categories";
import { CategoryMark } from "./CategoryMark";
import { DEFAULT_MARK, PICKER_MARKS, categoryPalette, markFor, type MarkKey } from "../lib/category-marks";
import { MAX_NAME, checkCategoryName, nameProblemMessage } from "../lib/user-categories";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * Naming a category and choosing its mark — for a new one, or for changing one that exists.
 *
 * The same rules the table enforces are checked here as the person types, so the reason a name
 * cannot be used is on screen before they press anything rather than arriving as a database error.
 */
export function CategorySheet({ visible, initial, existing, onClose, onSubmit }: {
  visible: boolean;
  /** Absent for a new category; present when changing one, and excluded from the taken names. */
  initial?: { name: string; icon: string };
  /** The names this person already has, so a duplicate is refused before it is sent. */
  existing: readonly string[];
  onClose: () => void;
  /** Resolves to a message when the database refused it, or null when it went through. */
  onSubmit: (value: { name: string; icon: MarkKey }) => Promise<string | null>;
}) {
  const p = usePalette();
  const editing = !!initial;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<MarkKey>(DEFAULT_MARK);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset every time it opens, so a name abandoned last time is not waiting in the field.
  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? "");
    setIcon(markFor(initial?.icon));
    setFailure(null);
    setBusy(false);
  }, [visible, initial?.name, initial?.icon]);

  const others = editing ? existing.filter((n) => n !== initial?.name) : existing;
  const checked = checkCategoryName(name, others);
  const problem = "problem" in checked ? checked.problem : null;
  // Silent until they have typed something: telling somebody their empty field is empty is noise.
  const shown = failure ?? (name.trim() && problem ? nameProblemMessage(problem) : null);

  const submit = async () => {
    if (!("name" in checked) || busy) return;
    setBusy(true);
    setFailure(null);
    const message = await onSubmit({ name: checked.name, icon });
    setBusy(false);
    if (message) setFailure(message);
    else onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={styles.bar}>
            <Text style={[type.heading, { color: p.ink }]}>{editing ? "Edit category" : "New category"}</Text>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>

          <TextInput
            accessibilityLabel="Category name"
            value={name}
            onChangeText={(value) => { setName(value); setFailure(null); }}
            editable={!busy}
            autoFocus
            maxLength={MAX_NAME}
            placeholder="Wedding, Recipes to try…"
            placeholderTextColor={p.inkMuted}
            style={[type.body, styles.field, { color: p.ink, backgroundColor: p.surfaceAlt, borderColor: p.border }]}
          />
          {shown && <Text accessibilityRole="alert" style={[type.label, { color: p.bad }]}>{shown}</Text>}

          <Text style={[type.label, { color: p.inkMuted }]}>Pick a mark</Text>
          <ScrollView style={styles.marks} contentContainerStyle={styles.marksInner} keyboardShouldPersistTaps="handled">
            {PICKER_MARKS.map((option) => {
              const on = option === icon;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={option.replace(/_/g, " ")}
                  onPress={() => setIcon(option)}
                  style={({ pressed }) => [
                    styles.mark,
                    { backgroundColor: on ? tint(p.accent, 0.14) : p.surfaceAlt, borderColor: on ? p.accent : p.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <CategoryMark mark={option} palette={categoryPalette(name)} size={30} />
                </Pressable>
              );
            })}
          </ScrollView>

          <Button
            label={editing ? "Save changes" : "Create category"}
            busy={busy}
            disabled={!("name" in checked)}
            onPress={() => { void submit(); }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  // Spelled out rather than spread from StyleSheet.absoluteFill, which is a registered style id —
  // a number — so spreading it yields an empty object and a backdrop with no size at all.
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8,6,18,0.38)" },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  field: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md },
  // Tall enough for two rows of marks, and scrolls for the rest rather than pushing the button off.
  marks: { flexGrow: 0, maxHeight: 128 },
  marksInner: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  mark: {
    width: 52, height: 52, alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md,
  },
  pressed: { opacity: 0.7 },
});
