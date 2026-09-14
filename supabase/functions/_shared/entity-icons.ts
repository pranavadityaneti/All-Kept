// The sweeper's icon pass: gives every named thing in a person's saves a mark of its own.
//
// The classifier names the people, brands, products, places, recipes and tools in each save, and
// the app draws an interest with a mark for its kind — which put the same tag on Google, IMDb and
// Apple. This pass asks the model, for a batch of names at a time, which mark in the app's own
// vocabulary says what sort of thing each one is: film for IMDb, a chat bubble for Claude. The
// answer is written onto every save that names the thing, so a re-sorted save is filled in again
// next time round, and the same code fills the back catalogue and every new save alike. Pure; the
// rows, the model and the write are injected.
import { ENTITY_ICONS, isEntityIcon, type EntityIcon, type EntityType, type ItemAiOutput } from "./contracts.ts";
import type { ClassifyDeps } from "./classify.ts";

export type Entity = ItemAiOutput["entities"][number];
export interface IconRow { item_id: string; entities: Entity[] }

/** Names put to the model in one call. Enough to clear a back catalogue in a few sweeps, small enough that the answer never nears the output cap. */
export const MAX_NAMES = 40;
/** Saves read per run. Names repeat across saves, so this covers many more than MAX_NAMES saves' worth of new names. */
export const MAX_ROWS = 50;

/** The kinds' own marks: what a name wears when nothing more specific was said of it. Always in the vocabulary. */
const KIND_MARK: Record<string, EntityIcon> = { person: "person-circle", brand: "pricetag", product: "cube", place: "navigate", recipe: "restaurant", tool: "construct", other: "sparkles" };
const kindMark = (type: string): EntityIcon => KIND_MARK[type] ?? KIND_MARK["other"]!;

export const ICONS_PROMPT = `You choose a small icon for each named thing in a person's saved posts, so that the thing is recognisable at a glance in a list.
You are given a JSON array of {i, name, type}, where type is one of place, product, recipe, tool, person, brand or other.
Return JSON {"icons": [{"i", "icon"}, ...]} with one entry for every i, choosing icon from exactly this list:
${JSON.stringify(ENTITY_ICONS)}
Pick the icon that best says what sort of thing this is: "film" for a film database, "chatbubbles" for a chat assistant, "car" for a ride-hailing company, "airplane" for a city people travel to, "book" for an author.
When nothing more specific fits, use the type's own mark: "person-circle" for a person, "pricetag" for a brand, "cube" for a product, "navigate" for a place, "restaurant" for a recipe, "construct" for a tool, "sparkles" for other.
Never leave an i out and never invent an icon.`;

/** Strict: every property required, no extras, the icon confined to the vocabulary. */
export const ICONS_SCHEMA = {
  type: "object",
  properties: {
    icons: {
      type: "array",
      items: { type: "object", properties: { i: { type: "integer" }, icon: { type: "string", enum: [...ENTITY_ICONS] } }, required: ["i", "icon"], additionalProperties: false },
    },
  },
  required: ["icons"],
  additionalProperties: false,
} as const;

export interface IconPassDeps {
  /** Saves with at least one named thing lacking a mark, oldest first. */
  rows(limit: number): Promise<IconRow[]>;
  call: ClassifyDeps["call"];
  save(itemId: string, entities: Entity[]): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** "IMDb" and "imdb" are one name; a brand and a person of the same name are not. */
const keyOf = (e: Pick<Entity, "name" | "type">): string => `${e.type} ${e.name.trim().toLowerCase()}`;
/** A blank name is nothing to mark, and must never hold a save back from being written. */
const needsMark = (e: Entity): boolean => !e.icon && e.name.trim().length > 0;

/**
 * One run. Reads a batch of saves, asks once about the distinct names on them that lack a mark, and
 * writes each save back once every name on it has an answer. A name the model left out, or answered
 * from outside the vocabulary, wears its kind's own mark — the honest fallback, and what keeps a
 * name the model will not place from being asked about on every sweep for ever. A model that could
 * not be reached writes nothing, so the same saves are asked about next time.
 */
export async function runIconPass(deps: IconPassDeps): Promise<{ rows: number; names: number; saved: number }> {
  const rows = await deps.rows(MAX_ROWS);
  const wanted = new Map<string, { name: string; type: EntityType }>();
  for (const r of rows) for (const e of r.entities) if (needsMark(e) && !wanted.has(keyOf(e)) && wanted.size < MAX_NAMES) wanted.set(keyOf(e), { name: e.name.trim(), type: e.type });
  if (wanted.size === 0) return { rows: rows.length, names: 0, saved: 0 };

  const asked = [...wanted.values()].map((e, i) => ({ i, name: e.name, type: e.type }));
  const reply = await deps.call(ICONS_PROMPT, JSON.stringify(asked), { name: "entity_icons", schema: ICONS_SCHEMA });
  if (reply.error || reply.refused || typeof reply.output !== "object" || reply.output === null) {
    deps.log("icon pass: model gave no answer", { names: asked.length, error: reply.error ?? (reply.refused ? "refused" : "no output") });
    return { rows: rows.length, names: asked.length, saved: 0 };
  }
  deps.log("icon pass: asked", { names: asked.length, model: reply.model, usage: reply.usage });
  const answers = new Map<string, EntityIcon>();
  const list = (reply.output as { icons?: unknown }).icons;
  for (const a of Array.isArray(list) ? list : []) {
    const pick = a as { i?: unknown; icon?: unknown };
    const at = typeof pick.i === "number" ? asked[pick.i] : undefined;
    if (at && isEntityIcon(pick.icon)) answers.set(keyOf(at), pick.icon);
  }

  let saved = 0;
  for (const r of rows) {
    // Only a save every one of whose names was put to the model this run; the rest wait their turn.
    if (!r.entities.every((e) => !needsMark(e) || wanted.has(keyOf(e)))) continue;
    const filled = r.entities.map((e) => (needsMark(e) ? { ...e, icon: answers.get(keyOf(e)) ?? kindMark(e.type) } : e));
    await deps.save(r.item_id, filled);
    saved++;
  }
  return { rows: rows.length, names: asked.length, saved };
}
