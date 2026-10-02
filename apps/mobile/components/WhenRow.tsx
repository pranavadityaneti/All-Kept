import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { loadDatePicker } from "../lib/date-picker";
import { dayDate, dayValue, describeDay, describeTime, timeDate, timeValue } from "../lib/when";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * A day or a time, picked on the phone's own picker rather than typed. The typed boxes opened the
 * iPhone's number pad, which has no "-" or ":", so a date could not be entered at all. Empty until
 * something is picked, and clearable, because a trip's dates are optional. On iPhone the picker
 * opens in place under the row, what it shows is kept as it moves, and Done keeps what it shows
 * even unmoved; Android asks in its own dialog.
 */
export function WhenRow({ label, mode, value, onChange, open, onOpen, opensAt, minimumDate, disabled = false }: {
  label: string;
  mode: "date" | "time";
  /** "YYYY-MM-DD" or "HH:MM"; null when nothing is picked. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** iPhone: whether the picker is open under this row. One is open at a time, so the screen holds it. */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Where the picker starts when nothing is picked yet. */
  opensAt: Date;
  minimumDate?: Date;
  disabled?: boolean;
}) {
  const p = usePalette();
  const now = new Date();
  const [draft, setDraft] = useState<Date>(opensAt);
  const [missing, setMissing] = useState(false);
  const toValue = (d: Date) => (mode === "date" ? dayValue(d) : timeValue(d));
  const shown = value === null ? null : mode === "date" ? describeDay(value, now) : describeTime(value);

  const start = () => {
    if (open) { onOpen(false); return; }
    const picker = loadDatePicker();
    if (!picker) { setMissing(true); return; }
    const from = value === null ? opensAt : mode === "date" ? dayDate(value) : timeDate(value, now);
    if (Platform.OS === "android") {
      picker.DateTimePickerAndroid.open({ value: from, mode, minimumDate, onChange: (e, picked) => {
        if (e.type === "set" && picked) onChange(toValue(picked));
      } });
      return;
    }
    setDraft(from);
    onOpen(true);
  };

  const picker = open ? loadDatePicker() : null;
  return (
    <View style={styles.wrap}>
      <Text style={[type.label, { color: p.inkMuted }]}>{label}</Text>
      <View style={[styles.box, { backgroundColor: p.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${shown ?? "not set"}`}
          accessibilityHint={mode === "date" ? "Opens a calendar" : "Opens a time picker"}
          accessibilityState={{ disabled, expanded: open }}
          disabled={disabled}
          onPress={start}
          style={styles.press}
        >
          <Text style={[type.body, styles.grow, { color: shown ? p.ink : p.inkMuted }]}>{shown ?? (mode === "date" ? "Pick a day" : "Pick a time")}</Text>
          {/* Says "this opens a picker" while there is nothing in it yet; once picked, the clear button takes the place. */}
          {value === null && <Icon name="down" size={16} color={p.inkMuted} />}
        </Pressable>
        {value !== null && (
          <IconButton name="close" label={`Clear ${label.toLowerCase()}`} size={32} tone="plain" disabled={disabled}
            onPress={() => { if (open) onOpen(false); onChange(null); }} />
        )}
      </View>
      {open && picker && (
        <View style={styles.panel}>
          <picker.default value={draft} mode={mode} display={mode === "date" ? "inline" : "spinner"} minimumDate={minimumDate} accentColor={p.accent}
            onChange={(_e, picked) => { if (picked) { setDraft(picked); onChange(toValue(picked)); } }} />
          <Button label="Done" variant="secondary" onPress={() => { onChange(toValue(draft)); onOpen(false); }} />
        </View>
      )}
      {missing && <Text style={[type.label, { color: p.inkMuted }]}>Update Allkept to pick {mode === "date" ? "a day" : "a time"} here.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  box: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingRight: space.xs, minHeight: 48 },
  press: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md },
  grow: { flex: 1 },
  panel: { gap: space.sm },
});
