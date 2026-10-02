import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { WeaveBrief } from "@allkept/contracts";
import { Chip } from "./Chip";
import { SegmentedControl } from "./SegmentedControl";
import { WhenRow } from "./WhenRow";
import { radius, space, type, usePalette } from "../lib/theme";
import { timeDate } from "../lib/when";

/** What a person can tell the plan beyond how long — all of it optional. */
export interface TripChoices {
  startDate: string | null; arrival: string | null; departure: string | null;
  bases: Record<string, string>;
  group: WeaveBrief["group"]; pace: WeaveBrief["pace"]; transport: WeaveBrief["transport"]; budget: WeaveBrief["budget"];
  note: string;
}

/** The choices a trip starts with: what it was made with before, else what its saves say, else the quiet defaults. */
export function startingChoices(made: WeaveBrief | null, group: WeaveBrief["group"]): TripChoices {
  return {
    startDate: made?.startDate ?? null, arrival: made?.arrival ?? null, departure: made?.departure ?? null,
    bases: Object.fromEntries((made?.bases ?? []).filter((b) => b.name).map((b) => [b.town, b.name!])),
    group: made?.group ?? group, pace: made?.pace ?? "relaxed", transport: made?.transport ?? "walk_cab", budget: made?.budget ?? null,
    note: made?.note ?? "",
  };
}

const GROUPS = [["solo", "Solo"], ["couple", "Couple"], ["family", "Family"], ["friends", "Friends"]] as const;
const BUDGETS = [["low", "Careful"], ["mid", "Middle"], ["high", "Splurge"]] as const;

/**
 * More options, opened in place under How long: the dates from the phone's own pickers, where the
 * person is staying, who is going, the pace, getting around, the budget, and anything else. What is
 * left alone, the plan takes from the saves. A choice that can't be planned is said here, where it
 * was made.
 */
export function TripOptions({ value, onChange, towns, problem, disabled }: {
  value: TripChoices;
  onChange: (patch: Partial<TripChoices>) => void;
  towns: string[];
  /** Why the dates can't be planned, if they can't. */
  problem: string | null;
  disabled: boolean;
}) {
  const p = usePalette();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [picking, setPicking] = useState<"start" | "arrival" | "departure" | null>(null);
  const pick = (row: "start" | "arrival" | "departure") => (open: boolean) => setPicking(open ? row : null);
  const field = [type.body, styles.field, { color: p.ink, backgroundColor: p.surfaceAlt, borderColor: p.border }];
  return (
    <View style={styles.wrap}>
      <WhenRow label="Starting on" mode="date" value={value.startDate} onChange={(v) => onChange({ startDate: v })} open={picking === "start"} onOpen={pick("start")} opensAt={today} minimumDate={today} disabled={disabled} />
      <WhenRow label="Arriving at" mode="time" value={value.arrival} onChange={(v) => onChange({ arrival: v })} open={picking === "arrival"} onOpen={pick("arrival")} opensAt={timeDate("14:00", now)} disabled={disabled} />
      <WhenRow label="Leaving at" mode="time" value={value.departure} onChange={(v) => onChange({ departure: v })} open={picking === "departure"} onOpen={pick("departure")} opensAt={timeDate("18:00", now)} disabled={disabled} />
      <Text style={[type.label, { color: p.inkMuted }]}>With the dates, the plan knows each place's hours that day, the public holidays, and what the weather is typically like.</Text>
      {problem && <Text accessibilityRole="alert" style={[type.label, { color: p.bad }]}>{problem}</Text>}

      <Text style={[type.label, styles.heading, { color: p.inkMuted }]}>WHO'S GOING</Text>
      <View style={styles.chips}>{GROUPS.map(([k, label]) => <Chip key={k} label={label} selected={value.group === k} onPress={() => onChange({ group: value.group === k ? null : k })} />)}</View>

      <Text style={[type.label, styles.heading, { color: p.inkMuted }]}>PACE</Text>
      <SegmentedControl label="Pace" value={value.pace} onChange={(v) => onChange({ pace: v })}
        options={[{ value: "relaxed" as const, label: "Relaxed · 3–4 a day" }, { value: "full" as const, label: "Full · 5–6 a day" }]} />

      <Text style={[type.label, styles.heading, { color: p.inkMuted }]}>GETTING AROUND</Text>
      <SegmentedControl label="Getting around" value={value.transport} onChange={(v) => onChange({ transport: v })}
        options={[{ value: "walk_cab" as const, label: "Walking and cabs" }, { value: "car" as const, label: "A car" }, { value: "transit" as const, label: "Transit" }]} />

      <Text style={[type.label, styles.heading, { color: p.inkMuted }]}>BUDGET</Text>
      <View style={styles.chips}>{BUDGETS.map(([k, label]) => <Chip key={k} label={label} selected={value.budget === k} onPress={() => onChange({ budget: value.budget === k ? null : k })} />)}</View>

      {towns.map((town) => (
        <View key={town} style={styles.labelled}>
          <Text style={[type.label, { color: p.inkMuted }]}>Staying in {town} at</Text>
          <TextInput accessibilityLabel={`Where you're staying in ${town}`} value={value.bases[town] ?? ""} onChangeText={(v) => onChange({ bases: { ...value.bases, [town]: v } })}
            placeholder="A hotel or an area, if you know" placeholderTextColor={p.inkMuted} editable={!disabled} maxLength={80} selectionColor={p.accent} style={field} />
        </View>
      ))}
      <View style={styles.labelled}>
        <Text style={[type.label, { color: p.inkMuted }]}>Anything else</Text>
        <TextInput accessibilityLabel="Anything else the plan should know" value={value.note} onChangeText={(v) => onChange({ note: v })} multiline maxLength={500}
          placeholder="We land late on day one; keep the last day light…" placeholderTextColor={p.inkMuted} editable={!disabled} selectionColor={p.accent} style={[field, styles.note]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  heading: { letterSpacing: 0.8, marginTop: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  labelled: { gap: space.xs },
  field: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  note: { minHeight: 88, textAlignVertical: "top" },
});
