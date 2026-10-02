import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { font, radius, space, type, usePalette } from "../lib/theme";
import type { PlanStop } from "../lib/weave";

const SUGGESTED = "Suggested — not from your saves";

/**
 * One stop of a day: the save's own picture, its name, the facts in one quiet line (the crowd's
 * rating, and whether it is open that day — said in words, coloured only as well), why it is in
 * the plan, a tip, and a warning as a callout with its icon. A stop the plan suggested rather than
 * one of the person's saves has a dashed edge and says so in full. A save opens on a tap.
 */
export function StopCard({ stop, why, tip, warning, facts, closed, picture, onOpen }: {
  stop: PlanStop;
  why: string;
  tip: string | null;
  warning: string | null;
  /** "4.5 · 3,100 reviews · $$ · Hours unknown — check before you go" */
  facts: string | null;
  /** The place is closed on this day of the plan. */
  closed: boolean;
  picture?: string;
  onOpen?: () => void;
}) {
  const p = usePalette();
  const suggested = stop.source === "suggested";
  // The plan sometimes repeats the suggestion as its warning; the tag already says it.
  const callout = warning && !(suggested && warning.toLowerCase().startsWith("suggested")) ? warning : null;
  return (
    <Pressable
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityLabel={`${stop.name}${suggested ? `. ${SUGGESTED}` : ""}${facts ? `. ${facts}` : ""}. ${why}${tip ? ` Tip: ${tip}` : ""}${callout ? ` Note: ${callout}` : ""}`}
      accessibilityHint={onOpen ? "Opens the save" : undefined}
      disabled={!onOpen}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: suggested ? p.inkMuted : p.border }, suggested && styles.dashed, pressed && styles.pressed]}
    >
      {suggested && (
        <View style={[styles.tag, { borderColor: p.border, backgroundColor: p.surfaceAlt }]}>
          <Text style={[styles.tagText, { color: p.inkMuted }]}>{SUGGESTED}</Text>
        </View>
      )}
      <View style={styles.head}>
        <View style={[styles.thumb, { backgroundColor: p.accentSoft }]}>
          {picture ? <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors />
            : <Icon name={suggested ? "sparkles-outline" : "pin"} size={20} color={p.accent} />}
        </View>
        <View style={styles.title}>
          <Text style={[type.body, styles.name, { color: p.ink }]}>{stop.name}</Text>
          {facts ? <Text style={[type.label, { color: closed ? p.bad : p.inkMuted }]}>{facts}</Text> : null}
        </View>
        {onOpen ? <Icon name="chevron" size={16} color={p.inkMuted} /> : null}
      </View>
      <Text style={[type.body, { color: p.ink }]}>{why}</Text>
      {tip ? <Text style={[type.label, { color: p.inkMuted }]}>Tip: {tip}</Text> : null}
      {callout ? (
        <View style={[styles.callout, { backgroundColor: p.surfaceAlt }]}>
          <Icon name="warning-outline" size={16} color={p.warn} />
          <Text style={[type.label, styles.grow, { color: p.ink }]}>{callout}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  dashed: { borderStyle: "dashed", borderWidth: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  title: { flex: 1, gap: 2, alignItems: "flex-start" },
  name: { ...font("600") },
  tag: { alignSelf: "flex-start", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  tagText: { fontSize: 12, lineHeight: 16, ...font("600") },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.sm, borderRadius: radius.md },
  grow: { flex: 1 },
});
