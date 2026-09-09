import { expect, it } from "vitest";
import {
  BRAND_LABELS,
  brandForPlatform,
  platformName,
} from "../../../packages/platform-assets/catalog";
it("maps every supported brand and source alias without mistaking generic links for brands", () => {
  for (const brand of Object.keys(BRAND_LABELS))
    expect(brandForPlatform(brand)).toBe(brand);
  expect(brandForPlatform("instagram_dm")).toBe("instagram");
  expect(brandForPlatform("instagram_export")).toBe("instagram");
  expect(brandForPlatform("youtube_playlist")).toBe("youtube");
  expect(brandForPlatform("Twitter")).toBe("x");
  for (const value of ["web", "note", "unknown", "constructor", "__proto__"])
    expect(brandForPlatform(value)).toBeNull();
  expect(platformName("youtube")).toBe("YouTube");
  expect(platformName("whatsapp")).toBe("WhatsApp");
});
