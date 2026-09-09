import type { ImportProgress, ImportSavesResponse } from "@allkept/contracts";
import { File } from "expo-file-system";
import { supabase } from "./supabase";

/** Matches the bucket's own limit. A "Saved" export is measured in kilobytes; anything near this is the wrong file. */
export const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

export type PickedExport = { file: File; name: string; size: number };

/**
 * A storage key we are willing to write. The person's file name reaches us from the phone's file
 * picker, so it is theirs to choose and not ours to trust: everything but plain characters goes,
 * which keeps the key one segment long and inside their own folder.
 */
export function storageKey(userId: string, fileName: string, now = Date.now()): string {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(-60);
  return `${userId}/${now}-${cleaned || "export.zip"}`;
}

/** True for the two things Meta hands out: the whole zip, or the one file from inside it. */
export function looksLikeExport(name: string): boolean {
  return /\.(zip|json)$/i.test(name.trim());
}

/** Opens the phone's file picker. null when the person backed out. */
export async function pickExport(): Promise<PickedExport | null> {
  const picked = await File.pickFileAsync();
  if (picked.canceled || !picked.result) return null;
  const file = picked.result;
  return { file, name: file.name, size: file.size };
}

/** Puts the file in the person's own folder and answers with its key. */
export async function uploadExport(userId: string, picked: PickedExport): Promise<string> {
  const path = storageKey(userId, picked.name);
  const body = await picked.file.arrayBuffer();
  const { error } = await supabase.storage.from("imports").upload(path, body, {
    contentType: picked.file.type || (picked.name.toLowerCase().endsWith(".json") ? "application/json" : "application/zip"),
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Clears an upload the server never got to read. Best effort: a leftover file is not worth an error. */
export async function removeUpload(path: string): Promise<void> {
  await supabase.storage.from("imports").remove([path]).then(() => undefined, () => undefined);
}

/**
 * The server's own words, when it sent any. supabase-js reports every non-2xx the same way, and
 * "non-2xx status code" tells the person nothing about the file they just picked.
 */
async function reasonFrom(error: unknown): Promise<string> {
  const context: unknown = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      const said = (body as { error?: unknown })?.error;
      if (typeof said === "string" && said) return said;
    } catch { /* not JSON: fall through to the generic message */ }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Reads the uploaded export. The saves are created empty; the server fills them in afterwards. */
export async function startImport(path: string): Promise<ImportSavesResponse> {
  const { data, error } = await supabase.functions.invoke<ImportSavesResponse>("import-saves", { method: "POST", body: { path } });
  if (error) throw new Error(await reasonFrom(error));
  if (!data) throw new Error("the server did not answer");
  return data;
}

/** How far along the import is. null when the run is not this person's, or has gone. */
export async function importProgress(importId: string): Promise<ImportProgress | null> {
  const { data, error } = await supabase.rpc("import_progress_v2", { import_id: importId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? (data[0] as ImportProgress | undefined) : (data as ImportProgress | null);
  return row ?? null;
}
