// Where the sign-up pills post. Read on the server (page.tsx) and handed to the form as props, so
// the browser bundle never depends on how the host inlines env — the same shape works under
// vinext today and a standard Next build on Vercel.
export type WaitlistConfig = { endpoint: string; anonKey: string } | null;

export function waitlistConfig(): WaitlistConfig {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { endpoint: `${url}/functions/v1/waitlist`, anonKey };
}
