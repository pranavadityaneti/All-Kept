import { createClient } from "npm:@supabase/supabase-js@2";
import { env, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import { cachedQueryEmbedder, embedder } from "../_shared/embeddings.ts";
import { handleSearch } from "./handler.ts";

const key = Deno.env.get("OPENAI_API_KEY")?.trim();
const queryEmbed = key ? cachedQueryEmbedder(embedder(key)) : null;

Deno.serve(async (req) => {
  try {
    return await handleSearch(req, {
      authenticate: async (request) => !!await userIdFromRequest(request),
      embed: queryEmbed,
      async query(request, args) {
        // Run as the caller, so both RLS and auth.uid() scope every search to their own library.
        const db = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
          global: { headers: { Authorization: request.headers.get("authorization")! } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await db.rpc("search_library", args);
        if (error) throw error;
        return data ?? [];
      },
    });
  } catch {
    return apiError("internal", "could not search your library");
  }
});
