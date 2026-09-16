import {
  atlasValuationCatalog,
  valuationPointAvailable,
  type ValuationDataset,
  type ValuationMetric,
} from "./atlas-valuation";
import type {
  AtlasValuationResponse,
  ValuationSeries,
} from "./atlas-valuation-types";

/** Compare the same published industry/definition, never substitute a broader region. */
export function valuationComparisonRegion(
  dataset: ValuationDataset,
  scope: string | null | undefined,
) {
  if (dataset.kind !== "industries" || !scope || scope === dataset.regionId)
    return null;
  return (
    atlasValuationCatalog.datasets.find(
      (d) =>
        d.kind === "industries" &&
        d.regionId === scope &&
        d.id.split("-")[0] === dataset.id.split("-")[0],
    ) ?? null
  );
}
type RegionComparison =
  | { status: "available"; series: ValuationSeries; commonYears: number[] }
  | {
      status:
        | "not_ready"
        | "incompatible_source"
        | "missing_industry"
        | "missing_definition"
        | "no_common_years";
      commonYears: number[];
    };
export function valuationRegionalComparison(
  base: AtlasValuationResponse | undefined,
  other: AtlasValuationResponse | undefined,
  dataset: ValuationDataset,
  comparison: ValuationDataset,
  subjectId: string,
  metric: ValuationMetric,
): RegionComparison {
  const unavailable = (
    status: Exclude<RegionComparison["status"], "available">,
  ): RegionComparison => ({ status, commonYears: [] });
  if (!base?.data || !other?.data) return unavailable("not_ready");
  const pairs = [
    { response: base, definition: dataset },
    { response: other, definition: comparison },
  ];
  if (
    valuationComparisonRegion(dataset, comparison.regionId)?.id !==
      comparison.id ||
    pairs.some(
      ({ response, definition }) =>
        response.status !== "available" ||
        response.datasetId !== definition.id ||
        response.data!.datasetId !== definition.id ||
        response.data!.provenance.catalogVersion !==
          atlasValuationCatalog.version,
    )
  )
    return unavailable("incompatible_source");
  const industry = atlasValuationCatalog.industries.find(
    (i) => i.id === subjectId && i.active,
  );
  const subjects = pairs.map(({ response }) =>
    response.data!.subjects.find(
      (s) => s.id === subjectId && s.providerLabel === industry?.providerLabel,
    ),
  );
  if (subjects.some((s) => !s)) return unavailable("missing_industry");
  const series = subjects.map((s) =>
    s!.series.find((s) => s.metricId === metric.id),
  );
  if (series.some((s) => !s)) return unavailable("missing_definition");
  for (let i = 0; i < pairs.length; i++) {
    const { response, definition } = pairs[i];
    const seen = new Set<number>();
    for (const point of series[i]!.points) {
      const expected = definition.files.find(
        (f) =>
          f.fileName === point.sourceFile &&
          f.publicationYear === point.year &&
          f.fields.some((v) => v.metricId === metric.id),
      );
      const source = response.data!.provenance.files.find(
        (f) =>
          f.fileName === point.sourceFile && f.publicationYear === point.year,
      );
      if (
        !expected ||
        !source ||
        source.url !== expected.url ||
        source.workbookDate !== expected.workbookDate ||
        !/^[a-f0-9]{64}$/.test(source.sha256) ||
        (expected.reviewedSha256 &&
          source.sha256 !== expected.reviewedSha256) ||
        seen.has(point.year)
      )
        return unavailable("incompatible_source");
      seen.add(point.year);
    }
  }
  const commonYears = series[0]!.points
    .filter(
      (p) =>
        valuationPointAvailable(p, metric) &&
        series[1]!.points.some(
          (q) =>
            q.year === p.year &&
            q.methodEpoch === p.methodEpoch &&
            valuationPointAvailable(q, metric),
        ),
    )
    .map((p) => p.year)
    .sort((a, b) => a - b);
  if (!commonYears.length) return unavailable("no_common_years");
  return { status: "available", series: series[1]!, commonYears };
}

/** Compact consecutive years without hiding holes in the common source history. */
export function valuationYearRanges(years: number[]) {
  const ranges: number[][] = [];
  for (const year of [...new Set(years)].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] + 1 === year) last[1] = year;
    else ranges.push([year, year]);
  }
  return ranges
    .map(([first, last]) =>
      first === last ? String(first) : `${first}–${last}`,
    )
    .join(", ");
}
export const regionalComparisonMessage: Record<
  Exclude<RegionComparison["status"], "available">,
  string
> = {
  not_ready: "Die Vergleichsregion wurde noch nicht lokal geladen.",
  incompatible_source:
    "Die Quellenstände sind nicht gemeinsam geprüft. Bitte die betroffenen Pakete aktualisieren.",
  missing_industry:
    "Für dieselbe Branche fehlt in der Vergleichsregion eine eigene Quellenreihe.",
  missing_definition:
    "Diese Kennzahl ist für die Branche in der Vergleichsregion nicht verfügbar.",
  no_common_years:
    "Für diese Kennzahl gibt es keine gemeinsamen sinnvollen Veröffentlichungsjahre derselben Definition. Die Stände werden nicht überlagert.",
};
