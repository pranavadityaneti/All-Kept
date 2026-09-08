import type { LinkStartResponse } from "@allkept/contracts";
import { supabase } from "./supabase";

/** Asks the server for a fresh link code. The session token is attached by the client. */
export async function startInstagramLink(): Promise<LinkStartResponse> {
  const { data, error } = await supabase.functions.invoke<LinkStartResponse>("link-instagram", { method: "POST" });
  if (error) throw new Error(error.message);
  if (!data?.code || !data?.expiresAt) throw new Error("the server did not return a code");
  return data;
}
