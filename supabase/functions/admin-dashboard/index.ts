import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { createHandler } from "./handler.ts";
Deno.serve(
  createHandler({
    origins: (Deno.env.get("ADMIN_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    userId: userIdFromRequest,
    rpc: async (name, args) => {
      const { data, error } = await adminClient().rpc(name, args);
      return { data, error };
    },
  }),
);
