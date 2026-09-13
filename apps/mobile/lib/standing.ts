/**
 * Where a person stands, as a screen shows it — the pure half of billing.ts, kept free of native
 * imports so it can be tested. The server's my_entitlement() row comes in; a Standing goes out.
 */
/**
 * ISO 3166-1 alpha-3 → alpha-2. Apple's store names a country with three letters (USA, IND);
 * Google's with two; the free-region rule is written in two. Every code, so no country is a
 * surprise later.
 */
const ALPHA3 = new Map(
  ("AND:AD ARE:AE AFG:AF ATG:AG AIA:AI ALB:AL ARM:AM AGO:AO ATA:AQ ARG:AR ASM:AS AUT:AT AUS:AU ABW:AW ALA:AX AZE:AZ "
    + "BIH:BA BRB:BB BGD:BD BEL:BE BFA:BF BGR:BG BHR:BH BDI:BI BEN:BJ BLM:BL BMU:BM BRN:BN BOL:BO BES:BQ BRA:BR BHS:BS BTN:BT BVT:BV BWA:BW BLR:BY BLZ:BZ "
    + "CAN:CA CCK:CC COD:CD CAF:CF COG:CG CHE:CH CIV:CI COK:CK CHL:CL CMR:CM CHN:CN COL:CO CRI:CR CUB:CU CPV:CV CUW:CW CXR:CX CYP:CY CZE:CZ "
    + "DEU:DE DJI:DJ DNK:DK DMA:DM DOM:DO DZA:DZ ECU:EC EST:EE EGY:EG ESH:EH ERI:ER ESP:ES ETH:ET FIN:FI FJI:FJ FLK:FK FSM:FM FRO:FO FRA:FR "
    + "GAB:GA GBR:GB GRD:GD GEO:GE GUF:GF GGY:GG GHA:GH GIB:GI GRL:GL GMB:GM GIN:GN GLP:GP GNQ:GQ GRC:GR SGS:GS GTM:GT GUM:GU GNB:GW GUY:GY "
    + "HKG:HK HMD:HM HND:HN HRV:HR HTI:HT HUN:HU IDN:ID IRL:IE ISR:IL IMN:IM IND:IN IOT:IO IRQ:IQ IRN:IR ISL:IS ITA:IT JEY:JE JAM:JM JOR:JO JPN:JP "
    + "KEN:KE KGZ:KG KHM:KH KIR:KI COM:KM KNA:KN PRK:KP KOR:KR KWT:KW CYM:KY KAZ:KZ LAO:LA LBN:LB LCA:LC LIE:LI LKA:LK LBR:LR LSO:LS LTU:LT LUX:LU LVA:LV LBY:LY "
    + "MAR:MA MCO:MC MDA:MD MNE:ME MAF:MF MDG:MG MHL:MH MKD:MK MLI:ML MMR:MM MNG:MN MAC:MO MNP:MP MTQ:MQ MRT:MR MSR:MS MLT:MT MUS:MU MDV:MV MWI:MW MEX:MX MYS:MY MOZ:MZ "
    + "NAM:NA NCL:NC NER:NE NFK:NF NGA:NG NIC:NI NLD:NL NOR:NO NPL:NP NRU:NR NIU:NU NZL:NZ OMN:OM "
    + "PAN:PA PER:PE PYF:PF PNG:PG PHL:PH PAK:PK POL:PL SPM:PM PCN:PN PRI:PR PSE:PS PRT:PT PLW:PW PRY:PY QAT:QA REU:RE ROU:RO SRB:RS RUS:RU RWA:RW "
    + "SAU:SA SLB:SB SYC:SC SDN:SD SWE:SE SGP:SG SHN:SH SVN:SI SJM:SJ SVK:SK SLE:SL SMR:SM SEN:SN SOM:SO SUR:SR SSD:SS STP:ST SLV:SV SXM:SX SYR:SY SWZ:SZ "
    + "TCA:TC TCD:TD ATF:TF TGO:TG THA:TH TJK:TJ TKL:TK TLS:TL TKM:TM TUN:TN TON:TO TUR:TR TTO:TT TUV:TV TWN:TW TZA:TZ "
    + "UKR:UA UGA:UG UMI:UM USA:US URY:UY UZB:UZ VAT:VA VCT:VC VEN:VE VGB:VG VIR:VI VNM:VN VUT:VU WLF:WF WSM:WS YEM:YE MYT:YT ZAF:ZA ZMB:ZM ZWE:ZW")
    .split(" ").map((pair) => pair.split(":") as [string, string]),
);

/**
 * The store's country in the one spelling the rules use: two letters, upper case. Three letters
 * are translated; anything unrecognised becomes null, which is "not reported" — and a phone that
 * has not reported is not gated. A code we cannot read must never charge anyone.
 */
export function normalizeRegion(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  if (/^[A-Z]{3}$/.test(c)) return ALPHA3.get(c) ?? null;
  return null;
}

/** "en-IN" → "IN"; "hi-Deva-IN" → "IN"; "en" → null. The fallback when the store cannot say. */
export function regionFromLocale(locale: string | undefined): string | null {
  if (!locale) return null;
  const m = /(?:^|[-_])([A-Z]{2})(?:$|[-_])/.exec(locale.replace(/_/g, "-").split("-").map((p, i) => (i === 0 ? p.toLowerCase() : p.length === 2 ? p.toUpperCase() : p)).join("-"));
  return m?.[1] ?? null;
}

/** What my_entitlement() returns. The server's answer, never the phone's guess. */
export interface EntitlementRow {
  entitled: boolean;
  storefront: string | null;
  saves_used: number;
  free_saves: number;
  status: string | null;
  will_renew: boolean | null;
  current_period_end: string | null;
  product_id: string | null;
}

export type Standing =
  /** A free region — or a phone that has not yet said where it buys from, which the server does not gate. */
  | { kind: "free_region" }
  | { kind: "subscribed"; renews: boolean; until: string | null; product: string | null }
  | { kind: "billing_issue"; until: string | null; product: string | null }
  | { kind: "ramp"; used: number; of: number; left: number }
  | { kind: "blocked"; lapsed: boolean };

/** The server's row, as a screen shows it. */
export function standing(row: EntitlementRow, now: Date): Standing {
  if (row.storefront === null || row.storefront === "IN") return { kind: "free_region" };
  const running = !!row.current_period_end && new Date(row.current_period_end) > now;
  if (row.status === "active" && running) return { kind: "subscribed", renews: row.will_renew !== false, until: row.current_period_end, product: row.product_id };
  if (row.status === "billing_issue" && running) return { kind: "billing_issue", until: row.current_period_end, product: row.product_id };
  if (row.saves_used < row.free_saves) return { kind: "ramp", used: row.saves_used, of: row.free_saves, left: row.free_saves - row.saves_used };
  if (row.entitled) return { kind: "subscribed", renews: row.will_renew !== false, until: row.current_period_end, product: row.product_id };
  return { kind: "blocked", lapsed: row.status !== null };
}

