import type { ListData, Overview, Params, Row } from "./api";
const ago = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString();
const people = [
  "Alex Morgan",
  "Jordan Lee",
  "Sam Rivera",
  "Riley Chen",
  "Taylor Brooks",
  "Charlie Park",
  "Avery Singh",
  "Jamie Wilson",
];
const platforms = ["instagram", "youtube", "web", "tiktok", "reddit", "x"];
const rows: Record<string, Row[]> = {
  users: people.map((name, i) => ({
    id: `demo-user-${i}`,
    name,
    email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
    is_anonymous: false,
    created_at: ago(i + 1),
    last_sign_in_at: ago(i / 10),
    onboarding_completed_at: i === 5 ? null : ago(i + 1),
    saves: 42 + i * 13,
    gender: "prefer_not_to_say",
    gender_custom: null,
    phone: null,
    sources: 2,
  })),
  processing: [
    "A little weekend inspiration",
    "The art of slowing down",
    "A recipe worth keeping",
    "Your next rabbit hole",
    "Build something you love",
  ].map((title, i) => ({
    id: `demo-item-${i}`,
    title,
    email: "alex@example.com",
    platform: platforms[i]!,
    status: i === 0 ? "failed" : "ready",
    classification_status: i < 3 ? "failed" : "retry_wait",
    enrich_attempts: 3,
    classification_attempts: 5,
    updated_at: ago(0.02 + i / 100),
    error:
      i === 0
        ? "Preview provider timed out"
        : "Classification provider temporarily unavailable",
    can_retry: true,
  })),
  sources: people
    .slice(0, 6)
    .map((name, i) => ({
      id: `demo-source-${i}`,
      email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
      kind: i % 2 ? "youtube_playlist" : "instagram_dm",
      handle: `@${name.split(" ")[0]!.toLowerCase()}`,
      status: i === 3 ? "unreadable" : "active",
      last_seen_at: ago(0.1),
      last_polled_at: i % 2 ? ago(0.02) : null,
      created_at: ago(i + 1),
    })),
  imports: people
    .slice(0, 4)
    .map((name, i) => ({
      id: `demo-import-${i}`,
      email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
      source: "instagram_export",
      found: 150 + i * 23,
      added: 142 + i * 23,
      skipped: 8,
      error: null,
      created_at: ago(i + 1),
      finished_at: ago(i + 0.9),
      unfinished: i === 0 ? 12 : 0,
      failed: 0,
    })),
  activity: Array.from({ length: 32 }, (_, i) => ({
    id: `demo-event-${i}`,
    action: [
      "open_original",
      "paste_link",
      "search",
      "retry_queued",
      "library_view",
    ][i % 5]!,
    email: `${people[i % people.length]!.split(" ")[0]!.toLowerCase()}@example.com`,
    created_at: ago(i / 40),
    target: i % 5 === 3 ? "demo-item-0" : null,
    origin: i % 5 === 3 ? "Admin" : "App",
  })),
};
export async function demoRequest<T>(
  action: string,
  params: Params = {},
): Promise<T> {
  if (action === "overview") {
    const days = params.days ?? 30;
    return {
      users: 1284,
      new_users: days === 7 ? 63 : 218,
      saves: 18642,
      new_saves: days === 7 ? 1240 : 4826,
      active_users: days === 7 ? 342 : 786,
      attention: 5,
      series: Array.from({ length: days }, (_, i) => ({
        day: ago(days - i - 1).slice(0, 10),
        saves: Math.round(80 + i * 2 + Math.sin(i * 1.9) * 30),
      })),
      platforms: [
        { platform: "instagram", count: 2413 },
        { platform: "youtube", count: 1255 },
        { platform: "web", count: 676 },
        { platform: "tiktok", count: 290 },
        { platform: "reddit", count: 145 },
        { platform: "x", count: 47 },
      ],
    } satisfies Overview as T;
  }
  if (action === "user")
    return rows.users!.find((r) => r.id === params.id) as T;
  if (action === "retry") throw new Error("Retries are disabled in demo mode.");
  let filtered = (rows[action] ?? []).filter(
    (r) =>
      !params.q ||
      Object.values(r).some((v) =>
        String(v).toLowerCase().includes(params.q!.toLowerCase()),
      ),
  );
  if (action === "processing" && params.status === "failed")
    filtered = filtered.filter(
      (r) => r.status === "failed" || r.classification_status === "failed",
    );
  const start = ((params.page ?? 1) - 1) * 25;
  return {
    rows: filtered.slice(start, start + 25),
    total: filtered.length,
  } satisfies ListData as T;
}
