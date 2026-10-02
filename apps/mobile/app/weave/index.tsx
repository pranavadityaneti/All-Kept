import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionBar } from "../../components/ActionBar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { InlineMessage } from "../../components/InlineMessage";
import { JobCard } from "../../components/JobCard";
import { TripList } from "../../components/TripList";
import { track } from "../../lib/metrics";
import { useSavePictures } from "../../lib/save-pictures";
import { useSession } from "../../lib/session";
import { font, space, type, usePalette } from "../../lib/theme";
import { foldPlaces, KIND_LABEL, markPlanAsked, percent, pickSummary, runningFor, setNights, shiftMix, splitDays, tooManyPlaces, tripsKey, tripTitle, useTrips, useWeave, useWeaveTowns, weaveKey, weavePlan, weaveStage, weaveUnderstand, WeaveRefused, type TripSummary, type WeaveProfile, type WeaveTowns } from "../../lib/weave";

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
  const record = useWeave(weaveId);
  const stage = weaveStage(record.data, Date.now());
  const [now, setNow] = useState(Date.now());
  // Nothing is ticked to begin with: saves in a town are what a person kept there, not a journey
  // they have decided on, and the app does not decide it for them. They say where they are going.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The profile as the person has moved it, kept with the trip it belongs to: the row's own until
  // the first move, so another trip opened on this screen never shows this one's edits.
  const [draft, setDraft] = useState<{ weaveId: string; profile: WeaveProfile } | null>(null);
  const [busy, setBusy] = useState(false);
  // What failed, in its own words, with the one thing that most likely fixes it: the same step again.
  const [error, setError] = useState<{ title: string; message: string; retry: () => void } | null>(null);
  const places = towns.data?.towns ?? [];
  const folded = foldPlaces(places);
  const summary = pickSummary(places, picked);
  const tooMany = tooManyPlaces(picked.size);
  // Places with a single save wait under "More places"; opened by the person, and never hiding one they picked.
  const [showMore, setShowMore] = useState(false);
  const pickedInMore = folded.more.filter((t) => picked.has(t.name)).length;
  // How many saves a read began with, when this screen began it; a trip reopened later doesn't know.
  const [readingCount, setReadingCount] = useState<number | null>(null);
  // A running job shows how long it has run; the clock only ticks while one does.
  const ticking = running || stage.kind === "reading";
  useEffect(() => { if (!ticking) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [ticking]);
  const toggle = (name: string) => setPicked((s) => { const next = new Set(s); if (next.has(name)) next.delete(name); else next.add(name); return next; });

  const base = stage.kind === "profiled" ? stage.profile : record.data?.profile ?? null;
  const profile = draft && draft.weaveId === weaveId ? draft.profile : base;
  const edit = (next: WeaveProfile) => { if (weaveId) setDraft({ weaveId, profile: next }); };
  // A read counted once, when it is seen to finish here — not again each time the trip is reopened.
  const watched = useRef(false);
  const savesRead = stage.kind === "profiled" ? stage.saves : 0;
  useEffect(() => {
    if (stage.kind === "reading") watched.current = true;
    if (stage.kind === "profiled" && watched.current) {
      watched.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      track(userId, "weave_read", { saves: savesRead, towns: base?.towns.length ?? 0 });
    }
  }, [stage.kind, savesRead, base, userId]);

  const refuse = (e: unknown, title: string, retry: () => void) => {
    if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
    setError({ title, message: e instanceof Error ? e.message : "Something went wrong.", retry });
  };
  const read = async (names: string[], count: number | null) => {
    if (names.length === 0) return;
    setBusy(true); setError(null); setReadingCount(count);
    try {
      const started = await weaveUnderstand(names);
      watched.current = true;
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      // From here the trip lives on its row: its id goes in the address, so leaving loses nothing.
      router.setParams({ weaveId: started.weaveId });
    } catch (e) { refuse(e, "Couldn't start reading your saves", () => { void read(names, count); }); } finally { setBusy(false); }
  };
  const make = async (days: number) => {
    if (!weaveId || !profile) return;
    setBusy(true); setError(null);
    try {
      // The server answers at once and weaves on; the plan screen is drawn from the row.
      await weavePlan(weaveId, profile, { days, nights: splitDays(days, profile.towns) });
      markPlanAsked(weaveId);
      void queryClient.invalidateQueries({ queryKey: weaveKey(weaveId) });
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      track(userId, "weave_plan", { days });
      // Pushed, not replaced: Back from the plan comes back here, to the profile as it was.
      router.push({ pathname: "/weave/plan", params: { weaveId } });
    } catch (e) { refuse(e, "Couldn't start the plan", () => { void make(days); }); } finally { setBusy(false); }
  };
  const customise = () => {
    if (!weaveId || !profile) return;
    queryClient.setQueryData(profileKey(weaveId), profile);
    router.push({ pathname: "/weave/customise", params: { weaveId } });
  };
  // The read carries on without the screen; Your trips shows it, and it opens from there.
  const later = () => { setChoosing(false); void queryClient.invalidateQueries({ queryKey: tripsKey }); router.setParams({ weaveId: "" }); };
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
        <Text numberOfLines={1} style={[type.heading, styles.headerTitle, { color: p.ink }]}>{weaveId && record.data ? tripTitle(record.data.towns) : "Plan a trip"}</Text>
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
            <View style={styles.intro}>
              <Text style={[type.section, { color: p.ink }]}>Where is this trip?</Text>
              <Text style={[type.label, { color: p.inkMuted }]}>Pick the places. Allkept reads what you saved there first — nothing is planned until you say so.</Text>
            </View>
            {towns.isPending ? <ActivityIndicator color={p.accent} /> : towns.isError ? (
              <InlineMessage title="Couldn't load your places just now" body={towns.error.message} actions={[{ label: "Try again", onPress: () => { void towns.refetch(); } }]} />
            ) : places.length === 0 ? (
              <InlineMessage tone="info" title="No saves name a place yet" body="Save a few reels of cafés, sights and hotels, and come back once they're on the map." />
            ) : (
              <>
                <View style={styles.groupHead}>
                  <Text style={[type.label, styles.overline, { color: p.inkMuted }]}>YOUR PLACES</Text>
                  <Text style={[type.label, { color: p.inkMuted }]}>numbers are your saves</Text>
                </View>
                <View style={styles.wrap}>{folded.main.map((t) => <PlaceChip key={t.name} place={t} on={picked.has(t.name)} onPress={() => toggle(t.name)} />)}</View>
                {folded.more.length > 0 && (
                  <>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMore }} onPress={() => setShowMore((v) => !v)} style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}>
                      <Text style={[type.body, { color: p.ink }]}>More places ({folded.more.length}){pickedInMore > 0 ? <Text style={{ color: p.accent }}> · {pickedInMore} picked</Text> : null}</Text>
                      <Icon name="down" size={16} color={p.inkMuted} style={showMore ? styles.flip : undefined} />
                    </Pressable>
                    {showMore && <View style={styles.wrap}>{folded.more.map((t) => <PlaceChip key={t.name} place={t} on={picked.has(t.name)} onPress={() => toggle(t.name)} />)}</View>}
                  </>
                )}
                {tooMany && <InlineMessage tone={tooMany.blocking ? "error" : "warning"} title={tooMany.text} />}
              </>
            )}
          </>
        )}
        {weaveId && stage.kind === "loading" && !record.isError && <View style={styles.centered}><ActivityIndicator color={p.accent} /></View>}
        {weaveId && record.isError && (
          <InlineMessage title="Couldn't load this trip just now" actions={[{ label: "Try again", onPress: () => { void record.refetch(); } }]} />
        )}
        {reading && (() => {
          const where = tripTitle(record.data?.towns ?? [...picked]);
          const ran = stage.kind === "reading" ? now - stage.since : null;
          return (
            <JobCard
              steps={[
                { label: readingCount ? `Found ${readingCount} ${readingCount === 1 ? "save" : "saves"} in ${where}` : `Found your saves in ${where}`, state: "done" },
                { label: "Reading what they add up to", state: "active", detail: ran === null ? "Starting…" : `${runningFor(ran)} · usually about a minute, sometimes up to five` },
                { label: "Your trip profile", state: "todo" },
              ]}
              notes={[
                ...(ran !== null && ran > 5 * 60_000 ? ["Taking longer than usual — it's still going."] : []),
                "You can leave — it carries on, and it waits for you in Your trips.",
              ]}
              actions={weaveId ? [{ label: "Do this later", onPress: later }] : []}
            />
          );
        })()}
        {weaveId && stage.kind === "missing" && (
          <InlineMessage tone="info" title="This trip isn't there any more" actions={[{ label: "Plan a new trip", onPress: startOver }]} />
        )}
        {weaveId && stage.kind === "failed" && stage.during === "read" && (
          <InlineMessage
            title="Couldn't read your saves"
            body={stage.message}
            actions={record.data?.towns?.length
              ? [{ label: "Try again", busy, onPress: () => { void read(record.data?.towns ?? [], null); } }]
              : [{ label: "Plan a new trip", onPress: startOver }]}
          />
        )}
        {weaveId && stage.kind === "planning" && (
          <InlineMessage tone="info" title="Your plan is being woven" body="It carries on without you here, and it's in Your trips when it's ready."
            actions={[{ label: "See how it's going", onPress: () => router.push({ pathname: "/weave/plan", params: { weaveId } }) }, { label: "Back to Your trips", onPress: later }]} />
        )}
        {weaveId && stage.kind === "planned" && (
          <InlineMessage tone="info" title="This trip has a plan" body="Open it, or change anything below and make it again."
            actions={[{ label: "Open the plan", onPress: () => router.push({ pathname: "/weave/plan", params: { weaveId } }) }]} />
        )}
        {weaveId && stage.kind === "failed" && stage.during === "plan" && (
          <InlineMessage title="The last plan couldn't be made" body={`${stage.message} Change what you like below and make it again.`} />
        )}
        {weaveId && profile && stage.kind !== "reading" && stage.kind !== "planning" && !(stage.kind === "failed" && stage.during === "read") && (
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
        {error && <InlineMessage title={error.title} body={error.message} actions={[{ label: "Try again", busy, onPress: () => { const again = error.retry; setError(null); again(); } }]} />}
      </ScrollView>
      {hub && <ActionBar><Button label="Plan a new trip" onPress={() => setChoosing(true)} /></ActionBar>}
      {picking && !reading && places.length > 0 && (
        <ActionBar>
          <View style={styles.summaryRow}>
            <Text style={[type.label, styles.summary, { color: picked.size > 0 ? p.ink : p.inkMuted }]}>{summary.line}</Text>
            {picked.size > 0 && <Text style={[type.label, { color: p.inkMuted }]}>usually about a minute to read</Text>}
          </View>
          <Button label={summary.saves > 0 ? `Read ${summary.saves} ${summary.saves === 1 ? "save" : "saves"}` : "Read my saves"} busy={busy} disabled={picked.size === 0 || !!tooMany?.blocking} onPress={() => { void read([...picked], summary.saves); }} />
        </ActionBar>
      )}
    </SafeAreaView>
  );
}

/** A place to pick: its name and how many saves it holds; picked, it fills and carries a tick, so the choice is never shown by colour alone. */
function PlaceChip({ place, on, onPress }: { place: WeaveTowns["towns"][number]; on: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Chip
      label={place.name}
      selected={on}
      onPress={onPress}
      leading={on ? <Icon name="check" size={15} color={p.accentInk} /> : undefined}
      trailing={<Text style={[type.label, { color: on ? p.accentInk : p.inkMuted, opacity: on ? 0.85 : 1 }]}>{place.saves}</Text>}
      accessibilityLabel={`${place.name}, ${place.saves} ${place.saves === 1 ? "save" : "saves"}`}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md },
  headerTitle: { flex: 1, textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  intro: { gap: space.xs },
  groupHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.sm },
  overline: { ...font("700"), letterSpacing: 0.8 },
  moreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  flip: { transform: [{ rotate: "180deg" }] },
  pressed: { opacity: 0.6 },
  summaryRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  summary: { ...font("600") },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  centered: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  grow: { flex: 1 },
});
