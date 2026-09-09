# Allkept interface direction

The audience is Gen Z. Keep interfaces minimal, spacious and fluid across the app. This is the direction for future screen work, not a claim that every existing screen has been redesigned.

- Default to the dark palette on a fresh install; preserve an existing explicit theme preference.
- Use one short heading and one clear primary action. Remove explanations that repeat visible controls.
- Group labels tightly with their fields; leave about 30 px between field groups. Keep comfortable touch targets (at least 44 px).
- Use familiar icons for compact actions, with explicit screen-reader labels. Never sacrifice clarity or accessibility for minimalism.
- Motion should explain a transition or confirm an action. Respect Reduce Motion. Avoid perpetual decorative animation.
- Show progress during network operations; show success only after server confirmation. Preserve input on failure.
- Keep profile photo above name, gender and optional phone. Onboarding has no sign-out action; account controls remain in Settings.

## Implemented screens

Welcome uses the approved cinematic fan collection on a dark background, the current purple bookmark logo, "All your saves. One place.", and a compact Google button. Profile onboarding and Settings profile editing share the spacious form, gender selection sheet and animated tick submit control.

## Artwork

Production assets were created with the built-in image-generation tool from the approved cinematic fan mockup and current logo references:

- `apps/mobile/assets/welcome/cinematic-fan.png`: standalone three-card photographic fan (alpine lake, evening stone arch/coast, candlelit food), small source glyphs, dark #0E0F14 ground. No phone frame, headline, logo or button baked into the artwork.
- `apps/mobile/assets/brand/lockup-dark.png`: purple bookmark and white All Kept wordmark on dark ground, based on the current brand lockup.

Prompt intent: preserve the approved composition and logo identity, isolate production artwork, use a uniform dark ground, and remove all mockup chrome and copy. Typography, accessibility and sign-in behavior remain native UI.

### Final generation prompts (built-in image tool)

**Fan:** Extract ONLY the approved three photographic fan cards from the reference into a standalone square production hero image. Identical stone arch evening coast center, alpine lake left, candlelit pasta right. Keep precise arrangement and small source icons. Remove phone, logo, text, button. OPAQUE UNIFORM SOLID background exact RGB(14,15,20) #0E0F14, no transparency and absolutely NO checkerboard. Corners and outermost 8% margins must be perfectly flat #0E0F14, shadow/glow contained behind cards only. Fan occupies 90% width and 85% height, tightly framed. Crisp polished photographic asset on dark ground.

**Logo:** Create faithful dark-ground counterpart of this exact logo. Opaque perfectly uniform solid background RGB(14,15,20) #0E0F14. Preserve exactly the bookmark icon from reference including distinct crossing lavender/cream triangular folds, not a plain gradient bookmark. Preserve exact All Kept typeface, italic Kept and spacing; change all black letter pixels to clean white. No stylization, distortion, noise, shadow, distressed text, extra artifacts. Only logo. TIGHT CROP: entire lockup fills 85% canvas width and height with small uniform margin, canvas aspect roughly 4:3. Flat background all the way to edges, no transparency.

The generated source PNGs have opaque dark backgrounds. Welcome now uses the app’s #0E0F14 canvas and native lighten compositing against an explicit same-color underlay for each asset. This removes their darker rectangular panels in the rendered screen while retaining the original artwork. The PNGs themselves are not transparent. Background-removal attempts that returned painted checkerboards were discarded.

## Verification

55 mobile tests and TypeScript checks pass. Both iOS and Android Expo exports succeeded. Welcome, profile and gender-sheet layouts were inspected in the iPhone simulator. A temporary local welcome fixture was removed afterward; no test profile was submitted to the hosted backend. Confirm-button tests cover duplicate taps, failed saves, delayed success, reduced motion, and cancellation on unmount.
