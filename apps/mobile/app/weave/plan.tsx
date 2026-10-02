import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { InlineMessage } from "../../components/InlineMessage";
import { JobCard } from "../../components/JobCard";
import { track } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { font, radius, space, type, usePalette } from "../../lib/theme";
import { googleDirectionsUrl, type TripStop } from "../../lib/trips";
import { briefLine, crowdLine, markPlanAsked, planAskedAt, planText, runningFor, slotWord, stopHours, tripsKey, tripTitle, useWeave, weaveKey, weavePlan, weaveStage, WeaveRefused, type PlanStop } from "../../lib/weave";
import { describeRange } from "../../lib/when";

const asTripStop = (s: PlanStop): TripStop => ({ id: s.id, title: s.title ?? s.name, url: s.url, lastSavedAt: "", place: { name: s.name, address: s.address, lat: s.lat, lng: s.lng, status: null, url: null, periods: null, utcOffsetMinutes: null, locality: s.town } });

/**
 * The plan: the overview, what to book, the days with their stops, what didn't fit — and the two
 * ways out of a day. Opened on the trip's id alone and drawn from its row (spec §11): it waits here
 * while the plan is woven, says the server's own words if it failed with the same brief one tap from
 * trying again, and is reachable by the id for as long as the trip is there.
 */
export default function Plan() {
  const p = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === "ready" && !session.anonymous ? session.userId : null;
  const params = useLocalSearchParams<{ weaveId?: string }>();
  const weaveId = typeof params.weaveId === "string" && params.weaveId ? params.weaveId : null;
  const record = useWeave(weaveId);
  // Without an id there is no trip to wait on: said at once, rather than a spinner that never ends.
  const stage = weaveId ? weaveStage(record.data, Date.now()) : { kind: "missing" as const };
  const made = stage.kind === "planned" ? stage.planned : null;
  // A plan counted once, when it is seen to arrive here — not again each time it is reopened.
  const watched = useRef(false);
  useEffect(() => {
    if (stage.kind === "planning") watched.current = true;
    if (made && watched.current) { watched.current = false; track(userId, "weave_planned", { stops: made.stops.length, cost: made.cost }); }
  }, [stage.kind, made, userId]);
  // The planning card's clock, ticking only while the plan is woven and only when this phone knows when it was asked for.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (stage.kind !== "planning") return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [stage.kind]);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // The same trip, the same brief, woven again on the same row.
  const retry = async () => {
    const r = record.data;
    if (!weaveId || !r?.profile || !r.brief) return;
    setRetrying(true); setRetryError(null);
    try {
      await weavePlan(weaveId, r.profile, r.brief);
      markPlanAsked(weaveId);
      watched.current = true;
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      await queryClient.invalidateQueries({ queryKey: weaveKey(weaveId) });
    } catch (e) {
      if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
      setRetryError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setRetrying(false); }
  };
  const byId = new Map((made?.stops ?? []).map((s) => [s.id, s]));
  // Named by its places, with its days — and its dates when it has them — under the name.
  const brief = made?.brief ?? record.data?.brief ?? null;
  const title = record.data ? tripTitle(record.data.towns ?? (brief ? [...new Set(brief.nights.map((n) => n.town))] : null)) : "Your plan";
  const subtitle = brief ? `${brief.days} ${brief.days === 1 ? "day" : "days"}${brief.startDate ? ` · ${describeRange(brief.startDate, brief.days, new Date())}` : ""}` : null;
  const asked = weaveId ? planAskedAt(weaveId) : null;
  const share = async () => {
    if (!made) return;
    track(userId, "weave_share", {});
    await Share.share({ message: planText(made.plan, made.stops, subtitle ? `${title} — ${subtitle}` : title) }).catch(() => undefined);
  };
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <View style={styles.headerTitle}>
          <Text numberOfLines={1} style={[type.heading, styles.centeredText, { color: p.ink }]}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={[type.label, styles.centeredText, { color: p.inkMuted }]}>{subtitle}</Text> : null}
        </View>
        {made ? <IconButton name="share" label="Share the plan" onPress={() => { void share(); }} /> : <View style={styles.spacer} />}
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {!made ? (
          record.isError ? (
            <InlineMessage title="Couldn't load this plan just now" actions={[{ label: "Try again", onPress: () => { void record.refetch(); } }]} />
          ) : stage.kind === "missing" ? (
            <InlineMessage tone="info" title="This trip isn't there any more" actions={[{ label: "Plan a new trip", onPress: () => router.replace("/weave") }]} />
          ) : stage.kind === "failed" && stage.during === "plan" ? (
            <InlineMessage
              title="Couldn't make the plan"
              body={retryError ?? stage.message}
              actions={[
                { label: "Try again", busy: retrying, onPress: () => { void retry(); } },
                // The advice ("try fewer days…") is acted on where the trip is shaped, with everything it was asked kept.
                { label: "Change the trip", onPress: () => router.push({ pathname: "/weave", params: { weaveId: weaveId! } }) },
              ]}
            />
          ) : stage.kind === "reading" || stage.kind === "profiled" || stage.kind === "failed" ? (
            // A trip opened here before it has a plan: its own screen is where the next step is.
            <InlineMessage tone="info" title="This trip has no plan yet" actions={[{ label: "Go to the trip", onPress: () => router.replace({ pathname: "/weave", params: { weaveId: weaveId! } }) }]} />
          ) : (
            <JobCard
              steps={[
                { label: "What your saves say", state: "done" },
                { label: brief ? `Arranging your ${brief.days} ${brief.days === 1 ? "day" : "days"}` : "Arranging your days", state: "active", detail: asked ? `${runningFor(now - asked)} · usually 2–5 minutes` : "usually 2–5 minutes" },
                { label: "Your plan", state: "todo" },
              ]}
              notes={[
                ...(brief ? [briefLine(brief, new Date(now))] : []),
                ...(asked && now - asked > 8 * 60_000 ? ["Taking longer than usual — it's still going."] : []),
                "You can leave — it's in Your trips when it's ready.",
              ]}
              actions={[{ label: "Do this later", onPress: () => router.back() }]}
            />
          )
        ) : (
          <>
            <Text style={[type.body, { color: p.ink }]}>{made.plan.overview}</Text>
            {made.plan.assumptions.length > 0 && <Text style={[type.label, { color: p.inkMuted }]}>Assumed: {made.plan.assumptions.join(" · ")}</Text>}
            {made.plan.bookAhead.length > 0 && (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Book ahead</Text>
                {made.plan.bookAhead.map((b) => <Text key={b.id} style={[type.body, { color: p.ink }]}>{byId.get(b.id)?.name ?? b.id} <Text style={{ color: p.inkMuted }}>— {b.what}. {b.why}</Text></Text>)}
              </Card>
            )}
            {made.plan.days.map((day, dayIndex) => {
              const route = googleDirectionsUrl(day.stops.map((s) => byId.get(s.id)).filter((s): s is PlanStop => !!s && s.lat !== 0).map(asTripStop));
              return (
                <View key={day.day} style={styles.day}>
                  <Text style={[type.heading, { color: p.ink }]}>Day {day.day}{day.date ? ` · ${day.date}` : ""} · {day.town}</Text>
                  <Text style={[type.body, { color: p.inkMuted }]}>{day.theme}</Text>
                  {day.stops.map((s, i) => {
                    const stop = byId.get(s.id);
                    if (!stop) return null;
                    const crowd = crowdLine(stop);
                    const hours = stopHours(stop, dayIndex, null, null, new Date());
                    const open = () => { if (stop.source === "save") router.push({ pathname: "/item/[id]", params: { id: stop.id } }); };
                    return (
                      <Pressable key={s.id} accessibilityRole={stop.source === "save" ? "button" : "text"} onPress={open} style={({ pressed }) => [styles.stop, { backgroundColor: p.surface, borderColor: p.border }, pressed && stop.source === "save" && styles.pressed]}>
                        <View style={styles.stopHead}>
                          <Text style={[type.label, { color: p.accent }]}>{i + 1} · {slotWord(s.slot)}</Text>
                          {stop.source === "suggested" && <Chip label="Suggested" boxed accessibilityLabel="Suggested, not from your saves" />}
                        </View>
                        <Text style={[type.body, styles.name, { color: p.ink }]}>{stop.name}</Text>
                        {stop.address && <Text numberOfLines={2} style={[type.label, { color: p.inkMuted }]}>{stop.address}</Text>}
                        {(crowd || hours) && <Text style={[type.label, { color: hours?.startsWith("Closed") ? p.bad : p.inkMuted }]}>{[crowd, hours].filter(Boolean).join(" · ")}</Text>}
                        <Text style={[type.body, { color: p.ink }]}>{s.why}</Text>
                        {s.tip && <Text style={[type.label, { color: p.inkMuted }]}>Tip: {s.tip}</Text>}
                        {s.warning && <Text style={[type.label, { color: p.warn }]}>{s.warning}</Text>}
                        {stop.source === "save" && <View style={styles.fromRow}><Icon name="pin" size={14} color={p.inkMuted} /><Text numberOfLines={1} style={[type.label, styles.grow, { color: p.inkMuted }]}>From your save{stop.title ? `: ${stop.title}` : ""}</Text><Icon name="chevron" size={16} color={p.inkMuted} /></View>}
                      </Pressable>
                    );
                  })}
                  {day.notes && <Text style={[type.label, { color: p.inkMuted }]}>{day.notes}</Text>}
                  {route && <Button label="Start this day in Google Maps" variant="secondary" onPress={() => { track(userId, "trip_route", { day: day.day }); void Linking.openURL(route).catch(() => undefined); }} />}
                </View>
              );
            })}
            {(made.plan.leftOut.length > 0 || made.leftOut.length > 0) && (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Also saved, didn't fit</Text>
                {made.plan.leftOut.map((l) => <Text key={`p-${l.id}`} style={[type.label, { color: p.inkMuted }]}>{byId.get(l.id)?.name ?? l.id} — {l.reason}</Text>)}
                {made.leftOut.slice(0, 40).map((l) => <Text key={`s-${l.id}`} style={[type.label, { color: p.inkMuted }]}>{l.title ?? "A save"} — {l.reason}</Text>)}
              </Card>
            )}
            <Text style={[type.label, { color: p.inkMuted }]}>Made from the posts you saved; every stop is one of yours unless it says suggested. Hours and holidays are as the maps and calendars have them — check before you go.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  headerTitle: { flex: 1, alignItems: "center" },
  centeredText: { textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  day: { gap: space.sm, marginTop: space.md },
  stop: { padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: space.xs },
  stopHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { ...font("600") },
  fromRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  grow: { flex: 1 },
  pressed: { opacity: 0.85 },
});
