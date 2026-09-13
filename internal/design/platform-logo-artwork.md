# Official platform marks on the splash

The cinematic fan artwork previously contained drawn Instagram and YouTube logos. Those marks were removed from a sibling image, `apps/mobile/assets/welcome/cinematic-fan-clean.png`, and `WelcomeIllustration.tsx` now renders the shared official platform assets over it. The existing `cinematic-fan.png` remains available. No generated logo is used by the component.

The background cleanup used the built-in image generation editor with this prompt:

> Use case: precise-object-edit. Edit target: attached Allkept cinematic fan artwork. Remove ONLY the white Instagram glyph near the top of the left mountain card and ONLY the white YouTube play logo near the top of the right food card. Seamlessly inpaint their locations using the existing sky on the left and dark tabletop/background on the right. Keep every other part of the image unchanged: same three cards, exact positions, proportions, rotations, crops, thin white borders, black background, mountain scenery, center terrace, food, lighting, colors, central purple bookmark mark, and overall square composition. Do not add new logos or text. Do not redraw or replace any logo. Official logos will be rendered separately in application code.

The 12 platform marks and provenance are in `packages/platform-assets`.
