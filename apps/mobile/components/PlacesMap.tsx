import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Filters } from "../lib/filter-groups";
import { placeLine } from "../lib/export";
import { hoursLine } from "../lib/hours";
import { cameraFor, usePlacedSaves, type PlacedSave } from "../lib/places";
import { font, radius, space, type, usePalette } from "../lib/theme";
import { useThumbnails } from "../lib/thumbnails";
import { Card } from "./Card";
import { Icon } from "./Icon";

/**
 * The maps module, asked for on first use rather than at import: expo-maps requires its native
 * side the moment it is imported, and a build without it — a development client made before the
 * module was added — must show the words below, not go dark on the library screen.
 */
type MapsModule = typeof import("expo-maps");
let maps: MapsModule | null | undefined;
function mapsModule(): MapsModule | null {
  if (maps === undefined) {
    try { maps = require("expo-maps") as MapsModule; } catch { maps = null; }
  }
  return maps;
}

/** Apple's map needs iOS 17; older phones, and a build without the module, are given words instead of a blank. */
const mapAvailable = (): boolean => mapsModule() !== null && (Platform.OS === "android" || (Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 17));

/**
 * Every save with a place, as pins on one map, under the library's own filters. A tap on a pin
 * brings up the save's card at the bottom — its picture, its title, where it is and whether it is
 * open now — and a tap on the card opens the save. The map starts framing all of them.
 */
export function PlacesMap({ filters, enabled, onOpen }: { filters: Filters; enabled: boolean; onOpen: (id: string) => void }) {
  const p = usePalette();
  const { width } = useWindowDimensions();
  const placed = usePlacedSaves(filters, enabled);
  const saves = placed.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = saves.find((s) => s.id === selectedId) ?? null;
  const thumbnails = useThumbnails(selected ? [selected.thumbnailPath] : []);
  // Framed once per set of pins, not on every render — a camera that follows the data would fight the person's own panning.
  const camera = useMemo(() => cameraFor(saves.map((s) => s.place), width), [saves, width]);
  const markers = useMemo(() => saves.map((s) => ({ id: s.id, coordinates: { latitude: s.place.lat, longitude: s.place.lng }, title: s.place.name })), [saves]);

  const m = mapsModule();
  if (!m || !mapAvailable()) {
    return (
      <View style={styles.empty}>
        <Card>
          <Text style={[type.heading, { color: p.ink }]}>{m ? "The map needs iOS 17" : "The map needs a newer build of Allkept"}</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>Your saved places are still in the list, each with a way to open it in Maps.</Text>
        </Card>
      </View>
    );
  }

  if (placed.isSuccess && saves.length === 0) {
    return (
      <View style={styles.empty}>
        <Card>
          <Text style={[type.heading, { color: p.ink }]}>No places on the map yet</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>
            A save that names a café, a shop, a hotel or a viewpoint lands here once it is found on a map. You can add the place yourself from a save's details.
          </Text>
        </Card>
      </View>
    );
  }

  const onMarkerClick = (marker: { id?: string }) => { if (marker.id) setSelectedId(marker.id); };
  return (
    <View style={styles.fill}>
      {Platform.OS === "ios" ? (
        <m.AppleMaps.View style={styles.fill} cameraPosition={camera} markers={markers} onMarkerClick={onMarkerClick} onMapClick={() => setSelectedId(null)} uiSettings={{ myLocationButtonEnabled: false, compassEnabled: true }} />
      ) : (
        <m.GoogleMaps.View style={styles.fill} cameraPosition={camera} markers={markers} onMarkerClick={onMarkerClick} onMapClick={() => setSelectedId(null)} uiSettings={{ myLocationButtonEnabled: false }} />
      )}
      {selected && <PlaceCard save={selected} thumbnail={selected.thumbnailPath ? thumbnails[selected.thumbnailPath] : undefined} onPress={() => onOpen(selected.id)} />}
    </View>
  );
}

/** The save under the pin: picture, title, where, and whether it is open now. */
function PlaceCard({ save, thumbnail, onPress }: { save: PlacedSave; thumbnail?: string; onPress: () => void }) {
  const p = usePalette();
  const hours = hoursLine(save.place.periods, save.place.utcOffsetMinutes, new Date());
  const title = save.title?.trim() || save.text?.trim().split("\n")[0] || save.place.name;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${placeLine(save.place)}${hours ? `, ${hours}` : ""}`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: p.border }, pressed && styles.pressed]}>
      <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
        {thumbnail ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors /> : <Icon name="pin" size={20} color={p.inkMuted} />}
      </View>
      <View style={styles.cardText}>
        <Text numberOfLines={1} style={[type.body, styles.cardTitle, { color: p.ink }]}>{title}</Text>
        <Text numberOfLines={2} style={[type.label, { color: p.inkMuted }]}>{placeLine(save.place)}</Text>
        {hours && <Text numberOfLines={1} style={[type.label, { color: hours.startsWith("Open") ? p.good : p.inkMuted }]}>{hours}</Text>}
      </View>
      <Icon name="chevron" size={18} color={p.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { padding: space.lg },
  card: {
    position: "absolute", left: space.lg, right: space.lg, bottom: space.lg,
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: 56, height: 56, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...font("600") },
});
