import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { CategoryMark } from "../components/CategoryMark";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { billingAvailable, entitlementKey, openManageSubscription, setShareQueueWaiting, useEntitlement, useOfferings, usePurchase, useRestore, userCancelled, useShareQueueWaiting } from "../lib/billing";
import type { MarkKey } from "../lib/category-marks";
import { track, useTrackOnce } from "../lib/metrics";
import { openLink } from "../lib/open";
import { disclosure, plansFrom, PRIVACY_URL, shortDate, standingCard, subscriptionRow, TERMS_URL, type Plan } from "../lib/paywall";
import { useSession } from "../lib/session";
import { flushShareQueue } from "../lib/share-save";
import { font, radius, space, type, usePalette } from "../lib/theme";

/**
 * The paywall, at the twenty-sixth save.
 *
 * What a subscription buys is that everything carries on: the four things listed are what the
 * free saves already did, and what stops at twenty-five. Every price on this screen came from the
 * store a moment ago — nothing is written down here — and the yearly card works its own saving
 * out from the two prices. The stores' words about renewing and cancelling are said plainly, the
 * back gesture always works, and the library behind this screen is never locked.
 */
const KEEPS: { mark: MarkKey; title: string; detail: string }[] = [
  { mark: "bookmark", title: "Save without a cap", detail: "Paste it, share it, DM it — every link lands." },
  { mark: "multiple-stars", title: "Sorted as it lands", detail: "Filed into a category before you go looking." },
  { mark: "lightbulb", title: "Found by what it was about", detail: "Search by meaning, not only by the words." },
  { mark: "chat-bubble-text-square", title: "The doors stay open", detail: "Instagram DMs and YouTube playlists keep coming in." },
];

/** How long to wait for the server to hear from the store before saying so. The webhook usually lands in seconds. */
const CONFIRM_FOR_MS = 30_000;
const CONFIRM_EVERY_MS = 2_000;
/** After saying so, the asking goes on more slowly for as long as the screen is open — a late webhook still lands. */
const RECHECK_EVERY_MS = 10_000;

type Phase = "offer" | "confirming" | "done" | "unconfirmed";

export default function Subscribe() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const userId = session.status === "ready" ? session.userId : null;
  const queryClient = useQueryClient();
  const platform = Platform.OS === "android" ? "android" : "ios";
  const available = billingAvailable();
  const entitlement = useEntitlement(userId);
  const standing = entitlement.data;
  const waiting = useShareQueueWaiting();
  const offerings = useOfferings(available);
  const current = offerings.data?.current ?? null;
  const plans = plansFrom(current);
  const [chosen, setChosen] = useState<Plan["id"]>("yearly");
  const selected = plans.find((plan) => plan.id === chosen) ?? plans[0] ?? null;
  const purchase = usePurchase();
  const restore = useRestore();
  const [phase, setPhase] = useState<Phase>("offer");
  const via = useRef<"purchase" | "restore">("purchase");
  useTrackOnce(userId, "paywall_open");

  // The store said yes; now the server has to hear it from RevenueCat, because the server is what
  // admits the next save. Asked every couple of seconds, told the truth if it takes too long, and
  // still asked — more slowly — for as long as the screen stays open after that.
  useEffect(() => {
    if (phase !== "confirming" && phase !== "unconfirmed") return;
    const timer = setInterval(() => { void queryClient.invalidateQueries({ queryKey: entitlementKey }); }, phase === "confirming" ? CONFIRM_EVERY_MS : RECHECK_EVERY_MS);
    const giveUp = phase === "confirming" ? setTimeout(() => setPhase((current) => (current === "confirming" ? "unconfirmed" : current)), CONFIRM_FOR_MS) : null;
    return () => { clearInterval(timer); if (giveUp) clearTimeout(giveUp); };
  }, [phase, queryClient]);
  useEffect(() => {
    if (phase !== "confirming" && phase !== "unconfirmed") return;
    if (standing?.kind !== "subscribed" && standing?.kind !== "billing_issue") return;
    setPhase("done");
    track(userId, "subscribed", { via: via.current, product: standing.product ?? "" });
    // Whatever the share sheet queued while the door was shut goes through now.
    void flushShareQueue(queryClient).then((r) => setShareQueueWaiting(queryClient, r.waiting)).catch(() => undefined);
  }, [phase, standing, userId, queryClient]);

  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };

  const buy = async () => {
    const pkg = selected?.id === "yearly" ? current?.annual : current?.monthly;
    if (!pkg) return;
    try {
      await purchase.mutateAsync(pkg);
      via.current = "purchase";
      setPhase("confirming");
    } catch (e) {
      if (userCancelled(e)) return;
      Alert.alert("The purchase didn't go through", (e as { message?: string } | null)?.message ?? "Nothing was charged. Please try again.");
    }
  };

  const restoreNow = async () => {
    try {
      const info = await restore.mutateAsync();
      if (Object.keys(info.entitlements.active).length === 0) {
        Alert.alert("Nothing to restore", `No Allkept subscription was found on this ${platform === "android" ? "Google account" : "Apple Account"}.`);
        return;
      }
      via.current = "restore";
      setPhase("confirming");
    } catch (e) {
      Alert.alert("Couldn't restore", (e as { message?: string } | null)?.message ?? "Please try again.");
    }
  };

  const storeName = platform === "android" ? "Google Play" : "the App Store";
  const Store = platform === "android" ? "Google Play" : "The App Store";
  const now = new Date();

  // What the top of the screen says depends on why the person is here.
  const intro = (() => {
    if (phase === "done") return { title: "You're all set", body: "Thank you. Saving carries on exactly as before — there is nothing to set up." };
    if (phase === "confirming") return { title: "Confirming your subscription…", body: `${Store} said yes. Allkept is being told — this takes a few seconds.` };
    if (phase === "unconfirmed") return { title: "Payment went through", body: "Your subscription is still being confirmed, which can take a minute. Saving works the moment it is — nothing more to do." };
    if (standing?.kind === "subscribed") return { title: "You're subscribed", body: subscriptionRow(standing, now)?.detail ?? "Subscribed" };
    if (standing?.kind === "billing_issue") return { title: "Payment problem", body: `${Store} couldn't charge your card. Update it in your subscriptions and saving carries on.` };
    if (standing?.kind === "free_region") return { title: "Allkept is free where you are", body: "There is nothing to buy. Keep saving." };
    if (standing?.kind === "complimentary") return { title: "Saving is on the house", body: `Complimentary access until ${shortDate(standing.until, now)}. There is nothing to buy until then.` };
    if (standing?.kind === "blocked") {
      // Someone who has seen the product is told what ended and what is waiting, not pitched to.
      const card = standingCard(standing, waiting, now);
      if (standing.lapsed && card) return { title: card.title, body: `${card.body} Renew and saving carries on.` };
      return { title: "Keep saving", body: `You've used your 25 free saves. Everything you saved is still here${waiting > 0 ? `, and ${waiting} shared ${waiting === 1 ? "link is" : "links are"} waiting to be filed` : ""} — subscribe to keep adding to it.` };
    }
    if (standing?.kind === "ramp") return { title: "Keep saving", body: `${standing.left} of your ${standing.of} free saves are still yours. After those, saving needs a subscription.` };
    return { title: "Keep saving", body: "After 25 free saves, saving needs a subscription. Everything you have saved stays yours either way." };
  })();

  const settled = phase === "done" || phase === "unconfirmed" || standing?.kind === "subscribed" || standing?.kind === "billing_issue" || standing?.kind === "free_region" || standing?.kind === "complimentary";
  const showOffer = phase === "offer" && !settled;
  // The four rows pitch the product; a lapsed subscriber has used it, so they go straight to the cards.
  const showKeeps = (showOffer && !(standing?.kind === "blocked" && standing.lapsed)) || phase === "done";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.bar}>
        <IconButton name="close" label="Close" tone="plain" onPress={close} />
      </View>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={[type.title, { color: p.ink }]}>{intro.title}</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>{intro.body}</Text>
        </View>

        {phase === "confirming" && <ActivityIndicator color={p.accent} />}

        {showKeeps && (
          <View style={[styles.keeps, { backgroundColor: p.surface, borderColor: p.border }]}>
            {KEEPS.map((k, i) => (
              <View key={k.title} style={[styles.keep, i < KEEPS.length - 1 && { borderBottomColor: p.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <CategoryMark mark={k.mark} size={36} />
                <View style={styles.keepText}>
                  <Text style={[type.label, styles.keepTitle, { color: p.ink }]}>{k.title}</Text>
                  <Text style={[type.label, { color: p.inkMuted }]}>{k.detail}</Text>
                </View>
                <Icon name="check" size={20} color={p.accent} />
              </View>
            ))}
          </View>
        )}

        {showOffer && !available && (
          <Text style={[type.body, styles.centeredText, { color: p.inkMuted }]}>
            Subscriptions aren't in this version of Allkept yet. Update the app from {storeName} to subscribe.
          </Text>
        )}

        {showOffer && available && offerings.isPending && (
          <View style={styles.centered}><ActivityIndicator color={p.accent} /><Text style={[type.label, { color: p.inkMuted }]}>Loading prices from {storeName}…</Text></View>
        )}

        {showOffer && available && !offerings.isPending && plans.length === 0 && (
          <View style={styles.centered}>
            <Text style={[type.body, styles.centeredText, { color: p.inkMuted }]}>Couldn't load prices from {storeName}. Check your connection and try again.</Text>
            <Button label="Try again" variant="secondary" onPress={() => { void offerings.refetch(); }} />
          </View>
        )}

        {showOffer && plans.length > 0 && selected && (
          <View style={styles.offer}>
            <View style={styles.cards}>
              {plans.map((plan) => {
                const on = plan.id === selected.id;
                return (
                  <Pressable
                    key={plan.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${plan.id === "yearly" ? "Yearly" : "Monthly"}, ${plan.price}${plan.id === "yearly" ? ` a year, ${plan.perMonth} a month` : " a month"}`}
                    onPress={() => setChosen(plan.id)}
                    style={[styles.card, { backgroundColor: on ? p.accentSoft : p.surface, borderColor: on ? p.accent : p.border }]}
                  >
                    {plan.savings !== null && (
                      <View style={styles.badgeWrap}>
                        <View style={[styles.badge, { backgroundColor: p.accent }]}><Text style={[styles.badgeText, { color: p.accentInk }]}>Save {plan.savings}%</Text></View>
                      </View>
                    )}
                    <Text style={[type.label, { color: p.inkMuted }]}>{plan.id === "yearly" ? "Yearly" : "Monthly"}</Text>
                    <Text style={[type.section, { color: p.ink }]}>{plan.price}</Text>
                    <Text style={[type.label, { color: p.inkMuted }]}>{plan.id === "yearly" ? `${plan.perMonth} per month` : "per month"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[type.label, styles.centeredText, { color: p.ink }]}>
              {selected.id === "yearly" ? `${selected.perMonth} per month, billed ${selected.price} yearly.` : `${selected.price} per month, billed monthly.`}
            </Text>
            <Text style={[styles.fine, styles.centeredText, { color: p.inkMuted }]}>{disclosure(platform)}</Text>
            <Button label={`${standing?.kind === "blocked" && standing.lapsed ? "Renew" : "Subscribe"} ${selected.id === "yearly" ? "yearly" : "monthly"}`} busy={purchase.isPending} disabled={restore.isPending} onPress={() => { void buy(); }} />
          </View>
        )}

        {phase === "offer" && (standing?.kind === "subscribed" || standing?.kind === "billing_issue") && (
          <>
            <Button label="Manage subscription" onPress={openManageSubscription} />
            <Button label="Done" variant="secondary" onPress={close} />
          </>
        )}
        {(phase === "done" || phase === "unconfirmed" || standing?.kind === "free_region") && (
          <Button label={phase === "done" ? "Keep saving" : "Done"} onPress={close} />
        )}

        {showOffer && (
          <View style={styles.footer}>
            <Pressable accessibilityRole="link" onPress={() => { void openLink(TERMS_URL); }}><Text style={[styles.fine, { color: p.inkMuted }]}>Terms</Text></Pressable>
            <Text style={[styles.fine, { color: p.inkMuted }]}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => { void openLink(PRIVACY_URL); }}><Text style={[styles.fine, { color: p.inkMuted }]}>Privacy</Text></Pressable>
            <Text style={[styles.fine, { color: p.inkMuted }]}>·</Text>
            <Pressable accessibilityRole="button" disabled={!available || restore.isPending} onPress={() => { void restoreNow(); }}>
              <Text style={[styles.fine, { color: p.inkMuted, opacity: available ? 1 : 0.5 }]}>{restore.isPending ? "Restoring…" : "Restore purchases"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.md, paddingTop: space.sm },
  page: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xl },
  intro: { gap: space.sm },
  keeps: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg },
  keep: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  keepText: { flex: 1, gap: 2 },
  keepTitle: { ...font("700") },
  offer: { gap: space.md },
  cards: { flexDirection: "row", gap: space.md, paddingTop: space.sm },
  card: { flex: 1, borderRadius: radius.lg, borderWidth: 2, paddingHorizontal: space.md, paddingVertical: space.lg, alignItems: "center", gap: 2 },
  badgeWrap: { position: "absolute", top: -12, left: 0, right: 0, alignItems: "center" },
  badge: { paddingHorizontal: space.md, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 12, ...font("700") },
  centered: { alignItems: "center", gap: space.sm },
  centeredText: { textAlign: "center" },
  fine: { fontSize: 13, ...font("400"), lineHeight: 18 },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
});
