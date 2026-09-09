import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { radius, space, type, usePalette } from "../lib/theme";

/** A group of rows drawn as one card, the way phone settings are usually laid out. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <View style={[styles.group, { backgroundColor: p.surface, borderColor: p.border }]}>{children}</View>;
}

export function SettingsRow({ icon, title, detail, onPress, right, toggle, danger = false, last = false }: {
  icon?: IconName;
  title: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  danger?: boolean;
  last?: boolean;
}) {
  const p = usePalette();
  const ink = danger ? p.bad : p.ink;

  const body = (
    <View style={[styles.row, !last && { borderBottomColor: p.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {icon && <Icon name={icon} size={20} color={danger ? p.bad : p.inkMuted} />}
      <View style={styles.text}>
        <Text style={[type.body, { color: ink }]}>{title}</Text>
        {detail && <Text style={[type.label, { color: p.inkMuted }]}>{detail}</Text>}
      </View>
      {toggle ? (
        <Switch accessibilityLabel={title} value={toggle.value} disabled={toggle.disabled ?? false} onValueChange={toggle.onChange} />
      ) : right ? (
        right
      ) : onPress ? (
        <Icon name="chevron" size={18} color={p.inkMuted} />
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});
