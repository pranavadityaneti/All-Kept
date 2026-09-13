/**
 * Paid in the US, free in India: the phone's side.
 *
 * The stores take the money and RevenueCat keeps the books; the server holds the one record every
 * door believes (my_entitlement() is what the phone may ask about itself). This file configures
 * RevenueCat with the person's own id so a subscription follows the account and not the phone,
 * reports which store the phone buys from, and turns the server's answer into what a screen shows.
 *
 * react-native-purchases is native. A build made before it was added has no module, so every call
 * is guarded on the module being present: the app keeps working, it just cannot sell anything
 * until the next build.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Linking, NativeModules, Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from "react-native-purchases";
import { FREE_SAVES } from "@allkept/contracts";
import { MANAGE_URL } from "./paywall";
import { regionFromLocale, standing, type EntitlementRow, type Standing } from "./standing";
import { supabase } from "./supabase";

export { regionFromLocale, standing, type EntitlementRow, type Standing } from "./standing";

const keys = (Constants.expoConfig?.extra as { revenuecat?: { ios?: string; android?: string } } | undefined)?.revenuecat;

/** True when the native module is in this build. Everything else here is a no-op without it. */
export const billingAvailable = (): boolean => !!NativeModules["RNPurchases"] && !!(Platform.OS === "ios" ? keys?.ios : keys?.android);

let configuredFor: string | null = null;

/** Identifies the customer to RevenueCat by the Supabase user id. Idempotent; safe on every foreground. */
export function configureBilling(userId: string): void {
  if (!billingAvailable() || configuredFor === userId) return;
  try {
    if (configuredFor === null) Purchases.configure({ apiKey: (Platform.OS === "ios" ? keys?.ios : keys?.android)!, appUserID: userId });
    else void Purchases.logIn(userId);
    configuredFor = userId;
  } catch { /* a build without the module, or a bad key: the app still works, it cannot sell */ }
}

/** Sign-out: the next person on this phone must not inherit a subscription. */
export async function logOutBilling(): Promise<void> {
  if (!billingAvailable() || configuredFor === null) return;
  configuredFor = null;
  await Purchases.logOut().catch(() => undefined);
}

/**
 * Which store this phone buys from, as the store itself says — the country of the store account,
 * not the IP and not the SIM. Recorded on the profile, where the server reads it. Falls back to
 * the locale's region on a build without the module.
 */
export async function reportStorefront(): Promise<string | null> {
  let code: string | null = null;
  if (billingAvailable()) {
    try { code = (await Purchases.getStorefront())?.countryCode?.toUpperCase() ?? null; } catch { code = null; }
  }
  if (!code) code = regionFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  if (!code) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return code;
  await supabase.from("profiles").update({ storefront: code, storefront_at: new Date().toISOString() }).eq("user_id", user.id);
  return code;
}

export const entitlementKey = ["entitlement"] as const;

export function useEntitlement(userId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: entitlementKey,
    enabled: !!userId,
    queryFn: async (): Promise<Standing> => {
      const { data, error } = await supabase.rpc("my_entitlement");
      if (error) throw new Error(error.message);
      const row = (data as EntitlementRow[] | null)?.[0];
      return standing(row ?? { entitled: true, storefront: null, saves_used: 0, free_saves: FREE_SAVES, status: null, will_renew: null, current_period_end: null, product_id: null }, new Date());
    },
  });
  // The moment RevenueCat knows of a purchase, ask the server again: the webhook lands within
  // seconds, and the person is watching the button.
  useEffect(() => {
    if (!userId || !billingAvailable()) return;
    const listener = (_info: CustomerInfo) => { void queryClient.invalidateQueries({ queryKey: entitlementKey }); };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [userId, queryClient]);
  return query;
}

/** What is for sale on this store, with the store's own localised prices. Empty where nothing is — India. */
export function useOfferings(enabled: boolean) {
  return useQuery({
    queryKey: ["offerings"],
    enabled: enabled && billingAvailable(),
    queryFn: async (): Promise<PurchasesOfferings> => Purchases.getOfferings(),
  });
}

export function usePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: PurchasesPackage): Promise<CustomerInfo> => (await Purchases.purchasePackage(pkg)).customerInfo,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: entitlementKey }); },
  });
}

/** What the store has on file for this account. Its entitlements say whether there was anything to restore. */
export function useRestore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<CustomerInfo> => Purchases.restorePurchases(),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: entitlementKey }); },
  });
}

/**
 * Whether the share sheet's queue is held up by a refused save. Set by whoever last flushed the
 * queue, read by the home screen; kept in the query cache so every screen sees the same answer
 * and the answer survives a relaunch until the next flush corrects it.
 */
export const shareQueueKey = ["share-queue-blocked"] as const;
export const setShareQueueBlocked = (queryClient: QueryClient, blocked: boolean): void => { queryClient.setQueryData(shareQueueKey, blocked); };
export function useShareQueueBlocked(): boolean {
  return useQuery({ queryKey: shareQueueKey, queryFn: () => false, staleTime: Infinity }).data ?? false;
}

/**
 * The store's own subscriptions page, opened by the system rather than in a web sheet: the App
 * Store URL is one iOS routes to its subscription settings, and a browser sheet would only show
 * a sign-in page.
 */
export function openManageSubscription(): void {
  void Linking.openURL(MANAGE_URL[Platform.OS === "android" ? "android" : "ios"]).catch(() => undefined);
}

export const userCancelled = (e: unknown): boolean => !!(e as { userCancelled?: boolean } | null)?.userCancelled;
