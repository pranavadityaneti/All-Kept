import type { SaveLinkResponse } from "@allkept/contracts";

/**
 * What the server actually did with a pasted link, said plainly. A save is never claimed before it
 * has happened, and a note sent with it is mentioned, so the person knows it stuck. A link already
 * kept is not saved twice, but a note typed with it is appended to the save's own (bump_item_save).
 */
export function saveOutcome(r: Pick<SaveLinkResponse, "deduplicated" | "status">, withNote: boolean): string {
  if (r.deduplicated) return withNote ? "Already saved. Your note was added." : "Already saved.";
  const saved = withNote ? "Saved, with your note." : "Saved.";
  // Enrichment and sorting run after the answer comes back, so anything not ready is honestly "on its way".
  return r.status === "ready" ? saved : `${saved} Sorting it now.`;
}
