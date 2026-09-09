/**
 * The run of saves the person is looking at, remembered when they open one so a sideways swipe
 * moves through the same list in the same order.
 *
 * Held in memory rather than passed through the address: category names contain "&", which makes a
 * hand-built link unreliable, and this way the pager follows whatever was actually on screen,
 * filters and search results included.
 */
let current: string[] = [];

export function setCollection(ids: string[]): void {
  current = ids;
}

/** The list to page through, or just this save when it is not part of one. */
export function collectionFor(id: string): string[] {
  return current.includes(id) ? current : [id];
}
