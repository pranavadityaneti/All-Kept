// Deciding what a playlist has gained since we last looked, and when to look again.
import type { CaptureInput } from "../_shared/contracts.ts";

export interface PlaylistEntry {
  /** The playlist entry's own id, stable per (playlist, video), which is what makes a capture idempotent. */
  itemId: string;
  videoId: string;
  title: string | null;
  /** When it was put in the playlist, which is when the person saved it. */
  addedAt: string | null;
}

export interface Source {
  id: string;
  userId: string;
  playlistId: string;
  /**
   * How many videos there were the last time *we read the playlist through*, which is not the same
   * as how many YouTube says there are. Registering a playlist learns the size without capturing
   * anything, so the two must stay separate or the first poll decides it has nothing to do.
   */
  syncedCount: number | null;
}

/** Polls back off when nothing changes and quicken when something does, within these bounds. */
export const MIN_INTERVAL_MS = 15 * 60 * 1000;
export const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The next time to look. A playlist someone is actively filling gets checked often; one that has
 * not moved in a week gets checked daily. Quota is the reason: every account shares one key.
 */
export function nextPollAt(now: Date, previousIntervalMs: number | null, foundSomething: boolean): Date {
  const previous = previousIntervalMs && previousIntervalMs >= MIN_INTERVAL_MS ? previousIntervalMs : MIN_INTERVAL_MS;
  const next = foundSomething ? MIN_INTERVAL_MS : Math.min(previous * 2, MAX_INTERVAL_MS);
  return new Date(now.getTime() + next);
}

/**
 * Whether the playlist is worth reading in full.
 *
 * Asking how many videos a playlist holds costs one unit; reading it costs one per fifty. So the
 * count is the cheap gate. It misses the case where someone adds one video and removes another
 * between polls, which the next real change picks up.
 */
export function needsFullRead(syncedCount: number | null, currentCount: number): boolean {
  return syncedCount === null || syncedCount !== currentCount;
}

/** Playlist entries turned into captures, newest save first, private and deleted videos dropped. */
export function toCaptures(source: Source, entries: PlaylistEntry[], now: Date): CaptureInput[] {
  return entries
    // A video pulled from YouTube, or made private after it was saved, keeps its playlist entry but
    // loses its id. There is nothing left to show, so there is nothing to capture.
    .filter((e) => e.videoId && e.itemId)
    .map((e) => ({
      userId: source.userId,
      sourceId: source.id,
      sourceKind: "youtube_playlist" as const,
      sourceEventId: e.itemId,
      savedAt: e.addedAt ?? now.toISOString(),
      sharedUrl: `https://www.youtube.com/watch?v=${e.videoId}`,
      // A video's title is its title, not its caption: caption becomes the item's body text,
      // which for YouTube stays empty until enrichment reads the description.
      ...(e.title ? { title: e.title } : {}),
    }));
}
