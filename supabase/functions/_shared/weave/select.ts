// Select: a plan has room for about five things a day, not a hundred.
//
// The understanding stage says what the saves add up to; this stage decides which saves get the
// room. Slots are counted from the days and the pace, allotted to towns by nights and to kinds by
// the mix, and filled by strength of signal — saved twice, noted, reminded, specific, on the map.
// What does not fit is kept with its reason, so nothing is dropped in silence; a kind the mix wants
// in a town with no save of it becomes a gap, which the plan may fill with a labelled suggestion.
// Pure; every rule here is tested. See internal/superpowers/specs/2026-09-16-weave-itinerary-design.md.
import type { WeaveBrief, WeaveKind, WeaveProfile } from "../contracts.ts";

/** A save as the selection sees it: the signals, and where it is. */
export interface WeaveSave {
  id: string;
  kind: WeaveKind;
  /** The town the save belongs to, by its place or its venue; null when it names none. */
  town: string | null;
  /** True when the place is on the map; an unplaced save can still be chosen, but is flagged. */
  placed: boolean;
  saveCount: number;
  noted: boolean;
  reminded: boolean;
  /** Marked visited already: kept out, listed as "been". */
  done: boolean;
  /** A named dish, a spot named on the screen, a named entity: the reel said what, not just where. */
  specific: boolean;
  savedAt: string;
}

/** Stops a day holds at each pace. The first day, the last day and a transit day hold one fewer. */
export const PACE: Record<WeaveBrief["pace"], number> = { relaxed: 4, full: 6 };

/** Slots per day for a trip: pace, less one on the first day, the last day and each day a town changes. */
export function slotsPerDay(brief: Pick<WeaveBrief, "days" | "pace" | "nights">): number[] {
  const per = PACE[brief.pace];
  const towns = brief.nights.filter((n) => n.nights > 0).length;
  const out: number[] = [];
  let townIndex = 0, left = brief.nights[0]?.nights ?? brief.days;
  for (let d = 1; d <= brief.days; d++) {
    let slots = per;
    // Arriving takes the morning; leaving takes the afternoon; a one-day trip loses both.
    if (d === 1) slots -= 1;
    if (d === brief.days) slots -= 1;
    // The day a town changes is half spent getting there.
    if (d > 1 && left === 0 && townIndex < towns - 1) { townIndex++; left = brief.nights[townIndex]?.nights ?? 0; slots -= 1; }
    out.push(Math.max(2, slots));
    left--;
  }
  return out;
}

/** Whole counts from shares, by largest remainder, so they sum to the total exactly. */
export function allot(total: number, shares: { key: string; share: number }[]): Record<string, number> {
  const sum = shares.reduce((a, s) => a + Math.max(0, s.share), 0);
  if (total <= 0 || sum <= 0 || shares.length === 0) return Object.fromEntries(shares.map((s) => [s.key, 0]));
  const exact = shares.map((s) => ({ key: s.key, exact: (total * Math.max(0, s.share)) / sum }));
  const out: Record<string, number> = {};
  let given = 0;
  for (const e of exact) { out[e.key] = Math.floor(e.exact); given += out[e.key]!; }
  const byRemainder = [...exact].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; given < total && i < byRemainder.length; i++, given++) out[byRemainder[i]!.key]! += 1;
  return out;
}

/** How strongly a save asks to be in the plan. */
export function scoreSave(s: WeaveSave, must: Set<string>): number {
  let score = 0;
  if (must.has(s.id)) score += 3;
  if (s.saveCount > 1) score += 2;
  if (s.noted) score += 2;
  if (s.reminded) score += 1;
  if (s.specific) score += 1;
  if (s.placed) score += 1;
  if (s.done) score -= 3;
  return score;
}

export interface Selection {
  chosen: WeaveSave[];
  leftOut: { id: string; reason: string }[];
  /** A kind the mix wants in a town, and how many stops it lacks there. */
  gaps: { town: string; kind: WeaveKind; want: number }[];
  /** Slots per day, for the skeleton. */
  slots: number[];
}

/**
 * The saves that get the room. Slots go to towns by nights and, within a town, to kinds by the
 * mix; each kind's candidates are taken by score, ties by recency. A must is always taken. A save
 * marked visited is kept out; one the person said to skip likewise; one the understanding stage
 * called unsure counts for nothing. Everything not taken is listed with its reason.
 */
export function selectStops(saves: WeaveSave[], profile: WeaveProfile, brief: WeaveBrief): Selection {
  const slots = slotsPerDay(brief);
  const total = slots.reduce((a, b) => a + b, 0);
  const must = new Set([...profile.must.map((m) => m.id), ...brief.must]);
  const skip = new Set(brief.skip);
  const unsure = new Set(profile.unsure);
  const leftOut: Selection["leftOut"] = [];
  const chosen: WeaveSave[] = [];
  const gaps: Selection["gaps"] = [];

  const usable = saves.filter((s) => {
    if (skip.has(s.id)) { leftOut.push({ id: s.id, reason: "you asked to leave it out" }); return false; }
    if (s.done) { leftOut.push({ id: s.id, reason: "already visited" }); return false; }
    if (unsure.has(s.id) && !must.has(s.id)) { leftOut.push({ id: s.id, reason: "looked like an ad or a montage" }); return false; }
    return true;
  });

  const nights = brief.nights.filter((n) => n.nights > 0);
  const totalNights = nights.reduce((a, n) => a + n.nights, 0) || 1;
  const townSlots = allot(total, nights.map((n) => ({ key: n.town, share: n.nights / totalNights })));
  const towns = new Set(nights.map((n) => n.town));
  const taken = new Set<string>();

  for (const town of nights.map((n) => n.town)) {
    const inTown = usable.filter((s) => s.town === town);
    const kindSlots = allot(townSlots[town] ?? 0, profile.mix.map((m) => ({ key: m.kind, share: m.share })));
    for (const m of profile.mix) {
      const want = kindSlots[m.kind] ?? 0;
      const candidates = inTown.filter((s) => s.kind === m.kind && !taken.has(s.id))
        .sort((a, b) => scoreSave(b, must) - scoreSave(a, must) || (b.savedAt > a.savedAt ? 1 : b.savedAt < a.savedAt ? -1 : 0));
      let got = 0;
      for (const c of candidates) {
        if (got < want || must.has(c.id)) { chosen.push(c); taken.add(c.id); got++; }
        else leftOut.push({ id: c.id, reason: "did not fit the days" });
      }
      if (got < want) gaps.push({ town, kind: m.kind, want: want - got });
    }
    // A kind outside the mix (share 0) still holds the person's musts, and nothing else.
    for (const s of inTown) {
      if (taken.has(s.id) || leftOut.some((l) => l.id === s.id)) continue;
      if (must.has(s.id)) { chosen.push(s); taken.add(s.id); }
      else leftOut.push({ id: s.id, reason: "not in the mix" });
    }
  }
  for (const s of usable) {
    if (taken.has(s.id) || leftOut.some((l) => l.id === s.id)) continue;
    leftOut.push({ id: s.id, reason: s.town && !towns.has(s.town) ? `${s.town} is not on this trip` : "no town found for it" });
  }
  return { chosen, leftOut, gaps, slots };
}
