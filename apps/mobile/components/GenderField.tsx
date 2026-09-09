import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GENDERS } from "../lib/profile-fields";
import { useReducedMotion } from "../lib/motion";
import { usePalette } from "../lib/theme";
import { Icon } from "./Icon";

export function GenderField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const p = usePalette(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const label = GENDERS.find((g) => g.value === value)?.label;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Gender, ${label ?? "Select"}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={[styles.input, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.value, { color: label ? p.ink : p.inkMuted }]}>{label ?? "Select"}</Text><Icon name="down" size={17} color={p.inkMuted} />
    </Pressable>
    <Modal transparent visible={open} animationType={reduced ? "none" : "slide"} onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close gender selection" onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: p.surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.heading}><Text accessibilityRole="header" style={[styles.title, { color: p.ink }]}>Gender</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.close}><Icon name="close" color={p.inkMuted} /></Pressable></View>
          <ScrollView>{GENDERS.map((gender) => <Pressable key={gender.value} accessibilityRole="radio" accessibilityState={{ checked: gender.value === value }} onPress={() => { onChange(gender.value); setOpen(false); }} style={({ pressed }) => [styles.option, { backgroundColor: gender.value === value ? p.accentSoft : pressed ? p.surfaceAlt : "transparent" }]}>
            <Text style={[styles.value, { color: p.ink }]}>{gender.label}</Text>{value === gender.value && <Icon name="check" size={20} color={p.accent} />}
          </Pressable>)}</ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ input: { minHeight: 58, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, value: { fontSize: 16 }, overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }, sheet: { maxHeight: "80%", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, title: { fontSize: 23, fontWeight: "600" }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, padding: 16, borderRadius: 14, marginBottom: 4 } });
