import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { font, radius, space, type, usePalette } from "../lib/theme";

export interface JobStep { label: string; state: "done" | "active" | "todo"; detail?: string | null }

/**
 * A job the server is doing for the person, said as its steps: done with a tick, the one under way
 * with its own spinner and how long it has run, the rest still to come. Under them, the honest
 * range and what the person may do meanwhile; the job carries on whether or not they watch.
 */
export function JobCard({ steps, notes = [], actions = [] }: {
  steps: JobStep[];
  notes?: string[];
  actions?: { label: string; onPress: () => void }[];
}) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={styles.steps} accessibilityLiveRegion="polite">
        {steps.map((s) => (
          <View key={s.label} style={styles.step} accessible accessibilityLabel={`${s.label}${s.detail ? `, ${s.detail}` : ""}. ${s.state === "done" ? "Done" : s.state === "active" ? "Under way" : "To come"}.`}>
            <View style={styles.mark}>
              {s.state === "done" ? <Icon name="checkmark-circle" size={20} color={p.good} />
                : s.state === "active" ? <ActivityIndicator size="small" color={p.accent} />
                : <Icon name="ellipse-outline" size={18} color={p.inkMuted} />}
            </View>
            <View style={styles.words}>
              <Text style={[type.body, s.state === "active" && styles.strong, { color: s.state === "todo" ? p.inkMuted : p.ink }]}>{s.label}</Text>
              {s.detail ? <Text style={[type.label, { color: p.inkMuted }]}>{s.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
      {notes.map((n) => <Text key={n} style={[type.label, { color: p.inkMuted }]}>{n}</Text>)}
      {actions.map((a) => <Button key={a.label} label={a.label} variant="secondary" onPress={a.onPress} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  steps: { gap: space.md },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  mark: { width: 22, height: 22, alignItems: "center", justifyContent: "center", marginTop: 1 },
  words: { flex: 1, gap: 2 },
  strong: { ...font("600") },
});
