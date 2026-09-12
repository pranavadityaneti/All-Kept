import { expect, it } from "vitest";
import { csvCell, waitlistCsv } from "./App";

it("quotes cells that would break a row and neutralises formula-looking addresses", () => {
  expect(csvCell("plain@example.com")).toBe("plain@example.com");
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  // A spreadsheet would run this as a formula; the apostrophe makes it text.
  // …and because it also holds quotes, the whole cell is then quoted with those doubled.
  expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
  expect(csvCell("=1+1")).toBe("'=1+1");
  expect(csvCell("+1@x.co")).toBe("'+1@x.co");
  expect(csvCell(null)).toBe("");
});

it("writes a header and one CRLF-terminated line per row, notified blank when null", () => {
  const csv = waitlistCsv([
    { id: "1", email: "a@x.co", source: "site-hero", created_at: "2026-09-12T10:00:00Z", notified_at: null },
    { id: "2", email: "b@x.co", source: "site-footer", created_at: "2026-09-13T10:00:00Z", notified_at: "2026-09-21T00:00:00Z" },
  ]);
  expect(csv).toBe(
    "email,source,signed_up,notified\r\n" +
      "a@x.co,site-hero,2026-09-12T10:00:00Z,\r\n" +
      "b@x.co,site-footer,2026-09-13T10:00:00Z,2026-09-21T00:00:00Z\r\n",
  );
});
