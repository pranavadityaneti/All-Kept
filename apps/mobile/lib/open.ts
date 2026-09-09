import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

/**
 * Opens a link without losing the person: Instagram and YouTube links go to their apps, since that
 * is where their account is, and everything else opens in a browser sheet inside Allkept with a
 * Done button, rather than handing them to Safari and hoping they come back.
 */
const NATIVE_HOSTS = /(^|\.)(instagram\.com|youtube\.com|youtu\.be)$/i;

export async function openLink(url: string): Promise<void> {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  try {
    const host = new URL(url).hostname;
    if (NATIVE_HOSTS.test(host)) { await Linking.openURL(url); return; }
  } catch { /* an address we cannot parse still deserves a try below */ }
  await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
    .catch(() => Linking.openURL(url));
}
