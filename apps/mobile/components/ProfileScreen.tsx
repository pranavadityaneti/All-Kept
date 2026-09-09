import type { PropsWithChildren } from "react";
import { StatusBar } from "expo-status-bar";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePalette } from "../lib/theme";
import { Icon } from "./Icon";

export function ProfileScreen({ children, title, onBack, light = false }: PropsWithChildren<{ title: string; onBack?: () => void; light?: boolean }>) {
  const p = usePalette(light ? "light" : undefined);
  return <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
    {light && <StatusBar style="dark" />}
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.page}>
        <View style={styles.heading}>{onBack && <Pressable accessibilityRole="button" accessibilityLabel="Back to Settings" onPress={onBack} style={styles.back}><Icon name="back" color={p.ink} /></Pressable>}<Text accessibilityRole="header" style={[styles.title, { color: p.ink }]}>{title}</Text></View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, page: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24, gap: 30, width: "100%", maxWidth: 520, alignSelf: "center" }, heading: { flexDirection: "row", alignItems: "center", gap: 10 }, title: { fontSize: 30, lineHeight: 37, fontWeight: "600", letterSpacing: -0.8 }, back: { minWidth: 44, minHeight: 44, justifyContent: "center" } });
