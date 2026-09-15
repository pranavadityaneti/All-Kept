import { assertEquals } from "jsr:@std/assert@1";
import { holidaysBetween, typicalWeather } from "../_shared/weave/context.ts";

const fakeFetch = (routes: Record<string, unknown>): typeof fetch => (async (input: string | URL | Request) => {
  const url = String(input);
  for (const [prefix, body] of Object.entries(routes)) if (url.startsWith(prefix)) return body === null ? new Response("down", { status: 503 }) : Response.json(body);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

Deno.test("the holidays of each country in the dates, dated and named, sorted; a country or year that cannot be read gives none; nonsense dates give none", async () => {
  const f = fakeFetch({
    "https://date.nager.at/api/v3/PublicHolidays/2026/KR": [{ date: "2026-10-03", name: "National Foundation Day", localName: "개천절" }, { date: "2026-10-09", name: "Hangul Day", localName: "한글날" }, { date: "2026-12-25", name: "Christmas Day" }],
    "https://date.nager.at/api/v3/PublicHolidays/2026/JP": [{ date: "2026-10-12", name: "Sports Day", localName: "スポーツの日" }],
    "https://date.nager.at/api/v3/PublicHolidays/2026/XX": null,
  });
  assertEquals(await holidaysBetween(["kr", "JP", "XX", "not-a-code"], "2026-10-06", "2026-10-20", f), [
    { date: "2026-10-09", name: "Hangul Day", country: "KR" }, { date: "2026-10-12", name: "Sports Day", country: "JP" },
  ]);
  assertEquals(await holidaysBetween(["KR"], "2026-13-01", "2026-10-20", f), []);
  assertEquals(await holidaysBetween(["KR"], "2026-10-20", "2026-10-06", f), []);
});

Deno.test("a town's weeks in one line: the range of lows and highs and how rainy, said as typical; a town the model cannot answer for gets no line", async () => {
  const f = fakeFetch({
    "https://climate-api.open-meteo.com/v1/climate?latitude=35.02": { daily: { temperature_2m_max: [22.1, 21.4, 23.0, 20.2], temperature_2m_min: [13.9, 12.5, 14.1, 11.8], precipitation_sum: [0, 4.2, 0.3, 0] } },
    "https://climate-api.open-meteo.com/v1/climate?latitude=37.5": null,
  });
  const lines = await typicalWeather([{ name: "Kyoto", lat: 35.02, lng: 135.7 }, { name: "Seoul", lat: 37.5, lng: 127.0 }], "2026-10-06", "2026-10-09", f);
  assertEquals(lines, ["Kyoto, 6–9 Oct: typically 12–23 °C, a rainy day or two."]);
  assertEquals(await typicalWeather([{ name: "Kyoto", lat: 35.0, lng: 135.7 }], "2026-10-30", "2026-11-02", fakeFetch({ "https://climate-api.open-meteo.com": { daily: { temperature_2m_max: [18], temperature_2m_min: [9], precipitation_sum: [] } } })), ["Kyoto, 30 Oct – 2 Nov: typically 9–18 °C."]);
});
