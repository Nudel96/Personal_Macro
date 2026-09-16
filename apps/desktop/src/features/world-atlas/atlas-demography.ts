import type {
  AtlasDemographyResponse,
  AtlasDemographyYear,
} from "./atlas-demography-types";

export const atlasDemographyDataset = "un-wpp-2024-age5";
export type DemographyMode =
  "pyramid" | "population" | "working" | "dependency" | "age_shares" | "older";
const topics: Record<string, DemographyMode> = {
  "demography:age_structure": "pyramid",
  "demography:working_age": "working",
  "demography:dependency": "dependency",
  "demography:population_projection": "population",
  "structural_change:demographic_transition": "age_shares",
};
export const atlasDemographyMode = (
  topicId: string,
): DemographyMode | undefined => topics[topicId];
export const ageLabel = (start: number) =>
  start === 100 ? "100+" : `${start}–${start + 4}`;

export function demographicSummary(row: AtlasDemographyYear | undefined) {
  if (
    !row ||
    row.ages.length !== 21 ||
    row.ages.some(
      (age, i) =>
        age.ageStart !== i * 5 ||
        age.total == null ||
        !Number.isFinite(age.total) ||
        age.total < 0,
    )
  )
    return null;
  const sum = (from: number, until: number) =>
    row.ages
      .filter((age) => age.ageStart >= from && age.ageStart < until)
      .reduce((total, age) => total + age.total!, 0);
  const young = sum(0, 15);
  const working = sum(15, 65);
  const older = sum(65, 101);
  const total = young + working + older;
  if (total <= 0) return null;
  return {
    total,
    young,
    working,
    older,
    youngShare: (young / total) * 100,
    workingShare: (working / total) * 100,
    olderShare: (older / total) * 100,
    youthDependency: working > 0 ? (young / working) * 100 : null,
    oldDependency: working > 0 ? (older / working) * 100 : null,
  };
}

export function demographicPyramid(row: AtlasDemographyYear | undefined) {
  const summary = demographicSummary(row);
  if (
    !summary ||
    !row ||
    row.ages.some(
      (age) =>
        age.male == null ||
        age.female == null ||
        !Number.isFinite(age.male) ||
        !Number.isFinite(age.female) ||
        age.male < 0 ||
        age.female < 0,
    )
  )
    return null;
  return row.ages.map((age) => ({
    label: ageLabel(age.ageStart),
    male: (-100 * age.male!) / summary.total,
    female: (100 * age.female!) / summary.total,
  }));
}

export function demographicRows(
  rows: AtlasDemographyResponse[],
  includeProjections: boolean,
) {
  const available = rows.filter(
    (row) => row.status === "available" && row.profile && row.provenance,
  );
  if (!available.length) return [];
  // Comparable profiles must come from the same atomic release download.
  if (
    available.some(
      (row) =>
        row.provenance!.retrievedAt !== available[0].provenance!.retrievedAt ||
        row.provenance!.revision !== available[0].provenance!.revision,
    )
  )
    return [];
  const yearSets = available.map(
    (row) =>
      new Set(
        row
          .profile!.years.filter(
            (y) => includeProjections || y.kind === "estimate",
          )
          .map((y) => y.year),
      ),
  );
  return available.map((row) => ({
    ...row,
    years: row.profile!.years.filter((y) =>
      yearSets.every((years) => years.has(y.year)),
    ),
  }));
}

export function demographicMeasures(mode: Exclude<DemographyMode, "pyramid">) {
  switch (mode) {
    case "older":
      return [{ key: "olderShare" as const, label: "65 Jahre und älter" }];
    case "population":
      return [{ key: "total" as const, label: "Bevölkerung" }];
    case "working":
      return [{ key: "workingShare" as const, label: "15–64 Jahre" }];
    case "dependency":
      return [
        { key: "youthDependency" as const, label: "Jugendquotient" },
        { key: "oldDependency" as const, label: "Altenquotient" },
      ];
    case "age_shares":
      return [
        { key: "youngShare" as const, label: "Unter 15" },
        { key: "workingShare" as const, label: "15–64" },
        { key: "olderShare" as const, label: "65 und älter" },
      ];
  }
}
