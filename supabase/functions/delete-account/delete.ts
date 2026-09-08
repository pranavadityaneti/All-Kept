// Account deletion: forgets everything Allkept holds for one person, in an order that stays safe to retry. Pure; storage, database and auth are injected.

export const USER_TABLES = ["replies", "captures", "item_ai", "items", "link_codes", "connected_sources", "profiles"] as const;
export type UserTable = (typeof USER_TABLES)[number];

export interface DeleteDeps {
  /** Every linked door, so their platform ids can be forgotten too. */
  listSources(userId: string): Promise<{ kind: string; externalId: string }[]>;
  /** Full object paths of the person's stored thumbnails. */
  listThumbnails(userId: string): Promise<string[]>;
  removeThumbnails(paths: string[]): Promise<void>;
  /** Raw webhook events and outbound replies are keyed by the Instagram id, not by user; delete them by that id. */
  forgetIgsids(igsids: string[]): Promise<{ events: number; replies: number }>;
  deleteRows(table: UserTable, userId: string): Promise<number>;
  deleteAuthUser(userId: string): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

export interface DeleteSummary { thumbnails: number; events: number; replies: number; items: number; sources: number }

const REMOVE_BATCH = 100;

/**
 * Order matters: storage and id-keyed rows first (nothing cascades to them), then the person's rows children-first,
 * and the login last, so a failure anywhere leaves a token that can simply retry.
 */
export async function deleteAccount(userId: string, deps: DeleteDeps): Promise<DeleteSummary> {
  const sources = await deps.listSources(userId);
  const igsids = sources.filter((s) => s.kind === "instagram_dm").map((s) => s.externalId);

  const paths = await deps.listThumbnails(userId);
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) await deps.removeThumbnails(paths.slice(i, i + REMOVE_BATCH));

  const forgotten = igsids.length ? await deps.forgetIgsids(igsids) : { events: 0, replies: 0 };

  const counts: Partial<Record<UserTable, number>> = {};
  for (const table of USER_TABLES) counts[table] = await deps.deleteRows(table, userId);

  await deps.deleteAuthUser(userId);

  const summary: DeleteSummary = { thumbnails: paths.length, events: forgotten.events, replies: forgotten.replies + (counts.replies ?? 0), items: counts.items ?? 0, sources: counts.connected_sources ?? 0 };
  deps.log("account deleted", { user: userId, ...summary });
  return summary;
}
