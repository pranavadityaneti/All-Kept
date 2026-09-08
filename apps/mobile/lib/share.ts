import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

/**
 * Shares a save the way its content allows: a link goes through the normal share sheet, and a post
 * Instagram sent without a link is shared as the picture plus its caption.
 */
export async function shareItem(input: { url: string | null; title: string; thumbnailUrl?: string }): Promise<"shared" | "unavailable"> {
  if (input.url) {
    await Share.share({ message: input.title, url: input.url }, { subject: input.title });
    return "shared";
  }
  if (input.thumbnailUrl && (await Sharing.isAvailableAsync())) {
    const target = `${FileSystem.cacheDirectory ?? ""}allkept-share.jpg`;
    const { uri } = await FileSystem.downloadAsync(input.thumbnailUrl, target);
    await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: input.title, UTI: "public.jpeg" });
    return "shared";
  }
  await Share.share({ message: input.title });
  return "shared";
}
