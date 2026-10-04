# Store artwork builder

Builds every App Store and Google Play screenshot, the Play feature graphic and the contact
sheet in `docs/marketing/store/final/` from the raw app screens in `docs/marketing/store/raw/`
and the brand files in `docs/marketing/creative-assets/brand/`.

Each frame is an HTML page rendered by the installed Google Chrome at the exact store size, so
the Manrope lettering, gradients and shadows come out sharp. Pillow cuts the screens and cards
and writes the final PNGs (sRGB, no transparency).

## Run

```bash
PLAYWRIGHT_PATH=/path/to/node_modules/playwright python3 marketing/store-art/build.py           # previews only
PLAYWRIGHT_PATH=/path/to/node_modules/playwright python3 marketing/store-art/build.py --final   # overwrite docs/marketing/store/final
```

- Pick formats or frames: `build.py appstore-6.9 play-phone --only 3-search`
  (formats: `appstore-6.9`, `appstore-6.5`, `play-phone`, `play-tablet`; frame ids are in `FRAMES`).
- Scratch files go to `$STORE_ART_WORK` (default: the system temp folder, `allkept-store-art`).

## Needs

- Python 3 with Pillow, and Node.
- Google Chrome installed (Playwright drives it through `channel: 'chrome'`; no browser download).
- Playwright: not a dependency of this repo. Point `PLAYWRIGHT_PATH` at any installed copy.
- The Manrope fonts from `node_modules/@expo-google-fonts/manrope` (`npm install` at the repo root).

## Changing the set

Captions, colours and the order live in `FRAMES` at the top of `build.py`. A new raw screen
must be an iPhone 6.9" capture (1320 × 2868), named as in `FRAMES`.
