import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * A place the person names for a save: the café and where it is, in their words. The server looks
 * it up on the spot — the same lookup the sorter's venues get — and the pin appears. When the post
 * never said the name, this is how the save gets one; when the sorter got it wrong, this is how it
 * is put right, and the person's words stand over the sorter's from then on.
 */
export function PlaceSheet({ visible, initial, busy, error, canClear, onFind, onClear, onClose }: {
  visible: boolean;
  initial: { name: string; locality: string } | null;
  busy: boolean;
  error: string | null;
  /** The person named this place earlier: it can be taken away, leaving the sorter's own, if any. */
  canClear: boolean;
  onFind: (venue: { name: string; locality: string }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [name, setName] = useState(initial?.name ?? "");
  const [locality, setLocality] = useState(initial?.locality ?? "");
  useEffect(() => { if (visible) { setName(initial?.name ?? ""); setLocality(initial?.locality ?? ""); } }, [visible, initial]);
  const ready = name.trim().length >= 2 && locality.trim().length >= 2;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={styles.bar}>
            <Text style={[type.section, { color: p.ink }]}>{initial ? "Change the place" : "Add the place"}</Text>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <Text style={[type.label, { color: p.inkMuted }]}>The name as the sign spells it, and the area or city. The map finds the rest.</Text>
          <TextInput
            accessibilityLabel="The place's name"
            value={name}
            onChangeText={setName}
            placeholder="Doppler Coffee"
            placeholderTextColor={p.inkMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            style={[styles.input, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
          />
          <TextInput
            accessibilityLabel="Where it is"
            value={locality}
            onChangeText={setLocality}
            placeholder="C-Scheme, Jaipur"
            placeholderTextColor={p.inkMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => { if (ready) onFind({ name: name.trim(), locality: locality.trim() }); }}
            style={[styles.input, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
          />
          <View style={styles.actions}>
            <View style={styles.button}><Button label="Find it" busy={busy} disabled={!ready} onPress={() => onFind({ name: name.trim(), locality: locality.trim() })} /></View>
            {canClear && <View style={styles.button}><Button label="Remove" variant="secondary" onPress={onClear} /></View>}
          </View>
          {error && <Text style={[type.label, { color: p.bad }]}>{error}</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8,6,18,0.38)" },
  panel: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  actions: { flexDirection: "row", gap: space.md },
  button: { flex: 1 },
});
