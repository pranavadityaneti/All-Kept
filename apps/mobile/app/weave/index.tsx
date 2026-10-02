import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionBar } from "../../components/ActionBar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { TripList } from "../../components/TripList";
import { track } from "../../lib/metrics";
import { useSavePictures } from "../../lib/save-pictures";
import { useSession } from "../../lib/session";
import { radius, space, type, usePalette } from "../../lib/theme";
import { KIND_LABEL, percent, setNights, shiftMix, splitDays, tripsKey, useTrips, useWeave, useWeaveTowns, weaveKey, weavePlan, weaveStage, weaveUnderstand, WeaveRefused, type TripSummary, type WeaveProfile } from "../../lib/weave";

/** The profile a weave was read into, kept for Customise to start from. */
export const profileKey = (weaveId: string) => ["weave-profile", weaveId] as const;

/**
 * Plan a trip: the towns the saves name, the profile the saves add up to — edited in the open —
 * and a plan of seven or twelve days, or Customise for the brief. Nothing is planned until the
 * person has seen what their saves say and moved what they want moved. Reading and planning are
 * jobs (spec §11): the server answers at once, and this screen is drawn from the trip's row from
 * then on — its id is in the address the moment the read begins, so a trip left mid-read is picked
 * up where it is, by its id, rather than lost with the screen.
 */
export default function Weave() {
  const p = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const ready = session.status === "ready";
  const userId = ready && !session.anonymous ? session.userId : null;
  const params = useLocalSearchParams<{ weaveId?: string }>();
  const weaveId = typeof params.weaveId === "string" && params.weaveId ? params.weaveId : null;
  const towns = useWeaveTowns(ready && !weaveId);
  // Your trips: every trip asked for, so none is lost; a new one is planned from here.
  const trips = useTrips(ready && !weaveId);
  const pictures = useSavePictures((trips.data ?? []).map((t) => t.pictureId));
  const [choosing, setChoosing] = useState(false);
  const running = (trips.data ?? []).some((t) => t.status === "reading" || t.status === "planning");
  const [now, setNow] = useState(Date.now());
  // A running trip shows how long it has run; the clock only ticks while one does.
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  const record = useWeave(weaveId);
  const stage = weaveStage(record.data, Date.now());
  // Nothing is ticked to begin with: saves in a town are what a person kept there, not a journey
  // they have decided on, and the app does not decide it for them. They say where they are going.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The profile as the person has moved it, kept with the trip it belongs to: the row's own until
  // the first move, so another trip opened on this screen never shows this one's edits.
  const [draft, setDraft] = useState<{ weaveId: string; profile: WeaveProfile } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedSaves = towns.data?.towns.filter((t) => picked.has(t.name)).reduce((a, t) => a + t.saves, 0) ?? 0;

  const base = stage.kind === "profiled" ? stage.profile : record.data?.profile ?? null;
  const profile = draft && draft.weaveId === weaveId ? draft.profile : base;
  const edit = (next: WeaveProfile) => { if (weaveId) setDraft({ weaveId, profile: next }); };
  // A read counted once, when it is seen to finish here — not again each time the trip is reopened.
  const watched = useRef(false);
  const savesRead = stage.kind === "profiled" ? stage.saves : 0;
  useEffect(() => {
    if (stage.kind === "reading") watched.current = true;
    if (stage.kind === "profiled" && watched.current) { watched.current = false; track(userId, "weave_read", { saves: savesRead, towns: base?.towns.length ?? 0 }); }
  }, [stage.kind, savesRead, base, userId]);

  const refuse = (e: unknown) => {
    if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
    setError(e instanceof Error ? e.message : "Something went wrong.");
  };
  const read = async (names: string[]) => {
    if (names.length === 0) return;
    setBusy(true); setError(null);
    try {
      const started = await weaveUnderstand(names);
      watched.current = true;
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      // From here the trip lives on its row: its id goes in the address, so leaving loses nothing.
      router.setParams({ weaveId: started.weaveId });
    } catch (e) { refuse(e); } finally { setBusy(false); }
  };
  const make = async (days: number) => {
    if (!weaveId || !profile) return;
    setBusy(true); setError(null);
    try {
      // The server answers at once and weaves on; the plan screen is drawn from the row.
      await weavePlan(weaveId, profile, { days, nights: splitDays(days, profile.towns) });
      void queryClient.invalidateQueries({ queryKey: weaveKey(weaveId) });
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      track(userId, "weave_plan", { days });
      // Pushed, not replaced: Back from the plan comes back here, to the profile as it was.
      router.push({ pathname: "/weave/plan", params: { weaveId } });
    } catch (e) { refuse(e); } finally { setBusy(false); }
  };
  const customise = () => {
    if (!weaveId || !profile) return;
    queryClient.setQueryData(profileKey(weaveId), profile);
    router.push({ pathname: "/weave/customise", params: { weaveId } });
  };
  const startOver = () => { setError(null); setPicked(new Set()); setChoosing(true); router.setParams({ weaveId: "" }); };
  // A trip opens where it is: the read and the profile on this screen, the plan on its own.
  const openTrip = (t: TripSummary) => {
    const planStage = t.status === "planning" || t.status === "planned" || (t.status === "failed" && t.days !== null);
    router.push({ pathname: planStage ? "/weave/plan" : "/weave", params: { weaveId: t.id } });
  };
  const hub = !weaveId && !choosing && !busy && (trips.data?.length ?? 0) > 0;
  const picking = !weaveId && !hub && !(trips.isPending && !trips.isError && !choosing);

  const reading = busy && !weaveId ? true : stage.kind === "reading";
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        {/* Back from picking places for a new trip steps back to Your trips, one stage, not off the screen. */}
        <IconButton name="back" label="Back" onPress={() => { if (choosing && !weaveId && (trips.data?.length ?? 0) > 0) setChoosing(false); else router.back(); }} />
        <Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Plan a trip</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {!weaveId && trips.isPending && !trips.isError && !choosing && <View style={styles.centered}><ActivityIndicator color={p.accent} /></View>}
        {hub && (
          <>
            <View style={styles.intro}>
              <Text style={[type.section, { color: p.ink }]}>Your trips</Text>
              <Text style={[type.label, { color: p.inkMuted }]}>Plans you've asked for. Nothing is planned until you ask.</Text>
            </View>
            <TripList trips={trips.data ?? []} pictures={pictures} now={now} onOpen={openTrip} />
          </>
        )}
        {picking && !reading && (
          <>
            <Text style={[type.body, { color: p.inkMuted }]}>Where are you going? Tick the towns this trip is for.</Text>
            {towns.isPending ? <ActivityIndicator color={p.accent} /> : towns.data && towns.data.towns.length === 0 ? (
              <Card><Text style={[type.body, { color: p.inkMuted }]}>No saves name a place yet. Save a few reels of cafés, sights and hotels, and come back once they are on the map.</Text></Card>
            ) : (
              <View style={styles.wrap}>
                {towns.data?.towns.map((t) => (
                  <Chip key={t.name} label={`${t.name} ${t.saves}`} selected={picked.has(t.name)} onPress={() => setPicked((s) => { const next = new Set(s); if (next.has(t.name)) next.delete(t.name); else next.add(t.name); return next; })} accessibilityLabel={`${t.name}, ${t.saves} saves`} />
                ))}
              </View>
            )}
            <Button label="Read my saves" disabled={picked.size === 0} onPress={() => { void read([...picked]); }} />
            <Text style={[type.label, { color: p.inkMuted }]}>Allkept reads the posts you saved in these towns and says what they add up to. Nothing is planned until you've seen that.</Text>
          </>
        )}
        {weaveId && stage.kind === "loading" && !record.isError && <View style={styles.centered}><ActivityIndicator color={p.accent} /></View>}
        {weaveId && record.isError && (
          <Card>
            <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>Couldn't load this trip just now.</Text>
            <Button label="Try again" onPress={() => { void record.refetch(); }} />
          </Card>
        )}
        {reading && <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.inkMuted }]}>Reading your {pickedSaves > 0 ? `${pickedSaves} ` : ""}saves — usually a minute or two.</Text></View>}
        {weaveId && stage.kind === "missing" && (
          <Card>
            <Text style={[type.body, { color: p.ink }]}>This trip isn't there any more.</Text>
            <Button label="Plan a new trip" variant="secondary" onPress={startOver} />
          </Card>
        )}
        {weaveId && stage.kind === "failed" && stage.during === "read" && (
          <Card>
            <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{stage.message}</Text>
            {record.data?.towns?.length
              ? <Button label="Try again" busy={busy} onPress={() => { void read(record.data?.towns ?? []); }} />
              : <Button label="Plan a new trip" variant="secondary" onPress={startOver} />}
          </Card>
        )}
        {weaveId && profile && stage.kind !== "reading" && !(stage.kind === "failed" && stage.during === "read") && (
          <>
            <Card>
              <Text style={[type.heading, { color: p.ink }]}>What your saves say</Text>
              <Text style={[type.label, { color: p.inkMuted }]}>{stage.kind === "profiled" && stage.saves > 0 ? `${stage.saves} saves read. ` : ""}Move what you'd like more or less of.</Text>
              {profile.mix.map((m) => (
                <View key={m.kind} style={styles.row}>
                  <Text style={[type.body, styles.grow, { color: p.ink }]}>{KIND_LABEL[m.kind]} <Text style={{ color: p.inkMuted }}>{percent(m.share)}</Text></Text>
                  <IconButton name="minus" label={`Less ${KIND_LABEL[m.kind]}`} size={32} tone="plain" onPress={() => edit(shiftMix(profile, m.kind, "less"))} />
                  <IconButton name="plus" label={`More ${KIND_LABEL[m.kind]}`} size={32} tone="plain" onPress={() => edit(shiftMix(profile, m.kind, "more"))} />
                </View>
              ))}
              {profile.style ? <Text style={[type.label, { color: p.inkMuted }]}>Style: {profile.style}</Text> : null}
              {profile.must.length > 0 && <Text style={[type.label, { color: p.inkMuted }]}>{profile.must.length} {profile.must.length === 1 ? "save you clearly mean" : "saves you clearly mean"} — they'll be in.</Text>}
            </Card>
            <Card>
              <Text style={[type.heading, { color: p.ink }]}>Nights</Text>
              {profile.towns.map((t) => (
                <View key={t.name} style={styles.row}>
                  <Text style={[type.body, styles.grow, { color: p.ink }]}>{t.name} <Text style={{ color: p.inkMuted }}>{t.saves} saves · {t.nights} {t.nights === 1 ? "night" : "nights"}</Text></Text>
                  <IconButton name="minus" label={`Fewer nights in ${t.name}`} size={32} tone="plain" onPress={() => edit({ ...profile, towns: setNights(profile.towns.map((x) => ({ town: x.name, nights: x.nights })), t.name, -1).map((n, i) => ({ ...profile.towns[i]!, nights: n.nights })) })} />
                  <IconButton name="plus" label={`More nights in ${t.name}`} size={32} tone="plain" onPress={() => edit({ ...profile, towns: setNights(profile.towns.map((x) => ({ town: x.name, nights: x.nights })), t.name, 1).map((n, i) => ({ ...profile.towns[i]!, nights: n.nights })) })} />
                </View>
              ))}
              <Text style={[type.label, { color: p.inkMuted }]}>In proportion to what you saved. A 7- or 12-day plan splits its days the same way.</Text>
            </Card>
            <Button label="Make a 7-day plan" busy={busy} onPress={() => { void make(7); }} />
            <Button label="Make a 12-day plan" variant="secondary" disabled={busy} onPress={() => { void make(12); }} />
            <Button label="Customise…" variant="secondary" disabled={busy} onPress={customise} />
          </>
        )}
        {error && <View style={[styles.error, { backgroundColor: p.surface, borderColor: p.border }]}><Icon name="help" size={18} color={p.bad} /><Text accessibilityRole="alert" style={[type.body, styles.grow, { color: p.bad }]}>{error}</Text></View>}
      </ScrollView>
      {hub && <ActionBar><Button label="Plan a new trip" onPress={() => setChoosing(true)} /></ActionBar>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md },
  headerTitle: { flex: 1, textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  intro: { gap: space.xs },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  centered: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  grow: { flex: 1 },
  error: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
