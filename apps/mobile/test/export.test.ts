import { describe, expect, it } from "vitest";
import { copyText, describeEvent, icsFor, mapsUrl } from "../lib/export";

const venue = { name: "Haku", locality: "Bandra, Mumbai" };
const now = new Date("2026-09-15T08:00:00Z");

describe("the way out to Maps", () => {
  it("opens the phone's maps at the venue, and Google Maps when asked for", () => {
    expect(mapsUrl(venue, "ios")).toBe("maps://?q=Haku%2C%20Bandra%2C%20Mumbai");
    expect(mapsUrl(venue, "ios", "google")).toBe("comgooglemaps://?q=Haku%2C%20Bandra%2C%20Mumbai");
    expect(mapsUrl(venue, "android")).toBe("geo:0,0?q=Haku%2C%20Bandra%2C%20Mumbai");
  });
});

describe("the way out to Calendar", () => {
  const save = { id: "261445cf-b000-4ae5-a497-bb192b9c149b", title: "Ramen night; Haku, Bandra", summary: "A ramen pop-up at Haku.", url: "https://www.instagram.com/reel/DaC4N/", venue };
  it("is one event with the save's words, all day when the post named only a day", () => {
    expect(icsFor({ ...save, eventAt: "2026-10-12" }, now)).toBe([
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Allkept//EN", "BEGIN:VEVENT",
      "UID:261445cf-b000-4ae5-a497-bb192b9c149b@allkept.app", "DTSTAMP:20260915T080000Z",
      "DTSTART;VALUE=DATE:20261012", "DTEND;VALUE=DATE:20261013",
      "SUMMARY:Ramen night\; Haku\\, Bandra",
      "DESCRIPTION:A ramen pop-up at Haku.\\nhttps://www.instagram.com/reel/DaC4N/",
      "LOCATION:Haku\\, Bandra\\, Mumbai",
      "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n"));
  });
  it("is an hour from the time when the post named one, in UTC", () => {
    const ics = icsFor({ ...save, venue: null, eventAt: "2026-10-12T19:00:00+05:30" }, now);
    expect(ics).toContain("DTSTART:20261012T133000Z\r\nDTEND:20261012T143000Z");
    expect(ics).not.toContain("LOCATION");
  });
  it("folds a long line the way the format asks, so every reader takes it", () => {
    const ics = icsFor({ ...save, summary: "x".repeat(200), eventAt: "2026-10-12" }, now);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(ics).toContain("\r\n " + "x".repeat(10));
  });
  it("says the day, and the time when there is one", () => {
    expect(describeEvent("2026-10-12", now)).toBe("Mon 12 Oct");
    expect(describeEvent("2026-10-12T19:00:00+05:30", now)).toMatch(/^Mon 12 Oct, \d{1,2}:\d{2} [ap]m$/);
    expect(describeEvent("2027-01-04", now)).toBe("Mon 4 Jan 2027");
  });
});

describe("the way out as text", () => {
  it("is the title, the summary, your note and the link, skipping what is missing", () => {
    expect(copyText({ title: "Ramen night", summary: "A pop-up.", note: "go with R", url: "https://x.y/z" })).toBe("Ramen night\nA pop-up.\ngo with R\nhttps://x.y/z");
    expect(copyText({ title: "Ramen night", summary: null, note: null, url: null })).toBe("Ramen night");
  });
});
