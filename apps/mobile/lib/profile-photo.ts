import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";

export async function pickProfilePhoto(userId: string): Promise<string | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (selected.canceled || !selected.assets[0]) return null;
  const asset = selected.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  const size = Math.min(asset.width, asset.height);
  context.crop({ originX: Math.max(0, Math.floor((asset.width - size) / 2)), originY: Math.max(0, Math.floor((asset.height - size) / 2)), width: size, height: size });
  context.resize({ width: Math.min(size, 512) });
  const image = await context.renderAsync();
  try {
    const output = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const folder = new Directory(Paths.document, "profile-drafts");
    folder.create({ intermediates: true, idempotent: true });
    const file = new File(folder, `${userId}-${Date.now()}.jpg`);
    new File(output.uri).copy(file);
    if (file.size > 2 * 1024 * 1024) { file.delete(); throw new Error("Choose a smaller profile photo."); }
    return file.uri;
  } finally { image.release(); context.release(); }
}
export function removeDraftPhoto(uri: string | null): void {
  if (!uri || !uri.startsWith(new Directory(Paths.document, "profile-drafts").uri.replace(/\/$/, "") + "/")) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* A cached draft can be cleaned up on a later attempt. */ }
}
export async function photoBytes(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  if (!file.exists) throw new Error("That photo is no longer on this phone. Please choose it again.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a smaller profile photo.");
  return file.arrayBuffer();
}

export function clearProfilePhotos(userId: string): void {
  try {
    const folder = new Directory(Paths.document, "profile-drafts");
    if (folder.exists) for (const file of folder.list()) if (file instanceof File && file.name.startsWith(`${userId}-`)) file.delete();
  } catch { /* Account deletion succeeds even if a local cached file is already gone. */ }
}
