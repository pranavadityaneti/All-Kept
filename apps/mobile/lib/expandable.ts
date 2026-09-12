/**
 * A section that shows the first few of something, and can be opened and closed again.
 *
 * Written down because getting it wrong is easy and silent: the home grid used to hold the number
 * of tiles to show rather than whether it was open, and set that number to the total on "See all".
 * The control that offers the action only appears while the total exceeds what is shown — so
 * expanding the grid removed the only way back, and nothing on screen said the section was open.
 * Deciding both the slice and the label from one flag is what makes the door swing both ways.
 */
export function expandable<T>(all: T[], limit: number, open: boolean): { shown: T[]; actionLabel?: "See all" | "Show less" } {
  if (all.length <= limit) return { shown: all };
  return open ? { shown: all, actionLabel: "Show less" } : { shown: all.slice(0, limit), actionLabel: "See all" };
}
