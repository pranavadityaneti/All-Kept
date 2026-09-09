// Shared contracts between the mobile app and the Edge Functions. Copied into supabase/functions/_shared by scripts/sync-shared.mjs.
export type { Platform, Kind, NormalizedLink } from "@allkept/normalize";
import type { Platform, Kind } from "@allkept/normalize";

/** Doors through which saves arrive. */
export type SourceKind = "instagram_dm" | "youtube_playlist";
export type CapturedVia = SourceKind | "share";
export type SourceStatus = "active" | "disconnected" | "unreadable";
export type ItemStatus = "pending" | "ready" | "preview_unavailable" | "no_link" | "failed";
export type ClassificationStatus = "queued" | "processing" | "ready" | "retry_wait" | "failed";
export type ClientOs = "ios" | "android";

export const CATEGORIES = [
  "Food & recipes", "Fitness & health", "Travel & places", "Learning & how-to", "Tech & tools",
  "Money & career", "Design & inspiration", "Fashion & shopping", "Entertainment", "Humour & memes",
  "Quotes & motivation", "News & opinion", "People & personal", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ENTITY_TYPES = ["place", "product", "recipe", "tool", "person", "brand", "other"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ACTIONABILITY = ["watch", "try", "buy", "go", "read", "reference", "none"] as const;
export type Actionability = (typeof ACTIONABILITY)[number];

/** What makes two captures the same item: the platform's own id when there is one, else the canonical URL. */
export interface ItemIdentity {
  platform: Platform;
  externalId: string | null;
  canonicalUrl: string | null;
}

/** What any door hands to the capture module. */
export interface CaptureInput {
  userId: string;
  sourceId: string | null;
  sourceKind: CapturedVia;
  /** Instagram message id, or YouTube playlist item id. Makes the capture idempotent. */
  sourceEventId: string;
  /** ISO-8601: when the user saved it (message time, playlist add time). */
  savedAt: string;
  sharedUrl?: string;
  sharedText?: string;
  caption?: string;
  /** A temporary media URL to snapshot immediately (Instagram post shares). */
  snapshotUrl?: string;
  /** True when the platform gave no link back to the original (Instagram post shares). */
  noLink?: boolean;
  /** Overrides used when there is no URL to normalise (Instagram post shares): platform, kind and the platform's own id. */
  platform?: Platform;
  kind?: Kind;
  externalId?: string;
  /** Retained independently when a post's permalink supplies the deduplication shortcode. */
  instagramMediaId?: string;
  /** Title when the door knows it (YouTube video title). Captions go in `caption`. */
  title?: string;
}

export interface CaptureResult {
  itemId: string;
  deduplicated: boolean;
  status: ItemStatus;
  platform: Platform;
  kind: Kind;
}

export interface LinkStartResponse {
  code: string;
  expiresAt: string;
}

/** POST /youtube-register (JWT): starts watching a YouTube playlist the person points us at. */
export interface YoutubeRegisterRequest {
  playlistUrl: string;
}

export interface YoutubeRegisterResponse {
  sourceId: string;
  playlistId: string;
  title: string;
  itemCount: number;
  /** True when this playlist was already theirs, so the app can say "still watching" rather than "connected". */
  alreadyConnected: boolean;
}

export interface ItemAiOutput {
  category: Category;
  tags: string[];
  summary: string;
  entities: { type: EntityType; name: string }[];
  language: string;
  actionability: Actionability;
  confidence: number;
}

export type ApiErrorCode = "bad_request" | "unauthorized" | "not_found" | "internal";
export interface ApiError {
  error: string;
  code: ApiErrorCode;
}

export const LIMITS = {
  noteMaxChars: 2000,
  textMaxChars: 20000,
  urlMaxChars: 4096,
  linkCodeTtlSeconds: 600,
} as const;

/** Link codes avoid look-alike characters (0/O, 1/I). */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 6;

/** POST /delete-account (JWT): what was forgotten. */
export interface DeleteAccountResponse { deleted: true; thumbnails: number; events: number; replies: number; items: number; sources: number }

/** POST /reprocess-item (JWT): enrich and classify one item the caller owns, now rather than at the next sweep. */
export interface ReprocessItemRequest { itemId: string; retry?: boolean }
export interface ReprocessItemResponse { status: ItemStatus; category: string | null; classificationStatus?: ClassificationStatus }


/** POST /import-saves (JWT): reads the Instagram export the caller uploaded and creates the saves it names. */
export interface ImportSavesRequest { path: string }
export interface ImportSavesResponse { importId: string; found: number; added: number; skipped: number }

/** public.import_progress(import_id): how far one import has got, counted from the saves themselves. */
export interface ImportProgress { found: number; added: number; ready: number; waiting: number; failed?: number; finished: boolean }

/** Direct share/paste of an Instagram permalink. requestId is reused when retrying a save. */
export interface SaveLinkRequest { text: string; requestId: string }
export type SaveLinkResponse = CaptureResult;
