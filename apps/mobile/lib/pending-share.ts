import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { chunkedSecureStore } from "./storage";
const KEY = "allkept.pending-share";
type Payload = { shareType: string; value: string };
let writes: Promise<void> = Promise.resolve();
/** Keep an incoming link through browser sign-in and an interrupted onboarding session. */
export async function pendingShare(): Promise<Payload[]> {
  try {
    const native = getSharedPayloads().filter((p) => (p.shareType === "url" || p.shareType === "text") && p.value.length <= 20_000).slice(0, 5);
    if (native.length) {
      writes = writes.then(() => chunkedSecureStore.setItem(KEY, JSON.stringify(native))).catch(() => undefined);
      await writes;
      return native;
    }
  } catch { /* Preview builds may not have the native receiver. */ }
  const saved = await chunkedSecureStore.getItem(KEY);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((p): p is Payload => typeof p === "object" && p !== null && typeof p.shareType === "string" && typeof p.value === "string") : [];
  } catch { return []; }
}
export async function clearPendingShare(): Promise<void> {
  try { clearSharedPayloads(); } catch { /* Preview builds. */ }
  writes = writes.then(() => chunkedSecureStore.removeItem(KEY)).catch(() => undefined);
  await writes;
}
