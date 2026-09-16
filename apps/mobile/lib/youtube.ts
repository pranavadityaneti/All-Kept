import type { YoutubeRegisterResponse } from "@allkept/contracts";
import { serverSaid } from "./function-error";
import { supabase } from "./supabase";

/**
 * The server's own words, when it sent any. supabase-js reports every non-2xx the same way, and
 * "non-2xx status code" tells nobody why their playlist was refused.
 */
async function reason(error: unknown): Promise<string> {
  const said = await serverSaid(error);
  if (said?.error) return said.error;
  return error instanceof Error ? error.message : String(error);
}

/** Starts watching a playlist. Throws with the server's explanation when it will not take it. */
export async function connectPlaylist(playlistUrl: string): Promise<YoutubeRegisterResponse> {
  const { data, error } = await supabase.functions.invoke<YoutubeRegisterResponse>("youtube-register", { body: { playlistUrl } });
  if (error) throw new Error(await reason(error));
  if (!data) throw new Error("The server did not answer. Try again in a moment.");
  return data;
}
