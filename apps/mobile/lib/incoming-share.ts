import { saveLink } from "@allkept/normalize";

/** Read the URL itself; resolving it first can replace a permalink with a login redirect. */
export function incomingLink(payloads: { shareType: string; value: string }[]): string | null {
  const links = new Set(payloads.filter((p) => p.shareType === "url" || p.shareType === "text")
    .map((p) => { const link = saveLink(p.value); return link?.canonicalUrl ?? link?.sourceUrl; }).filter((url): url is string => !!url));
  return links.size === 1 ? [...links][0]! : null;
}

export function shareRoute(path: string): string {
  try { return new URL(path).hostname === "expo-sharing" ? "/save?incoming=1" : path; }
  catch { return path; } // Leave ordinary relative routes and auth callbacks to Expo Router.
}
