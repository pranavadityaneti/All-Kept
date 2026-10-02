import { NativeModules, Platform, UIManager } from "react-native";

export type DatePickerModule = typeof import("@react-native-community/datetimepicker");

/**
 * The date and time picker is a native module. JavaScript that reached a phone ahead of a build
 * carrying the module would crash asking for it, so its presence is checked first, and a phone
 * without it is told to update rather than shown nothing. The same check RemindMe makes.
 */
function available(): boolean {
  try {
    if (Platform.OS === "android") return !!NativeModules["RNDateTimePickerAndroid"];
    return !!UIManager.getViewManagerConfig?.("RNDateTimePicker");
  } catch {
    return false;
  }
}

export function loadDatePicker(): DatePickerModule | null {
  if (!available()) return null;
  try {
    return require("@react-native-community/datetimepicker") as DatePickerModule;
  } catch {
    return null;
  }
}
