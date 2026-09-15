// The season and the occasions: facts fetched, never guessed.
//
// The dates fix more than the weekday hours. Public holidays for the trip's countries come from
// Nager.Date — free and factual; a holiday closes markets and fills trains. Typical weather for
// each town in those weeks comes from Open-Meteo's climate normals — free; a range said as
// "typically", never a forecast claimed months out. Either source down is simply absent: a plan is
// never held up for a holiday list. Pure but for the fetch, which is injected.

export interface Holiday { date: string; name: string; country: string }

const TIMEOUT_MS = 6_000;

async function getJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const isoDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The public holidays of each country between two ISO days, inclusive, dated and named; a country or a year that cannot be read gives none. */
export async function holidaysBetween(countries: string[], from: string, to: string, fetchFn: typeof fetch): Promise<Holiday[]> {
  if (!isoDay(from) || !isoDay(to) || to < from) return [];
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const out: Holiday[] = [];
  for (const country of [...new Set(countries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))]) {
    for (const year of years) {
      const body = await getJson(fetchFn, `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
      if (!Array.isArray(body)) continue;
      for (const h of body as Record<string, unknown>[]) {
        const date = h["date"], name = h["name"] ?? h["localName"];
        if (isoDay(date) && typeof name === "string" && date >= from && date <= to) out.push({ date, name: name.trim(), country });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** "6–12 Oct" from two ISO days. */
function span(from: string, to: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [, tm, td] = to.split("-").map(Number) as [number, number, number];
  return fm === tm ? `${fd}–${td} ${months[fm - 1]}` : `${fd} ${months[fm - 1]} – ${td} ${months[tm - 1]}`;
}

/**
 * One line per town of what the weeks are typically like — the range of highs and lows and how
 * many days see rain — from Open-Meteo's climate model for those dates. A town the model cannot
 * answer for gets no line.
 */
export async function typicalWeather(towns: { name: string; lat: number; lng: number }[], from: string, to: string, fetchFn: typeof fetch): Promise<string[]> {
  if (!isoDay(from) || !isoDay(to) || to < from) return [];
  const out: string[] = [];
  for (const town of towns) {
    const q = new URLSearchParams({ latitude: String(town.lat), longitude: String(town.lng), start_date: from, end_date: to, models: "EC_Earth3P_HR", daily: "temperature_2m_max,temperature_2m_min,precipitation_sum" });
    const body = await getJson(fetchFn, `https://climate-api.open-meteo.com/v1/climate?${q.toString()}`) as { daily?: { temperature_2m_max?: unknown; temperature_2m_min?: unknown; precipitation_sum?: unknown } } | null;
    const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []);
    const highs = nums(body?.daily?.temperature_2m_max), lows = nums(body?.daily?.temperature_2m_min), rain = nums(body?.daily?.precipitation_sum);
    if (highs.length === 0 || lows.length === 0) continue;
    const lo = Math.round(Math.min(...lows)), hi = Math.round(Math.max(...highs));
    const rainy = rain.filter((mm) => mm >= 1).length;
    const rainWords = rain.length === 0 ? "" : rainy === 0 ? ", little rain" : rainy <= rain.length / 4 ? `, a rainy day or two` : `, rain on about ${rainy} of ${rain.length} days`;
    out.push(`${town.name}, ${span(from, to)}: typically ${lo}–${hi} °C${rainWords}.`);
  }
  return out;
}
