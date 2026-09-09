import { describe, expect, it } from "vitest";
import { hostLabel } from "../lib/platforms";

describe("where a link came from", () => {
  it("names the site rather than calling everything Web", () => {
    expect(hostLabel("https://app.primevideo.com/detail?gti=amzn1.dv.gti.62b")).toBe("app.primevideo.com");
    expect(hostLabel("https://holidayz.makemytrip.com/holidays/india/package?category=12")).toBe("holidayz.makemytrip.com");
    // Nobody says "www" out loud.
    expect(hostLabel("https://www.apple.com/in")).toBe("apple.com");
    expect(hostLabel("https://WWW.Example.COM/x")).toBe("example.com");
  });

  it("gives nothing back rather than something wrong", () => {
    // The caller falls back to the platform's own name; a half-parsed string would be worse.
    expect(hostLabel(null)).toBeNull();
    expect(hostLabel(undefined)).toBeNull();
    expect(hostLabel("")).toBeNull();
    expect(hostLabel("not a url")).toBeNull();
    expect(hostLabel("mailto:hi@allkept.app")).toBeNull();
  });
});
