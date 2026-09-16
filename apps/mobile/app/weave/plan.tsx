import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { track } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { font, radius, space, type, usePalette } from "../../lib/theme";
import { googleDirectionsUrl, type TripStop } from "../../lib/trips";
import { crowdLine, planText, slotWord, stopHours, usePlanned, type PlanStop } from "../../lib/weave";

const asTripStop = (s: PlanStop): TripStop => ({ id: s.id, title: s.title ?? s.name, url: s.url, lastSavedAt: "", place: { name: s.name, address: s.address, lat: s.lat, lng: s.lng, status: null, url: null, periods: null, utcOffsetMinutes: null, locality: s.town } });

/**
 * The plan: the overview, what to book, the days with their stops, what didn't fit — and the two
 * ways out of a day. Opened on the weave's id alone: it waits here while the plan is woven (the
 * row is watched, spec §11), so a plan begun and left is still reachable.
 */
export default function Plan() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const userId = session.status === "ready" && !session.anonymous ? session.userId : null;
  const { weaveId } = useLocalSearchParams<{ weaveId: string }>();
  const planned = usePlanned(weaveId ?? "");
  const made = planned.data ?? null;
  useEffect(() => { if (made) track(userId, "weave_planned", { stops: made.stops.length, cost: made.cost }); }, [made, userId]);
  const byId = new Map((made?.stops ?? []).map((s) => [s.id, s]));
  const title = made ? `${[...new Set(made.brief.nights.map((n) => n.town))].join(" · ")} — ${made.brief.days} ${made.brief.days === 1 ? "day" : "days"}` : "Your plan";
  const share = async () => {
    if (!made) return;
    track(userId, "weave_share", {});
    await Share.share({ message: planText(made.plan, made.stops, title) }).catch(() => undefined);
  };
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text numberOfLines={1} style={[type.heading, styles.headerTitle, { color: p.ink }]}>{title}</Text>
        {made ? <IconButton name="share" label="Share the plan" onPress={() => { void share(); }} /> : <View style={styles.spacer} />}
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {!made ? (
          planned.isError ? (
            <Card><Icon name="help" size={18} color={p.bad} /><Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{planned.error.message}</Text><Button label="Back" variant="secondary" onPress={() => router.back()} /></Card>
          ) : (
            <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.inkMuted }]}>Weaving your plan — two to five minutes. You can leave; it carries on, and it's here when you come back.</Text></View>
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
  centered: { alignItems: "center", gap: space.md, paddingVertical: space.xl },
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  headerTitle: { flex: 1, textAlign: "center" },
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
