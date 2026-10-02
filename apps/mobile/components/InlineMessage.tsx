import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { font, radius, space, type, usePalette } from "../lib/theme";

type Tone = "error" | "warning" | "info";
const GLYPH = { error: "alert-circle", warning: "warning", info: "information-circle" } as const;

/**
 * One way to say what needs saying on a screen — what went wrong, what to watch, what to know.
 * The tone's icon and colour say which, never the colour alone; the title says it in a line, in
 * ink; the detail, in muted ink, is the server's or the screen's own words; and the actions are
 * what can be done about it, the first the one that most likely fixes it.
 */
export function InlineMessage({ tone = "error", title, body, actions = [] }: {
  tone?: Tone;
  title: string;
  body?: string | null;
  actions?: { label: string; onPress: () => void; busy?: boolean }[];
}) {
  const p = usePalette();
  const color = tone === "error" ? p.bad : tone === "warning" ? p.warn : p.accent;
  return (
    <View accessibilityRole={tone === "info" ? undefined : "alert"} style={[styles.box, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={styles.head}>
        <Icon name={GLYPH[tone]} size={20} color={color} />
        <View style={styles.words}>
          <Text style={[type.body, styles.title, { color: p.ink }]}>{title}</Text>
          {body ? <Text style={[type.label, { color: p.inkMuted }]}>{body}</Text> : null}
        </View>
      </View>
      {actions.length > 0 && (
        // Stacked full width, so a label is never squeezed onto two lines beside another.
        <View style={styles.actions}>
          {actions.map((a, i) => <Button key={a.label} label={a.label} variant={i === 0 ? "primary" : "secondary"} busy={a.busy} onPress={a.onPress} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  words: { flex: 1, gap: space.xs },
  title: { ...font("600") },
  actions: { gap: space.sm },
});
