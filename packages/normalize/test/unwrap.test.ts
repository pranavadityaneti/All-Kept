import { describe, expect, it } from "vitest";
import { normalize, unwrapRedirect } from "../src/index";

describe("links that are only a signpost to somewhere else", () => {
  it("unwraps a Google search result to the page it points at", () => {
    // The exact shape that produced a save titled "Redirect Notice" in the real library.
    const wrapped = "https://www.google.com/url?q=https%3A%2F%2Frazorpay.com%2Flearn%2Fstartup-business-ideas-for-students%2F&sa=U&ved=2ah";
    expect(unwrapRedirect(wrapped)).toBe("https://razorpay.com/learn/startup-business-ideas-for-students/");
    const n = normalize({ url: wrapped, text: null });
    expect(n.platform).toBe("web");
    // The canonical form drops the trailing slash, as it always has; the source keeps it.
    expect(n.canonicalUrl).toBe("https://razorpay.com/learn/startup-business-ideas-for-students");
    expect(n.sourceUrl).toBe("https://razorpay.com/learn/startup-business-ideas-for-students/");
  });

  it("unwraps the other wrappers people paste from", () => {
    expect(unwrapRedirect("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa")).toBe("https://example.com/a");
    expect(unwrapRedirect("https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fb")).toBe("https://example.com/b");
  });

  it("leaves alone anything that is not a wrapper, or whose target is not a link", () => {
    for (const u of [
      "https://www.google.com/search?q=cats",              // a real Google page, no destination
      "https://razorpay.com/learn/x/",                     // already the destination
      "https://www.google.com/url?q=javascript%3Aalert(1)", // refuses a non-web scheme
      "not a url at all",
    ]) expect(unwrapRedirect(u)).toBe(u);
  });

  it("stops rather than following a wrapper round for ever", () => {
    const loop = "https://www.google.com/url?q=" + encodeURIComponent("https://www.google.com/url?q=" + encodeURIComponent("https://example.com/end"));
    expect(unwrapRedirect(loop)).toBe("https://example.com/end");
  });
});
