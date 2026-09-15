import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { track } from "../../lib/metrics";
import { useSession } from "../../lib/session";
import { radius, space, type, usePalette } from "../../lib/theme";
import { keepPlan, KIND_LABEL, percent, setNights, shiftMix, splitDays, useWeaveTowns, weavePlan, weaveUnderstand, WeaveRefused, type WeaveProfile } from "../../lib/weave";

/** The profile a weave was read into, kept for Customise to start from. */
export const profileKey = (weaveId: string) => ["weave-profile", weaveId] as const;

/**
 * Plan a trip: the towns the saves name, the profile the saves add up to — edited in the open —
 * and a plan of seven or twelve days, or Customise for the brief. Nothing is planned until the
 * person has seen what their saves say and moved what they want moved.
 */
export default function Weave() {
  const p = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const ready = session.status === "ready";
  const userId = ready && !session.anonymous ? session.userId : null;
  const towns = useWeaveTowns(ready);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [stage, setStage] = useState<"towns" | "reading" | "profile" | "making">("towns");
  const [weaveId, setWeaveId] = useState<string | null>(null);
  const [profile, setProfile] = useState<WeaveProfile | null>(null);
  const [savesRead, setSavesRead] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Every town ticked to begin with; the person unticks what is not this trip.
  useEffect(() => { if (towns.data && picked === null) setPicked(new Set(towns.data.towns.map((t) => t.name))); }, [towns.data, picked]);

  const refuse = (e: unknown) => {
    if (e instanceof WeaveRefused && e.code === "payment_required") { router.push("/subscribe"); return; }
    setError(e instanceof Error ? e.message : "Something went wrong.");
  };
  const read = async () => {
    if (!picked || picked.size === 0) return;
    setStage("reading"); setError(null);
    try {
      const out = await weaveUnderstand([...picked]);
      setWeaveId(out.weaveId); setProfile(out.profile); setSavesRead(out.saves);
      queryClient.setQueryData(profileKey(out.weaveId), out.profile);
      track(userId, "weave_read", { saves: out.saves, towns: picked.size });
      setStage("profile");
    } catch (e) { setStage("towns"); refuse(e); }
  };
  const make = async (days: number) => {
    if (!weaveId || !profile) return;
    setStage("making"); setError(null);
    try {
      const made = await weavePlan(weaveId, profile, { days, nights: splitDays(days, profile.towns) });
      keepPlan(queryClient, made);
      track(userId, "weave_plan", { days, stops: made.stops.length, cost: made.cost });
      router.replace({ pathname: "/weave/plan", params: { weaveId } });
    } catch (e) { setStage("profile"); refuse(e); }
  };
  const customise = () => {
    if (!weaveId || !profile) return;
    queryClient.setQueryData(profileKey(weaveId), profile);
    router.push({ pathname: "/weave/customise", params: { weaveId } });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text style={[type.heading, styles.headerTitle, { color: p.ink }]}>Plan a trip</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {stage === "towns" && (
          <>
            <Text style={[type.body, { color: p.inkMuted }]}>Where is this trip? Untick the towns that aren't part of it.</Text>
            {towns.isPending ? <ActivityIndicator color={p.accent} /> : towns.data && towns.data.towns.length === 0 ? (
              <Card><Text style={[type.body, { color: p.inkMuted }]}>No saves name a place yet. Save a few reels of cafés, sights and hotels, and come back once they are on the map.</Text></Card>
            ) : (
              <View style={styles.wrap}>
                {towns.data?.towns.map((t) => (
                  <Chip key={t.name} label={`${t.name} ${t.saves}`} selected={picked?.has(t.name) ?? false} onPress={() => setPicked((s) => { const next = new Set(s ?? []); if (next.has(t.name)) next.delete(t.name); else next.add(t.name); return next; })} accessibilityLabel={`${t.name}, ${t.saves} saves`} />
                ))}
              </View>
            )}
            <Button label="Read my saves" disabled={!picked || picked.size === 0} onPress={() => { void read(); }} />
            <Text style={[type.label, { color: p.inkMuted }]}>Allkept reads the posts you saved in these towns and says what they add up to. Nothing is planned until you've seen that.</Text>
          </>
        )}
        {stage === "reading" && <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.inkMuted }]}>Reading your saves…</Text></View>}
        {stage === "making" && <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.inkMuted }]}>Arranging your trip… this takes a minute or two.</Text></View>}
        {stage === "profile" && profile && (
          <>
            <Card>
              <Text style={[type.heading, { color: p.ink }]}>What your saves say</Text>
              <Text style={[type.label, { color: p.inkMuted }]}>{savesRead} saves read. Move what you'd like more or less of.</Text>
              {profile.mix.map((m) => (
                <View key={m.kind} style={styles.row}>
                  <Text style={[type.body, styles.grow, { color: p.ink }]}>{KIND_LABEL[m.kind]} <Text style={{ color: p.inkMuted }}>{percent(m.share)}</Text></Text>
                  <IconButton name="minus" label={`Less ${KIND_LABEL[m.kind]}`} size={32} tone="plain" onPress={() => setProfile(shiftMix(profile, m.kind, "less"))} />
                  <IconButton name="plus" label={`More ${KIND_LABEL[m.kind]}`} size={32} tone="plain" onPress={() => setProfile(shiftMix(profile, m.kind, "more"))} />
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
                  <IconButton name="minus" label={`Fewer nights in ${t.name}`} size={32} tone="plain" onPress={() => setProfile({ ...profile, towns: setNights(profile.towns.map((x) => ({ town: x.name, nights: x.nights })), t.name, -1).map((n, i) => ({ ...profile.towns[i]!, nights: n.nights })) })} />
                  <IconButton name="plus" label={`More nights in ${t.name}`} size={32} tone="plain" onPress={() => setProfile({ ...profile, towns: setNights(profile.towns.map((x) => ({ town: x.name, nights: x.nights })), t.name, 1).map((n, i) => ({ ...profile.towns[i]!, nights: n.nights })) })} />
                </View>
              ))}
              <Text style={[type.label, { color: p.inkMuted }]}>In proportion to what you saved. A 7- or 12-day plan splits its days the same way.</Text>
            </Card>
            <Button label="Make a 7-day plan" onPress={() => { void make(7); }} />
            <Button label="Make a 12-day plan" variant="secondary" onPress={() => { void make(12); }} />
            <Button label="Customise…" variant="secondary" onPress={customise} />
          </>
        )}
        {error && <View style={[styles.error, { backgroundColor: p.surface, borderColor: p.border }]}><Icon name="help" size={18} color={p.bad} /><Text accessibilityRole="alert" style={[type.body, styles.grow, { color: p.bad }]}>{error}</Text></View>}
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  centered: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.xs },
  grow: { flex: 1 },
  error: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
