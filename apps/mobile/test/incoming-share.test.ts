import { describe, it, expect } from "vitest";
import { incomingLink, shareRoute } from "../lib/incoming-share";
const url = "https://www.instagram.com/p/Original/";
describe("incoming shares", () => {
  it("keeps a permalink from shared text without resolving through login pages", () => {
    expect(incomingLink([{ shareType: "text", value: `Have a look ${url}?igsh=tracking` }])).toBe(url);
  });
  it("accepts repeated representations of one link but rejects two different ones", () => {
    expect(incomingLink([{ shareType: "url", value: url }, { shareType: "text", value: url }])).toBe(url);
    expect(incomingLink([{ shareType: "url", value: url }, { shareType: "url", value: "https://www.instagram.com/p/Other/" }])).toBeNull();
  });
  it("takes a link from anywhere, not only Instagram", () => {
    expect(incomingLink([{ shareType: "url", value: "https://www.theverge.com/2026/9/8/muse" }])).toBe("https://www.theverge.com/2026/9/8/muse");
    expect(incomingLink([{ shareType: "text", value: "github.com/expo/expo" }])).toBe("https://github.com/expo/expo");
  });
  it("ignores shares that carry no link at all", () => {
    for (const p of [{ shareType: "image", value: url }, { shareType: "text", value: "just some words" }]) {
      expect(incomingLink([p])).toBeNull();
    }
  });
  it("routes shares without disturbing auth or normal app links", () => {
    expect(shareRoute("allkept://expo-sharing")).toBe("/save?incoming=1");
    expect(shareRoute("allkept://auth-callback?code=abc")).toBe("allkept://auth-callback?code=abc");
    expect(shareRoute("/library")).toBe("/library");
  });
});
