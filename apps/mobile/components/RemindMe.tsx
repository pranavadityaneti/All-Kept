import { useState } from "react";
import { NativeModules, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { describeReminder, presetTimes, reminderPermission } from "../lib/reminders";
import { openSystemSettings } from "../lib/push";
import { space, type, usePalette } from "../lib/theme";

/**
 * The picker is a native module. The JavaScript can arrive on a phone by an over-the-air update
 * before the build that carries the module does, and asking for it then would crash the sheet; so
 * its presence is checked, and a phone without it is told to update rather than shown nothing.
 */
function pickerAvailable(): boolean {
  try {
    if (Platform.OS === "android") return !!NativeModules["RNDateTimePickerAndroid"];
    return !!UIManager.getViewManagerConfig?.("RNDateTimePicker");
  } catch {
    return false;
  }
}

type PickerModule = typeof import("@react-native-community/datetimepicker");
function loadPicker(): PickerModule | null {
  if (!pickerAvailable()) return null;
  try {
    return require("@react-native-community/datetimepicker") as PickerModule;
  } catch {
    return null;
  }
}

/**
 * Remind me: four times people mean when they say "later", and a picker for any other. The time
 * is written to the save first; the notification on this phone follows. Asked for the OS's leave
 * the first time, which is the moment it makes sense, and told plainly when it is refused.
 */
export function RemindMe({ remindAt, onSet, onClear, busy }: {
  remindAt: string | null;
  onSet: (at: number) => void;
  onClear: () => void;
  busy: boolean;
}) {
  const p = usePalette();
  const now = new Date();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const pending = remindAt && Date.parse(remindAt) > now.getTime() ? Date.parse(remindAt) : null;

  const set = async (at: number) => {
    if ((await reminderPermission()) === "denied") { setRefused(true); return; }
    setRefused(false);
    setPicking(false);
    onSet(at);
  };

  const openPicker = () => {
    const picker = loadPicker();
    if (!picker) { setNeedsUpdate(true); return; }
    if (Platform.OS === "android") {
      // Android asks in two steps, a day then a time, each its own dialog.
      const start = new Date(pending ?? presetTimes(now)[0]!.at);
      picker.DateTimePickerAndroid.open({ value: start, mode: "date", minimumDate: now, onChange: (e, day) => {
        if (e.type !== "set" || !day) return;
        picker.DateTimePickerAndroid.open({ value: start, mode: "time", onChange: (e2, time) => {
          if (e2.type !== "set" || !time) return;
          void set(new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes()).getTime());
        } });
      } });
      return;
    }
    setPicked(pending ?? presetTimes(now)[0]!.at);
    setPicking(true);
  };

  const picker = picking ? loadPicker() : null;

  return (
    <View style={styles.body}>
      {pending ? (
        <View style={styles.row}>
          <Text style={[type.body, { color: p.ink }]}>{describeReminder(pending, now)}</Text>
          <View style={styles.actions}>
            <Chip label="Change" onPress={openPicker} />
            <Chip label="Clear" onPress={onClear} />
          </View>
        </View>
      ) : (
        <View style={styles.wrap}>
          {presetTimes(now).map((preset) => <Chip key={preset.label} label={preset.label} onPress={() => { void set(preset.at); }} />)}
          <Chip label="Pick a time…" onPress={openPicker} />
        </View>
      )}
      {picking && picker && picked !== null && (
        <View style={styles.picker}>
          <picker.default
            value={new Date(picked)}
            mode="datetime"
            display="inline"
            minimumDate={now}
            onChange={(_e, date) => { if (date) setPicked(date.getTime()); }}
            accentColor={p.accent}
          />
          <View style={styles.actions}>
            <Button label={`Remind me ${describeReminder(picked, now)}`} busy={busy} onPress={() => { void set(picked); }} />
            <Button label="Cancel" variant="secondary" onPress={() => setPicking(false)} />
          </View>
        </View>
      )}
      {refused && (
        <View style={styles.note}>
          <Text style={[type.label, { color: p.inkMuted }]}>Turn on notifications for Allkept in Settings to be reminded.</Text>
          <Chip label="Open Settings" onPress={openSystemSettings} />
        </View>
      )}
      {needsUpdate && <Text style={[type.label, { color: p.inkMuted }]}>Update Allkept to pick a time of your own; the four above work now.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  picker: { gap: space.sm },
  note: { gap: space.sm, alignItems: "flex-start" },
});
