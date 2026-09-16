// Rebuild the reviewed metadata catalog from a saved public EODHD GBOND symbol list.
// No credentials, market observations or journal data are read by this generator.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input)
  throw new Error("Provide the path to the reviewed GBOND symbol-list JSON.");
const raw = fs.readFileSync(input);
const source = JSON.parse(raw);
const atlas = JSON.parse(
  fs.readFileSync(
    path.join(root, "src/features/world-atlas/data/catalog.json"),
    "utf8",
  ),
);
// Provider prefixes are NOT ISO country codes. Explicit mappings were checked against names.
const countriesByPrefix = Object.fromEntries(
  `AT:AUT AU:AUS BD:BGD BE:BEL BR:BRA CA:CAN CH:CHL CI:CIV CN:CHN CO:COL CZ:CZE DE:DEU DK:DNK EG:EGY ES:ESP FI:FIN FR:FRA GR:GRC HK:HKG HR:HRV HU:HUN ID:IDN IL:ISR IN:IND IT:ITA JP:JPN KE:KEN KR:KOR KZ:KAZ LK:LKA MA:MAR MU:MUS MX:MEX MY:MYS NA:NAM NG:NGA NL:NLD NO:NOR NZ:NZL PH:PHL PK:PAK PL:POL PT:PRT RO:ROU RS:SRB RU:RUS SE:SWE SG:SGP SI:SVN SK:SVK SW:CHE TH:THA TR:TUR TW:TWN UG:UGA UK:GBR US:USA VN:VNM ZA:ZAF ZM:ZMB`
    .split(" ")
    .map((x) => x.split(":")),
);
const countries = atlas.geographies
  .filter((g) => g.iso3 && g.kind !== "aggregate")
  .map((g) => ({ id: g.iso3, name: g.label, region: g.regionId }))
  .sort((a, b) => a.id.localeCompare(b.id));
if (new Set(countries.map((g) => g.id)).size !== countries.length)
  throw new Error("Duplicate country identity");
const excluded = [];
const instruments = source.flatMap((row) => {
  if (row.Code === "USDSB3L1Y") {
    excluded.push({
      symbol: `${row.Code}.GBOND`,
      reason: "Zinsswap; keine Staatsanleihe.",
    });
    return [];
  }
  const match = /^([A-Z]{2})([1-9][0-9]*)(M|Y)$/.exec(row.Code);
  const countryId = match && countriesByPrefix[match[1]];
  if (!countryId || row.Exchange !== "GBOND" || row.Type !== "BOND")
    throw new Error(`Unreviewed instrument: ${row.Code}`);
  if (!countries.some((g) => g.id === countryId))
    throw new Error(`Country missing: ${countryId}`);
  return [
    {
      symbol: `${row.Code}.GBOND`,
      countryId,
      name: row.Name,
      maturityMonths: Number(match[2]) * (match[3] === "Y" ? 12 : 1),
      currency: row.Currency || null,
      providerCountry: row.Country || null,
    },
  ];
});
const catalog = {
  reviewedAt: "2026-09-10",
  sourceUrl: "https://eodhd.com/api/exchange-symbol-list/GBOND",
  methodologyUrl: "https://eodhd.com/financial-apis/macroeconomic-data-api",
  sha256: crypto.createHash("sha256").update(raw).digest("hex"),
  countries,
  instruments,
  excluded,
};
const destination = path.join(
  root,
  "src/features/government-bonds/data/catalog.json",
);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  JSON.stringify({
    countries: countries.length,
    coveredCountries: new Set(instruments.map((i) => i.countryId)).size,
    instruments: instruments.length,
    excluded: excluded.length,
  }),
);
