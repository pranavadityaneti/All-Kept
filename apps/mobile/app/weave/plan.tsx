import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { InlineMessage } from "../../components/InlineMessage";
import { JobCard } from "../../components/JobCard";
import { StopCard } from "../../components/StopCard";
import { track } from "../../lib/metrics";
import { useReducedMotion } from "../../lib/motion";
import { useSavePictures } from "../../lib/save-pictures";
import { useSession } from "../../lib/session";
import { font, space, type, usePalette } from "../../lib/theme";
import { googleDirectionsUrl, type TripStop } from "../../lib/trips";
import { askId, briefLine, crowdLine, dayHeading, dayRoute, markPlanAsked, planAskedAt, planText, runningFor, slotWord, stopHours, tripsKey, tripTitle, useWeave, weaveKey, weavePlan, weaveStage, WeaveRefused, type PlanStop, type WeavePlanned } from "../../lib/weave";
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
  // One id per ask until it goes through: tried again after no answer, a plan the lost request did start is the answer, not a second.
  const retryAttempt = useRef<{ key: string; id: string } | null>(null);
  // The same trip, the same brief, woven again on the same row.
  const retry = async () => {
    const r = record.data;
    if (!weaveId || !r?.profile || !r.brief) return;
    setRetrying(true); setRetryError(null);
    try {
      await weavePlan(weaveId, r.profile, r.brief, askId(retryAttempt, JSON.stringify([weaveId, r.profile, r.brief])));
      retryAttempt.current = null;
      markPlanAsked(weaveId);
      watched.current = true;
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      await queryClient.invalidateQueries({ queryKey: weaveKey(weaveId) });
    } catch (e) {
      if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
      setRetryError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setRetrying(false); }
  };
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
      {made && weaveId ? <PlanView made={made} weaveId={weaveId} userId={userId} /> : (
      <ScrollView contentContainerStyle={styles.page}>
        {(
          record.isError ? (
            <InlineMessage title="Couldn't load this plan just now" actions={[{ label: "Try again", onPress: () => { void record.refetch(); } }]} />
          ) : stage.kind === "missing" ? (
            <InlineMessage tone="info" title="This trip isn't there any more" actions={[{ label: "Plan a new trip", onPress: () => router.replace("/weave") }]} />
          ) : stage.kind === "failed" && stage.during === "plan" ? (
            <InlineMessage
              // The server's words say what went wrong ("Couldn't make the plan just now…"); the title only says where it stopped.
              title="The plan didn't finish"
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
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * The plan itself: the overview, what to book, what was assumed; day chips that stay at the top and
 * jump to a day, lighting up as each day scrolls past; each day under its date and theme, its stops
 * on a timeline with the saves' own pictures; then what didn't fit, and a way to change and remake.
 */
function PlanView({ made, weaveId, userId }: { made: WeavePlanned; weaveId: string; userId: string | null }) {
  const p = usePalette();
  const router = useRouter();
  const reduced = useReducedMotion();
  const now = new Date();
  const byId = new Map(made.stops.map((s) => [s.id, s]));
  const pictures = useSavePictures(made.stops.filter((s) => s.source === "save").map((s) => s.id));
  const open = (id: string) => { if (byId.get(id)?.source !== "suggested") router.push({ pathname: "/item/[id]", params: { id } }); };
  const scroller = useRef<ScrollView>(null);
  const chips = useRef<ScrollView>(null);
  const dayY = useRef<Record<number, number>>({});
  const chipX = useRef<Record<number, number>>({});
  const barHeight = useRef(0);
  const [active, setActive] = useState(made.plan.days[0]?.day ?? 1);
  const [showOverview, setShowOverview] = useState(false);
  const [showAssumed, setShowAssumed] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  // The chip of the day being read stays in view as the days scroll past.
  useEffect(() => { chips.current?.scrollTo({ x: Math.max(0, (chipX.current[active] ?? 0) - space.lg), animated: !reduced }); }, [active, reduced]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y + barHeight.current + space.sm;
    let current = made.plan.days[0]?.day ?? 1;
    for (const d of made.plan.days) if ((dayY.current[d.day] ?? Infinity) <= y) current = d.day;
    if (current !== active) setActive(current);
  };
  const jump = (day: number) => { setActive(day); scroller.current?.scrollTo({ y: Math.max(0, (dayY.current[day] ?? 0) - barHeight.current), animated: !reduced }); };
  const leftOut = [
    ...made.plan.leftOut.map((l) => ({ id: l.id, name: byId.get(l.id)?.name ?? null, reason: l.reason, opens: byId.get(l.id)?.source === "save" })),
    ...made.leftOut.slice(0, 40).map((l) => ({ id: l.id, name: l.title, reason: l.reason, opens: true })),
  ].filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i);
  return (
    <ScrollView ref={scroller} contentContainerStyle={styles.planPage} stickyHeaderIndices={[1]} onScroll={onScroll} scrollEventThrottle={48}>
      <View style={styles.top}>
        <Text style={[type.body, { color: p.ink }]} numberOfLines={showOverview ? undefined : 4}>{made.plan.overview}</Text>
        {made.plan.overview.length > 200 && (
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setShowOverview((v) => !v)}>
            <Text style={[type.label, { color: p.accent }]}>{showOverview ? "Less" : "More"}</Text>
          </Pressable>
        )}
        {made.plan.bookAhead.length > 0 && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Book ahead ({made.plan.bookAhead.length})</Text>
            {made.plan.bookAhead.map((b) => {
              const stop = byId.get(b.id);
              const opens = stop?.source === "save";
              return (
                <Pressable key={b.id} accessibilityRole={opens ? "button" : undefined} disabled={!opens} onPress={() => open(b.id)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
                  <View style={styles.grow}>
                    <Text style={[type.body, styles.name, { color: p.ink }]}>{stop?.name ?? "A stop"}</Text>
                    <Text style={[type.label, { color: p.inkMuted }]}>{b.what} — {b.why}</Text>
                  </View>
                  {opens ? <Icon name="chevron" size={16} color={p.inkMuted} /> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
        {made.plan.assumptions.length > 0 && (
          <View style={styles.assumed}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAssumed }} onPress={() => setShowAssumed((v) => !v)} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}>
              <Text style={[type.label, { color: p.inkMuted }]}>What the plan assumed ({made.plan.assumptions.length})</Text>
              <Icon name="down" size={14} color={p.inkMuted} style={showAssumed ? styles.flip : undefined} />
            </Pressable>
            {showAssumed && made.plan.assumptions.map((a) => <Text key={a} style={[type.label, { color: p.inkMuted }]}>• {a}</Text>)}
          </View>
        )}
      </View>
      <View style={[styles.bar, { backgroundColor: p.bg, borderBottomColor: p.border }]} onLayout={(e) => { barHeight.current = e.nativeEvent.layout.height; }}>
        <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barInner}>
          {made.plan.days.map((d) => (
            <View key={d.day} onLayout={(e) => { chipX.current[d.day] = e.nativeEvent.layout.x; }}>
              <Chip label={`Day ${d.day} · ${d.town}`} selected={active === d.day} onPress={() => jump(d.day)} accessibilityLabel={`Go to ${dayHeading(d, now)}`} />
            </View>
          ))}
        </ScrollView>
      </View>
      {made.plan.days.map((day, dayIndex) => {
        const placed = day.stops.map((s) => byId.get(s.id)).filter((s): s is PlanStop => !!s && s.lat !== 0);
        // The way the trip said it gets around, and a label that says what the link will do.
        const way = dayRoute(made.brief.transport, placed.length);
        const route = googleDirectionsUrl(placed.map(asTripStop), way.mode);
        return (
          <View key={day.day} style={styles.day} onLayout={(e) => { dayY.current[day.day] = e.nativeEvent.layout.y; }}>
            <Text accessibilityRole="header" style={[type.label, styles.overline, { color: p.inkMuted }]}>{dayHeading(day, now).toUpperCase()}</Text>
            <Text style={[type.heading, { color: p.ink }]}>{day.theme}</Text>
            {route && (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => { track(userId, "trip_route", { day: day.day }); void Linking.openURL(route).catch(() => undefined); }} style={({ pressed }) => [styles.mapLink, pressed && styles.pressed]}>
                <Icon name="map" size={16} color={p.accent} />
                <Text style={[type.label, styles.name, { color: p.accent }]}>{way.label}</Text>
              </Pressable>
            )}
            {day.stops.map((s) => {
              const stop = byId.get(s.id);
              if (!stop) return null;
              const hours = stopHours(stop, dayIndex, null, null, now);
              const facts = [crowdLine(stop), hours].filter(Boolean).join(" · ") || null;
              return (
                <View key={s.id} style={styles.slotRow}>
                  <Text style={[type.label, styles.slot, { color: p.inkMuted }]}>{slotWord(s.slot).toUpperCase()}</Text>
                  <View style={styles.grow}>
                    <StopCard stop={stop} why={s.why} tip={s.tip} warning={s.warning} facts={facts} closed={!!hours?.startsWith("Closed")} picture={pictures[stop.id]}
                      onOpen={stop.source === "save" ? () => open(stop.id) : undefined} />
                  </View>
                </View>
              );
            })}
            {day.notes ? (
              <View style={styles.dayNote}>
                <Icon name="moon" size={16} color={p.inkMuted} />
                <Text style={[type.label, styles.grow, { color: p.inkMuted }]}>{day.notes}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={styles.end}>
        {leftOut.length > 0 && (
          <Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLeft }} onPress={() => setShowLeft((v) => !v)} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}>
              <Text style={[type.heading, styles.grow, { color: p.ink }]}>Also saved, didn't fit ({leftOut.length})</Text>
              <Icon name="down" size={18} color={p.inkMuted} style={showLeft ? styles.flip : undefined} />
            </Pressable>
            {showLeft && leftOut.map((l) => (
              <Pressable key={l.id} accessibilityRole={l.opens ? "button" : undefined} disabled={!l.opens} onPress={() => open(l.id)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
                <View style={styles.grow}>
                  <Text numberOfLines={1} style={[type.body, { color: p.ink }]}>{l.name ?? "A save"}</Text>
                  <Text style={[type.label, { color: p.inkMuted }]}>{l.reason}</Text>
                </View>
                {l.opens ? <Icon name="chevron" size={16} color={p.inkMuted} /> : null}
              </Pressable>
            ))}
          </Card>
        )}
        <Text style={[type.label, { color: p.inkMuted }]}>Made from the posts you saved; every stop is one of yours unless it says suggested. Hours and holidays are as the maps and calendars have them — check before you go.</Text>
        <Button label="Change and remake" variant="secondary" onPress={() => router.push({ pathname: "/weave", params: { weaveId } })} />
      </View>
    </ScrollView>
  );
}

/** The timeline's rail, where each stop's time of day sits. */
const RAIL = 82;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  headerTitle: { flex: 1, alignItems: "center" },
  centeredText: { textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  planPage: { paddingBottom: space.xxl },
  top: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  assumed: { gap: space.xs },
  disclosure: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 32 },
  flip: { transform: [{ rotate: "180deg" }] },
  bar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm },
  barInner: { paddingHorizontal: space.lg, gap: space.sm },
  day: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.sm },
  overline: { ...font("700"), letterSpacing: 0.8 },
  mapLink: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32 },
  slotRow: { flexDirection: "row", gap: space.sm },
  // Wide enough for the longest slot word, "AFTERNOON", on one line; "LATE MORNING" breaks between its words.
  slot: { width: RAIL, paddingTop: space.md, fontSize: 11, lineHeight: 15, ...font("700"), letterSpacing: 0.5 },
  dayNote: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingLeft: RAIL + space.sm, paddingTop: space.xs },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingVertical: space.xs },
  end: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md },
  name: { ...font("600") },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
});
