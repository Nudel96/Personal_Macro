import source from "./data/valuation-catalog.json";
import topicLinks from "./data/valuation-topic-links.json";
import type { ValuationPoint, ValuationSeries } from "./atlas-valuation-types";

export interface ValuationDataset {
  id: string;
  kind: string;
  regionId: string;
  label: string;
  scopeLabel: string;
  files: {
    fileName: string;
    url: string;
    publicationYear: number;
    workbookDate: string | null;
    reviewedSha256: string | null;
    regionCell: string | null;
    sheetName: string;
    headerRow: number;
    subjectHeader: string;
    countHeader: string;
    expectedSubjects: number;
    fields: { metricId: string; header: string }[];
    ambiguousSubjects: string[];
  }[];
}
export const atlasValuationCatalog: Omit<typeof source, "datasets"> & {
  datasets: ValuationDataset[];
} = source;
export const atlasValuationJobPrefix = "damodaran:";
export const valuationCountryScopes: Record<string, string> = {
  world: "global",
  "m49:840": "us",
  "m49:392": "japan",
  "m49:156": "china",
  "m49:356": "india",
};
export const atlasValuationTopicLinks = topicLinks;
export const valuationTopicIndustries: Record<string, string[]> =
  Object.fromEntries(
    topicLinks.bindings.map((link) => [link.topicId, link.providerLabels]),
  );
export function valuationTopicSelection(topicId: string | null | undefined) {
  return topicLinks.bindings.find((link) => link.topicId === topicId) ?? null;
}
export const valuationMetrics = source.metrics;
export type ValuationMetric = (typeof valuationMetrics)[number];

// Editorial navigation groups; no numerical aggregation or source reclassification.
export const valuationGroups = [
  {
    id: "energy",
    label: "Energie & Versorgung",
    names: [
      "Coal & Related Energy",
      "Green & Renewable Energy",
      "Oil/Gas (Integrated)",
      "Oil/Gas (Production and Exploration)",
      "Oil/Gas Distribution",
      "Oilfield Svcs/Equip.",
      "Power",
      "Utility (General)",
      "Utility (Water)",
    ],
  },
  {
    id: "health",
    label: "Gesundheit & Bildung",
    names: [
      "Drugs (Biotechnology)",
      "Drugs (Pharmaceutical)",
      "Education",
      "Healthcare Products",
      "Healthcare Support Services",
      "Heathcare Information and Technology",
      "Hospitals/Healthcare Facilities",
    ],
  },
  {
    id: "digital",
    label: "Technologie & Kommunikation",
    names: [
      "Computer Services",
      "Computers/Peripherals",
      "Electronics (Consumer & Office)",
      "Electronics (General)",
      "Information Services",
      "Semiconductor",
      "Semiconductor Equip",
      "Software (Entertainment)",
      "Software (Internet)",
      "Software (System & Application)",
      "Telecom (Wireless)",
      "Telecom. Equipment",
      "Telecom. Services",
    ],
  },
  {
    id: "finance",
    label: "Finanzen",
    names: [
      "Bank (Money Center)",
      "Banks (Regional)",
      "Brokerage & Investment Banking",
      "Financial Svcs. (Non-bank & Insurance)",
      "Insurance (General)",
      "Insurance (Life)",
      "Insurance (Prop/Cas.)",
      "Investments & Asset Management",
      "Reinsurance",
    ],
  },
  {
    id: "industry",
    label: "Industrie & Verkehr",
    names: [
      "Aerospace/Defense",
      "Air Transport",
      "Auto & Truck",
      "Auto Parts",
      "Diversified",
      "Electrical Equipment",
      "Machinery",
      "Office Equipment & Services",
      "Rubber& Tires",
      "Shipbuilding & Marine",
      "Transportation",
      "Transportation (Railroads)",
      "Trucking",
    ],
  },
  {
    id: "materials",
    label: "Rohstoffe & Umwelt",
    names: [
      "Chemical (Basic)",
      "Chemical (Diversified)",
      "Chemical (Specialty)",
      "Environmental & Waste Services",
      "Farming/Agriculture",
      "Metals & Mining",
      "Packaging & Container",
      "Paper/Forest Products",
      "Precious Metals",
      "Steel",
    ],
  },
  {
    id: "housing",
    label: "Bauen & Wohnen",
    names: [
      "Building Materials",
      "Construction Supplies",
      "Engineering/Construction",
      "Furn/Home Furnishings",
      "Homebuilding",
      "R.E.I.T.",
      "Real Estate (Development)",
      "Real Estate (General/Diversified)",
      "Real Estate (Operations & Services)",
      "Retail (Building Supply)",
      "Retail (REITs)",
    ],
  },
  {
    id: "consumer",
    label: "Konsum & Handel",
    names: [
      "Apparel",
      "Beverage (Alcoholic)",
      "Beverage (Soft)",
      "Food Processing",
      "Food Wholesalers",
      "Household Products",
      "Restaurant/Dining",
      "Retail (Automotive)",
      "Retail (Distributors)",
      "Retail (General)",
      "Retail (Grocery and Food)",
      "Retail (Special Lines)",
      "Shoe",
      "Tobacco",
    ],
  },
  {
    id: "services",
    label: "Dienste, Medien & Freizeit",
    names: [
      "Advertising",
      "Broadcasting",
      "Business & Consumer Services",
      "Cable TV",
      "Entertainment",
      "Hotel/Gaming",
      "Publishing & Newspapers",
      "Recreation",
    ],
  },
  {
    id: "market",
    label: "Gesamte Stichprobe",
    names: ["Total Market", "Total Market (without financials)", "Grand Total"],
  },
];

export function valuationGroupIndustries(
  groupId: string,
  search = "",
  topicId?: string | null,
) {
  const group =
    valuationGroups.find((g) => g.id === groupId) ?? valuationGroups[0];
  const query = search.trim().toLocaleLowerCase("de");
  const selection = valuationTopicSelection(topicId);
  return source.industries
    .filter(
      (i) =>
        i.active &&
        (selection
          ? selection.providerLabels.includes(i.providerLabel)
          : Boolean(query) || group.names.includes(i.providerLabel)) &&
        (!query ||
          `${i.label} ${i.providerLabel}`
            .toLocaleLowerCase("de")
            .includes(query)),
    )
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function valuationTopicTarget(
  topicId: string,
  geographyId: string,
): Record<string, string> | null {
  if (
    [
      "market_context:historical_valuation",
      "market_context:earnings_quality",
    ].includes(topicId)
  ) {
    return {
      view: "valuation",
      valMode: "countries",
      valTopic: "",
      valMetric: topicId.endsWith("earnings_quality")
        ? "country_median_pe_trailing"
        : "country_median_pbv",
      valSubject: "",
      valCompare: "",
      valCompareScope: "",
    };
  }
  const names = valuationTopicIndustries[topicId];
  if (!names?.length) return null;
  const industry = atlasValuationCatalog.industries.find(
    (i) => i.providerLabel === names[0],
  )!;
  const group = valuationGroups.find((g) => g.names.includes(names[0]))!;
  return {
    view: "valuation",
    valMode: "industries",
    valTopic: topicId,
    valScope: valuationCountryScopes[geographyId] ?? "global",
    valBasis: "pbv",
    valMetric: "industry_pbv",
    valGroup: group.id,
    valSubject: names.length === 1 ? industry.id : "",
    valCompare: "",
    valCompareScope: "",
    valPage: "",
    valSearch: "",
  };
}

export function valuationDataset(
  mode: string | null,
  basis: string | null,
  scope: string | null,
) {
  if (mode !== "industries")
    return source.datasets.find((d) => d.id === "countries")!;
  const family = basis === "pe" ? "pe" : "pbv";
  return (
    source.datasets.find((d) => d.id === `${family}-${scope}`) ??
    source.datasets.find((d) => d.id === `${family}-global`)!
  );
}

export function valuationMetricChoices(dataset: ValuationDataset) {
  const ids = new Set(
    dataset.files.flatMap((f) => f.fields.map((v) => v.metricId)),
  );
  // Current country definition comes first; historical means remain explicitly selectable.
  return valuationMetrics
    .filter((m) => ids.has(m.id))
    .sort(
      (a, b) =>
        Number(a.id.includes("_mean_")) - Number(b.id.includes("_mean_")),
    );
}

export function valuationReading(series: ValuationSeries | undefined) {
  if (!series) return "Keine passende Kennzahl";
  const position = series.historicalPosition;
  if (position.status === "available" && position.percentile !== null) {
    if (position.percentile <= 20) return "Im unteren historischen Bereich";
    if (position.percentile >= 80) return "Im oberen historischen Bereich";
    return "Im mittleren historischen Bereich";
  }
  return (
    {
      insufficient_history: "Zu wenig vergleichbare Vorgeschichte",
      latest_not_meaningful: "Letzter Wert nicht sinnvoll einzuordnen",
      small_sample: "Sehr kleine Unternehmensstichprobe",
      no_reference_variation: "Keine aussagekräftige historische Spannweite",
      not_historical_valuation:
        "Für diese Definition keine historische Einordnung",
      available: "Keine historische Einordnung",
    } as const
  )[position.status];
}

export function valuationPointAvailable(
  point: ValuationPoint,
  metric: ValuationMetric,
) {
  return (
    point.status === "available" &&
    point.value !== null &&
    Number.isFinite(point.value) &&
    (!metric.positiveOnly || point.value > 0)
  );
}

export function valuationSegments(
  points: ValuationPoint[],
  metric: ValuationMetric,
) {
  const segments: ValuationPoint[][] = [];
  let current: ValuationPoint[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (!valuationPointAvailable(point, metric)) {
      current = [];
      continue;
    }
    if (
      !previous ||
      point.year !== previous.year + 1 ||
      point.methodEpoch !== previous.methodEpoch
    ) {
      current = [];
      segments.push(current);
    }
    current.push(point);
  }
  return segments;
}

export function valuationFrame(
  series: ValuationSeries[],
  metric: ValuationMetric,
  years: number[],
) {
  const points = series
    .flatMap((s) => s.points)
    .filter((p) => valuationPointAvailable(p, metric));
  if (!points.length) return null;
  const values = points.map((p) => p.value!);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(max - min, 0.001);
  return {
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    min: min - (min < 0 ? span * 0.06 : 0),
    max: max + span * 0.06,
  };
}
