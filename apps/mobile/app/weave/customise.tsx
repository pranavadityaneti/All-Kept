import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { IconButton } from "../../components/IconButton";
import { track } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { radius, space, type, usePalette } from "../../lib/theme";
import { planKey, rememberWeave, setNights, splitDays, weavePlan, WeaveRefused, type WeaveBrief, type WeaveProfile } from "../../lib/weave";
import { profileKey } from "./index";

const GROUPS = [["solo", "Solo"], ["couple", "Couple"], ["family", "Family"], ["friends", "Friends"]] as const;
const PACES = [["relaxed", "Relaxed · 3–4 a day"], ["full", "Full · 5–6 a day"]] as const;
const TRANSPORT = [["walk_cab", "Walking and cabs"], ["car", "A car"], ["transit", "Transit"]] as const;
const BUDGETS = [["low", "Careful"], ["mid", "Middle"], ["high", "Splurge"]] as const;

/** The brief: what the person can tell us, all of it optional; the plan is made again with it. */
export default function Customise() {
  const p = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const userId = session.status === "ready" && !session.anonymous ? session.userId : null;
  const { weaveId } = useLocalSearchParams<{ weaveId: string }>();
  const profile = queryClient.getQueryData<WeaveProfile>(profileKey(weaveId ?? "")) ?? null;
  const [days, setDays] = useState(7);
  const [nights, setNightsState] = useState(() => splitDays(7, profile?.towns ?? []));
  const [startDate, setStartDate] = useState("");
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [bases, setBases] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<WeaveBrief["group"]>(profile?.group ?? null);
  const [pace, setPace] = useState<WeaveBrief["pace"]>("relaxed");
  const [transport, setTransport] = useState<WeaveBrief["transport"]>("walk_cab");
  const [budget, setBudget] = useState<WeaveBrief["budget"]>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changeDays = (next: number) => { const d = Math.max(1, Math.min(21, next)); setDays(d); setNightsState(splitDays(d, profile?.towns ?? [])); };
  const totalNights = nights.reduce((a, n) => a + n.nights, 0);

  const make = async () => {
    if (!weaveId || !profile) return;
    setBusy(true); setError(null);
    try {
      // The server answers at once and weaves on; the plan screen waits on the row.
      await weavePlan(weaveId, profile, {
        days, nights, startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim()) ? startDate.trim() : null,
        arrival: arrival.trim() || null, departure: departure.trim() || null,
        bases: Object.entries(bases).filter(([, name]) => name.trim()).map(([town, name]) => ({ town, name: name.trim() })),
        group, pace, transport, budget, note: note.trim() || null,
      });
      queryClient.removeQueries({ queryKey: planKey(weaveId) }); // a plan made before on this weave is not the one now being woven
      rememberWeave(weaveId);
      track(userId, "weave_plan", { days, customised: true });
      router.replace({ pathname: "/weave/plan", params: { weaveId } });
    } catch (e) {
      if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); }
  };
  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, inputMode: "text" | "numeric" = "text") => (
    <View style={styles.field}>
      <Text style={[type.label, { color: p.inkMuted }]}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={p.inkMuted} autoCapitalize="none" autoCorrect={false} inputMode={inputMode} editable={!busy}
        style={[type.body, { color: p.ink, backgroundColor: p.surface, padding: space.md, borderRadius: radius.md }]} />
    </View>
  );

  if (!profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
        <View style={styles.header}><IconButton name="back" label="Back" onPress={() => router.back()} /><Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Customise</Text><View style={styles.spacer} /></View>
        <View style={styles.page}><Card><Text style={[type.body, { color: p.inkMuted }]}>Start from "Plan a trip" on the map, so your saves are read first.</Text></Card></View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}><IconButton name="back" label="Back" onPress={() => router.back()} /><Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Customise</Text><View style={styles.spacer} /></View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[type.body, { color: p.inkMuted }]}>Everything here is optional. What you leave alone, the plan takes from your saves.</Text>
        <Card>
          <View style={styles.row}><Text style={[type.heading, styles.grow, { color: p.ink }]}>{days} {days === 1 ? "day" : "days"}</Text>
            <IconButton name="minus" label="A day fewer" size={32} tone="plain" onPress={() => changeDays(days - 1)} /><IconButton name="plus" label="A day more" size={32} tone="plain" onPress={() => changeDays(days + 1)} /></View>
          {field("Starting on (YYYY-MM-DD)", startDate, setStartDate, "2026-10-06", "numeric")}
          <View style={styles.pair}>{field("Arriving at (HH:MM)", arrival, setArrival, "14:30", "numeric")}{field("Leaving at (HH:MM)", departure, setDeparture, "18:00", "numeric")}</View>
          <Text style={[type.label, { color: p.inkMuted }]}>With the dates, the plan knows each place's hours that day, the public holidays, and what the weather is typically like.</Text>
        </Card>
        <Card>
          <Text style={[type.heading, { color: p.ink }]}>Nights {totalNights !== days ? <Text style={{ color: p.bad }}>· {totalNights} of {days}</Text> : null}</Text>
          {nights.map((n) => (
            <View key={n.town} style={styles.row}>
              <Text style={[type.body, styles.grow, { color: p.ink }]}>{n.town} <Text style={{ color: p.inkMuted }}>{n.nights} {n.nights === 1 ? "night" : "nights"}</Text></Text>
              <IconButton name="minus" label={`Fewer nights in ${n.town}`} size={32} tone="plain" onPress={() => setNightsState(setNights(nights, n.town, -1))} />
              <IconButton name="plus" label={`More nights in ${n.town}`} size={32} tone="plain" onPress={() => setNightsState(setNights(nights, n.town, 1))} />
            </View>
          ))}
          {nights.map((n) => <View key={`base-${n.town}`}>{field(`Staying in ${n.town} at`, bases[n.town] ?? "", (v) => setBases((b) => ({ ...b, [n.town]: v })), "A hotel or an area, if you know")}</View>)}
        </Card>
        <Card>
          <Text style={[type.heading, { color: p.ink }]}>Who's going</Text>
          <View style={styles.wrap}>{GROUPS.map(([k, label]) => <Chip key={k} label={label} selected={group === k} onPress={() => setGroup(group === k ? null : k)} />)}</View>
          <Text style={[type.heading, { color: p.ink }]}>Pace</Text>
          <View style={styles.wrap}>{PACES.map(([k, label]) => <Chip key={k} label={label} selected={pace === k} onPress={() => setPace(k)} />)}</View>
          <Text style={[type.heading, { color: p.ink }]}>Getting around</Text>
          <View style={styles.wrap}>{TRANSPORT.map(([k, label]) => <Chip key={k} label={label} selected={transport === k} onPress={() => setTransport(k)} />)}</View>
          <Text style={[type.heading, { color: p.ink }]}>Budget</Text>
          <View style={styles.wrap}>{BUDGETS.map(([k, label]) => <Chip key={k} label={label} selected={budget === k} onPress={() => setBudget(budget === k ? null : k)} />)}</View>
          {field("Anything else", note, setNote, "We land late on day one; keep the last day light…")}
        </Card>
        <Button label="Make the plan" busy={busy} disabled={totalNights !== days} onPress={() => { void make(); }} />
        {busy && <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.inkMuted }]}>Arranging your trip… this takes a minute or two.</Text></View>}
        {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.md },
  headerTitle: { flex: 1, textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  pair: { flexDirection: "row", gap: space.sm },
  field: { flex: 1, gap: space.xs },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  grow: { flex: 1 },
  centered: { alignItems: "center", gap: space.md, paddingVertical: space.lg },
});
