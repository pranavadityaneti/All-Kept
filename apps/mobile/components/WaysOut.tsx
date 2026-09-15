import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { describeEvent, icsFor, mapsUrl, placeLine, placeMapsUrl, type Place, type Venue } from "../lib/export";
import { space, usePalette } from "../lib/theme";

/**
 * The ways out of a save, as chips beside its facts: the venue opens Maps, the day hands an
 * event to Calendar through the share sheet, where the person sees exactly what is added. Only the
 * chips the save has; a save with neither shows nothing.
 */
export function WaysOut({ save, onOpened, onEditPlace }: {
  save: { id: string; title: string; summary: string | null; url: string | null; venue: Venue | null; place: Place | null; eventAt: string | null };
  onOpened: (what: "maps" | "google_maps" | "calendar") => void;
  /** Add the place when the post never said it; change it when the sorter got it wrong. */
  onEditPlace: () => void;
}) {
  const p = usePalette();
  const [googleMaps, setGoogleMaps] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios" || !save.venue) return;
    Linking.canOpenURL("comgooglemaps://").then(setGoogleMaps).catch(() => setGoogleMaps(false));
  }, [save.venue]);


  // The pin when the server has found it; a search for the words when it has not.
  const openMaps = async (app: "default" | "google") => {
    if (!save.venue) return;
    onOpened(app === "google" ? "google_maps" : "maps");
    const platform = Platform.OS === "android" ? "android" : "ios";
    const target = save.place ? placeMapsUrl(save.place, platform, app) : mapsUrl(save.venue, platform, app);
    await Linking.openURL(target).catch(() => undefined);
  };
  const toCalendar = async () => {
    if (!save.eventAt) return;
    onOpened("calendar");
    try {
      const uri = `${FileSystem.cacheDirectory ?? ""}allkept-${save.id}.ics`;
      await FileSystem.writeAsStringAsync(uri, icsFor({ ...save, eventAt: save.eventAt }, new Date()));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/calendar", UTI: "com.apple.ical.ics", dialogTitle: "Add to Calendar" });
    } catch {
      // The share sheet refused or the cache could not be written: nothing to add, nothing to break.
    }
  };

  return (
    <View style={styles.wrap}>
      {save.venue && (
        <Chip
          label={save.place ? placeLine(save.place) : `${save.venue.name}, ${save.venue.locality}`}
          leading={<Icon name="navigate" size={15} color={p.inkMuted} />}
          accessibilityLabel={`Open ${save.place?.name ?? save.venue.name} in Maps`}
          onPress={() => { void openMaps("default"); }}
        />
      )}
      {save.venue && googleMaps && (
        <Chip label="Google Maps" accessibilityLabel={`Open ${save.venue.name} in Google Maps`} onPress={() => { void openMaps("google"); }} />
      )}
      <Chip label={save.venue ? "Change place" : "+ Add place"} accessibilityLabel={save.venue ? "Change the place" : "Add the place"} onPress={onEditPlace} />
      {save.eventAt && (
        <Chip
          label={describeEvent(save.eventAt, new Date())}
          leading={<Icon name="calendar-outline" size={15} color={p.inkMuted} />}
          accessibilityLabel={`Add ${describeEvent(save.eventAt, new Date())} to Calendar`}
          onPress={() => { void toCalendar(); }}
        />
      )}
    </View>
  );
}

/** "Copy as text" and, for a moment, "Copied". */
export function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, () => setCopied(true)];
}

export const copyToClipboard = (text: string): Promise<boolean> => Clipboard.setStringAsync(text).then(() => true).catch(() => false);

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
