/** Scene boundaries in frames at 30 fps. Total 600 = 20 s. */
export const FPS = 30;

export const HOOK = { from: 0, length: 60 } as const; //  0–2 s
export const PILE = { from: 60, length: 130 } as const; //  2–6.3 s
export const SORT = { from: 190, length: 170 } as const; //  6.3–12 s
export const SEARCH = { from: 360, length: 120 } as const; // 12–16 s
export const CTA = { from: 480, length: 120 } as const; // 16–20 s

export const TOTAL = CTA.from + CTA.length;
