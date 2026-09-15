import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Filters } from "../lib/filter-groups";
import { placeLine } from "../lib/export";
import { distanceKm, distanceWord } from "../lib/geo";
import { hoursLine } from "../lib/hours";
import { useHere } from "../lib/location";
import { cameraFor, usePlacedSaves, type PlacedSave } from "../lib/places";
import { font, radius, space, type, usePalette } from "../lib/theme";
import { useThumbnails } from "../lib/thumbnails";
import { googleDirectionsUrl, itineraryText, tripsFrom, type Trip, type TripStop } from "../lib/trips";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { TAB_BAR_CLEARANCE } from "./FloatingTabBar";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

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

/** Close enough to walk: the zoom "Near me" comes in at. */
const NEAR_ZOOM = 13;

const stopOf = (s: PlacedSave): TripStop => ({ id: s.id, title: s.title?.trim() || s.text?.trim().split("\n")[0] || s.place.name, url: null, lastSavedAt: s.lastSavedAt, place: s.place });

/**
 * Every save with a place, as pins on one map, under the library's own filters. A tap on a pin
 * brings up the save's card at the bottom — its picture, its title, where it is, how far, and
 * whether it is open now — and a tap on the card opens the save. Above the map, the trips: the
 * places gathered by town; a town's chip frames its places and offers the way out — every stop as
 * one route in Google Maps, or an itinerary to send. "Near me" asks for the phone's location, with
 * the reason in hand, and comes in on it.
 */
export function PlacesMap({ filters, enabled, onOpen, onWayOut }: {
  filters: Filters; enabled: boolean; onOpen: (id: string) => void;
  onWayOut?: (what: "trip_route" | "trip_share" | "near_me") => void;
}) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const placed = usePlacedSaves(filters, enabled);
  const saves = placed.data ?? [];
  const { here, ask } = useHere();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const selected = saves.find((s) => s.id === selectedId) ?? null;
  const thumbnails = useThumbnails(selected ? [selected.thumbnailPath] : []);
  const trips = useMemo(() => tripsFrom(saves.map(stopOf)), [saves]);
  const view = useMemo(() => ({ width, height, platform: Platform.OS === "android" ? "android" as const : "ios" as const }), [width, height]);
  // Framed once per set of pins, not on every render — a camera that follows the data would fight the person's own panning.
  const camera = useMemo(() => cameraFor(saves.map((s) => s.place), view), [saves, view]);
  const markers = useMemo(() => saves.map((s) => ({ id: s.id, coordinates: { latitude: s.place.lat, longitude: s.place.lng }, title: s.place.name })), [saves]);
  // The map mounts before the pins have arrived, and a camera given as a prop is read once, at
  // mount; when the pins land the map is asked to move, so it frames them rather than the world.
  const appleRef = useRef<import("expo-maps/build/apple/AppleMaps.types").AppleMapsViewType | null>(null);
  const googleRef = useRef<import("expo-maps/build/google/GoogleMaps.types").GoogleMapsViewType | null>(null);
  const moveTo = (to: { coordinates: { latitude: number; longitude: number }; zoom: number }) => { appleRef.current?.setCameraPosition(to); googleRef.current?.setCameraPosition(to); };
  useEffect(() => { if (saves.length > 0) moveTo(camera); }, [camera, saves.length]);
  // "Near me" was tapped: once the phone knows where it is, the map comes in on it.
  const wantsNear = useRef(false);
  useEffect(() => {
    if (here.status === "granted" && here.coords && wantsNear.current) {
      wantsNear.current = false;
      moveTo({ coordinates: { latitude: here.coords.lat, longitude: here.coords.lng }, zoom: NEAR_ZOOM });
    }
  }, [here]);

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

  const onMarkerClick = (marker: { id?: string }) => { if (marker.id) { setSelectedId(marker.id); setTrip(null); } };
  const pickTrip = (t: Trip) => {
    setSelectedId(null);
    setTrip(t);
    moveTo(cameraFor(t.stops.map((s) => s.place), view));
  };
  const nearMe = async () => {
    onWayOut?.("near_me");
    await ask();
  };
  const located = here.status === "granted" && !!here.coords;
  const mapProps = {
    style: styles.fill, cameraPosition: camera, markers, onMarkerClick, onMapClick: () => { setSelectedId(null); setTrip(null); },
    properties: { isMyLocationEnabled: located },
  };

  return (
    <View style={styles.fill}>
      {trips.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trips} contentContainerStyle={styles.tripsInner}>
          {trips.map((t) => <Chip key={t.town} label={`${t.town} ${t.stops.length}`} selected={trip?.town === t.town} onPress={() => pickTrip(t)} accessibilityLabel={`${t.town}, ${t.stops.length} ${t.stops.length === 1 ? "place" : "places"}`} />)}
        </ScrollView>
      )}
      <View style={styles.fill}>
        {Platform.OS === "ios"
          ? <m.AppleMaps.View ref={appleRef} {...mapProps} uiSettings={{ myLocationButtonEnabled: false, compassEnabled: true }} />
          : <m.GoogleMaps.View ref={googleRef} {...mapProps} uiSettings={{ myLocationButtonEnabled: false }} />}
        {here.status !== "unavailable" && (
          <View style={styles.nearMe}>
            <IconButton name="locate" label={located ? "Come in on where I am" : "Near me"} tone={located ? "accent" : "surface"} onPress={() => { wantsNear.current = true; if (located) moveTo({ coordinates: { latitude: here.coords!.lat, longitude: here.coords!.lng }, zoom: NEAR_ZOOM }); else void nearMe(); }} />
          </View>
        )}
        {here.status === "denied" && (
          <View style={styles.denied}><Text style={[type.label, { color: p.inkMuted }]}>Location is off for Allkept — turn it on in Settings to see what is near.</Text></View>
        )}
        {selected && <PlaceCard save={selected} here={here.coords} thumbnail={selected.thumbnailPath ? thumbnails[selected.thumbnailPath] : undefined} onPress={() => onOpen(selected.id)} />}
        {trip && !selected && <TripBar trip={trip} onClose={() => setTrip(null)} onWayOut={onWayOut} />}
      </View>
    </View>
  );
}

/** The save under the pin: picture, title, where, how far, and whether it is open now. */
function PlaceCard({ save, here, thumbnail, onPress }: { save: PlacedSave; here: { lat: number; lng: number } | null; thumbnail?: string; onPress: () => void }) {
  const p = usePalette();
  const hours = hoursLine(save.place.periods, save.place.utcOffsetMinutes, new Date());
  const away = here ? `${distanceWord(distanceKm(here, save.place))} away` : null;
  const title = save.title?.trim() || save.text?.trim().split("\n")[0] || save.place.name;
  const facts = [away, hours].filter((f): f is string => !!f).join(" · ");
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${placeLine(save.place)}${facts ? `, ${facts}` : ""}`} onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: p.border }, pressed && styles.pressed]}>
      <View style={[styles.thumb, { backgroundColor: p.surfaceAlt }]}>
        {thumbnail ? <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} accessibilityIgnoresInvertColors /> : <Icon name="pin" size={20} color={p.inkMuted} />}
      </View>
      <View style={styles.cardText}>
        <Text numberOfLines={1} style={[type.body, styles.cardTitle, { color: p.ink }]}>{title}</Text>
        <Text numberOfLines={2} style={[type.label, { color: p.inkMuted }]}>{placeLine(save.place)}</Text>
        {facts ? <Text numberOfLines={1} style={[type.label, { color: hours?.startsWith("Open") ? p.good : p.inkMuted }]}>{facts}</Text> : null}
      </View>
      <Icon name="chevron" size={18} color={p.inkMuted} />
    </Pressable>
  );
}

/** A town's places, and the two ways out: every stop as one route in Google Maps, or the itinerary sent as text. */
function TripBar({ trip, onClose, onWayOut }: { trip: Trip; onClose: () => void; onWayOut?: (what: "trip_route" | "trip_share") => void }) {
  const p = usePalette();
  const route = googleDirectionsUrl(trip.stops);
  const share = async () => {
    onWayOut?.("trip_share");
    await Share.share({ message: itineraryText(trip.town, trip.stops, new Date()) }).catch(() => undefined);
  };
  return (
    <View style={[styles.card, styles.tripBar, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={styles.tripHead}>
        <Text style={[type.body, styles.cardTitle, { color: p.ink }]}>{trip.town} · {trip.stops.length} {trip.stops.length === 1 ? "place" : "places"}</Text>
        <IconButton name="close" label="Close" size={32} tone="plain" onPress={onClose} />
      </View>
      <Text numberOfLines={2} style={[type.label, { color: p.inkMuted }]}>{trip.stops.map((s) => s.place.name).join(" · ")}</Text>
      <View style={styles.tripActions}>
        {route && <Button label="Open all in Google Maps" onPress={() => { onWayOut?.("trip_route"); void Linking.openURL(route).catch(() => undefined); }} />}
        <Button label="Share itinerary" variant="secondary" onPress={() => { void share(); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { padding: space.lg },
  trips: { flexGrow: 0 },
  tripsInner: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  nearMe: { position: "absolute", top: space.md, right: space.lg },
  denied: { position: "absolute", top: space.md + 48, left: space.lg, right: space.lg + 48 },
  // Above the floating tab bar, which would otherwise cover the place and its hours.
  card: {
    position: "absolute", left: space.lg, right: space.lg, bottom: TAB_BAR_CLEARANCE,
    flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  tripBar: { flexDirection: "column", alignItems: "stretch", gap: space.sm },
  tripHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tripActions: { gap: space.sm, marginTop: space.xs },
  pressed: { opacity: 0.85 },
  thumb: { width: 56, height: 56, borderRadius: radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...font("600") },
});
