import { createClient } from "@supabase/supabase-js";
export type Page =
  | "overview"
  | "users"
  | "processing"
  | "sources"
  | "imports"
  | "activity";
export type Row = {
  id: string;
  [key: string]: string | number | boolean | null;
};
export type ListData = { rows: Row[]; total: number };
export type Overview = {
  users: number;
  new_users: number;
  saves: number;
  new_saves: number;
  active_users: number;
  attention: number;
  series: { day: string; saves: number }[];
  platforms: { platform: string; count: number }[];
};
export type Params = {
  q?: string;
  page?: number;
  days?: number;
  status?: string;
  id?: string;
  request_id?: string;
};
export type Role = "viewer" | "operator";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const configured = Boolean(url && key);
export const demoEnabled = import.meta.env.VITE_ADMIN_DEMO === "true";
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  action: string,
  params: Params = {},
): Promise<T> {
  if (!supabase)
    throw new ApiError(
      "Configure the Supabase connection to use live data.",
      503,
    );
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) throw new ApiError("Please sign in again.", 401);
  const response = await fetch(`${url}/functions/v1/admin-dashboard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key!,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok)
    throw new ApiError(
      body?.error ?? "The admin service is unavailable. Try again.",
      response.status,
    );
  return body as T;
}
export const readable = (value: unknown) =>
  String(value ?? "—").replaceAll("_", " ");
export const formatNumber = (n: unknown) => Number(n ?? 0).toLocaleString();
export function formatDate(value: unknown, withTime = false): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? { timeZone: "UTC" } : {}),
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(date);
}
