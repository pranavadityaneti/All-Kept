# App typeface

The app is set in **Manrope** (SIL Open Font License), loaded at start from the
`@expo-google-fonts/manrope` package in static cuts, one file per weight, 200 to 800. Nothing lives
in this folder; the package carries the files.

Every weight in the app is asked for through `font()` in `lib/theme.ts`, which hands back the
matching cut. `FONT = null` there puts every screen back on the platform's own face.
