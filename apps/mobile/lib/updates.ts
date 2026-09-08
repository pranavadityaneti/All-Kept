import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

/** How long a cold start waits for an update before showing the library anyway. */
const COLD_START_BUDGET_MS = 5_000;
/** Do not re-check more often than this when the app comes back to the foreground. */
const FOREGROUND_INTERVAL_MS = 60_000;

export interface OtaUpdates {
  /** False only while the very first check is still running, so a fresh build can apply at once. */
  ready: boolean;
  /** An update is downloaded and waiting for a restart. */
  pending: boolean;
  checking: boolean;
  error: string | null;
  /** Restarts into the downloaded update. */
  applyNow: () => void;
  /** Checks now; resolves to true when something was downloaded. */
  checkNow: () => Promise<boolean>;
  /** What this install is running, for the settings screen and for bug reports. */
  channel: string | null;
  updateId: string | null;
}

const enabled = Updates.isEnabled && !__DEV__;

async function fetchIfAvailable(): Promise<boolean> {
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const fetched = await Updates.fetchUpdateAsync();
  return fetched.isNew;
}

function withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Keeps the app on the newest published JavaScript without a new build.
 * On a cold start it waits briefly for an update and restarts into it, so a tester who reopens the
 * app is already up to date. After that it checks quietly when the app returns to the foreground and
 * leaves the restart to the person, so nothing is interrupted mid-task.
 */
export function useOtaUpdates(): OtaUpdates {
  const [ready, setReady] = useState(!enabled);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const runCheck = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    setChecking(true);
    setError(null);
    try {
      lastCheck.current = Date.now();
      const downloaded = await fetchIfAvailable();
      if (downloaded) setPending(true);
      return downloaded;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  // Cold start: apply immediately if an update is waiting, but never hold the app hostage to a
  // slow or missing network.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void withBudget(fetchIfAvailable().catch(() => false), COLD_START_BUDGET_MS, false).then(async (downloaded) => {
      if (!live) return;
      if (downloaded) {
        try {
          await Updates.reloadAsync();
          return; // the app restarts here
        } catch { /* fall through and show what we have */ }
      }
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (Date.now() - lastCheck.current < FOREGROUND_INTERVAL_MS) return;
      void runCheck();
    });
    return () => sub.remove();
  }, [runCheck]);

  const applyNow = useCallback(() => { void Updates.reloadAsync(); }, []);

  return {
    ready, pending, checking, error, applyNow, checkNow: runCheck,
    channel: Updates.channel ?? null,
    updateId: Updates.updateId ?? null,
  };
}
