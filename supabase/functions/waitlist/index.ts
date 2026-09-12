// POST { email, source?, website? }: adds an address to the launch waitlist. Public — see handler.ts.
import { adminClient, env } from "../_shared/supabase.ts";
import { createHandler } from "./handler.ts";
import { realDeps } from "./deps.ts";

// The site's origins. WAITLIST_ORIGINS (comma-separated) extends the list — e.g. a Vercel preview —
// without a code change.
const origins = [
  "https://www.allkept.app",
  "https://allkept.app",
  "http://localhost:3000",
  ...(Deno.env.get("WAITLIST_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

Deno.serve(createHandler(realDeps(adminClient(), env("WAITLIST_IP_SALT"), origins)));
