import config from "./data/energy-catalog.json";
import type { AtlasGeography } from "./atlas-types";

export const atlasEnergyDataset = "ember-yearly-electricity";
export const atlasEnergyCatalog = config;
export type EnergyMeasure = "share" | "generation" | "capacity" | "per_capita";
export type EnergyMode =
  | { kind: "fuel"; fuelId: string; label: string }
  | { kind: "mix" | "demand" | "total" | "net_imports" };
export interface EnergyYear {
  year: number;
  values: Record<string, number | null>;
}
export interface AtlasEnergyResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: {
    geographyId: string;
    providerLabel: string;
    aggregate: boolean;
    years: EnergyYear[];
  } | null;
  provenance: {
    retrievedAt: string;
    sourceUpdatedAt: string | null;
    etag: string | null;
    source: { url: string; sha256: string };
    sourceRowCount: number;
    areaCount: number;
    yearFirst: number;
    yearLast: number;
  } | null;
}

export function atlasEnergyMode(topicId: string): EnergyMode | undefined {
  const fuel = config.fuels.find((fuel) => fuel.topicId === topicId);
  if (fuel) return { kind: "fuel", fuelId: fuel.id, label: fuel.label };
  const kind = (
    {
      "electricity:generation_mix": "mix",
      "electricity:electricity_demand": "demand",
      "electricity:total_generation": "total",
      "electricity:net_imports": "net_imports",
    } as Record<string, "mix" | "demand" | "total" | "net_imports">
  )[topicId];
  return kind ? { kind } : undefined;
}

export function energyMetric(mode: EnergyMode, measure: EnergyMeasure) {
  if (mode.kind === "fuel") {
    if (measure === "capacity")
      return {
        key: `capacity.${mode.fuelId}`,
        label: "Installierte elektrische Leistung",
        unit: "GW",
      };
    if (measure === "generation")
      return {
        key: `generation.${mode.fuelId}`,
        label: "Jährliche Stromerzeugung",
        unit: "TWh",
      };
    return {
      key: `share.${mode.fuelId}`,
      label: "Anteil an der heimischen Stromerzeugung",
      unit: "%",
    };
  }
  if (mode.kind === "demand")
    return measure === "per_capita"
      ? {
          key: "demand_per_capita",
          label: "Jährlicher Strombedarf je Einwohner",
          unit: "MWh",
        }
      : { key: "demand", label: "Jährlicher Strombedarf", unit: "TWh" };
  if (mode.kind === "net_imports")
    return { key: "net_imports", label: "Strom-Nettoimporte", unit: "TWh" };
  if (mode.kind === "total")
    return {
      key: "generation.total",
      label: "Gesamte jährliche Stromerzeugung",
      unit: "TWh",
    };
  return {
    key: "mix",
    label: "Zusammensetzung der heimischen Stromerzeugung",
    unit: "%",
  };
}

function valueAt(year: EnergyYear, key: string) {
  const value = year.values[key];
  return value != null && Number.isFinite(value) ? value : null;
}

export function energyMix(year: EnergyYear): number[] | null {
  const values = config.fuels.map((fuel) => valueAt(year, `share.${fuel.id}`));
  if (values.some((v) => v === null || v < 0 || v > 100)) return null;
  const complete = values as number[];
  const total = complete.reduce((sum, value) => sum + value, 0);
  // An all-zero source year has no composition. Never normalize incomplete
  // shares or invent a zero contribution for an absent fuel.
  return total > 0 && Math.abs(total - 100) <= 0.051 ? complete : null;
}

export function energyUnavailableReason(
  rows: AtlasEnergyResponse[],
  mode: EnergyMode,
  measure: EnergyMeasure,
  since: number,
) {
  const metric = energyMetric(mode, measure);
  const missing = rows.filter(
    (row) =>
      !row.profile?.years.some(
        (year) =>
          year.year >= since &&
          (mode.kind === "mix"
            ? energyMix(year) !== null
            : valueAt(year, metric.key) !== null),
      ),
  );
  if (missing.length)
    return `Für ${missing.map((row) => row.geography.label).join(" und ")} fehlen im gewählten Zeitraum Werte für „${metric.label}“.${mode.kind === "mix" ? " Ein vollständiger Strommix benötigt alle Erzeugungsarten und eine ausgewiesene Erzeugung." : " Andere Stromgrößen können für dieses Gebiet trotzdem verfügbar sein."}`;
  const source = rows[0]?.provenance;
  if (
    rows.some(
      (row) =>
        row.provenance?.retrievedAt !== source?.retrievedAt ||
        row.provenance?.source.sha256 !== source?.source.sha256,
    )
  )
    return "Die Gebiete liegen noch nicht im selben lokalen Veröffentlichungsstand vor. Der Vergleich wird nach dem Laden beider Profile verfügbar.";
  return "Für die gewählten Gebiete fehlen gemeinsame gültige Jahreswerte dieser Stromgröße im ausgewählten Zeitraum.";
}

export function energyView(
  rows: AtlasEnergyResponse[],
  mode: EnergyMode,
  measure: EnergyMeasure,
  since: number,
) {
  const source = rows[0]?.provenance;
  if (
    !source ||
    rows.some(
      (row) =>
        row.status !== "available" ||
        !row.profile ||
        row.profile.geographyId !== row.geography.id ||
        !row.provenance ||
        row.provenance.retrievedAt !== source.retrievedAt ||
        row.provenance.source.sha256 !== source.source.sha256 ||
        row.provenance.source.url !== config.sourceUrl,
    )
  )
    return null;
  const metric = energyMetric(mode, measure);
  const selected = rows.map((row) =>
    row
      .profile!.years.filter((p) => p.year >= since)
      .map((p) => ({
        year: p.year,
        value: mode.kind === "mix" ? energyMix(p) : valueAt(p, metric.key),
      })),
  );
  const available = selected.map((years) =>
    years.filter((p) => p.value !== null),
  );
  if (available.some((years) => !years.length)) return null;
  const first = Math.max(
    ...available.map((years) => Math.min(...years.map((p) => p.year))),
  );
  const last = Math.min(
    ...available.map((years) => Math.max(...years.map((p) => p.year))),
  );
  if (last < first) return null;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const aligned = selected.map((points, i) => {
    const byYear = new Map(points.map((p) => [p.year, p.value]));
    return {
      id: rows[i].geography.id,
      name: rows[i].geography.label,
      values: years.map((year) => byYear.get(year) ?? null),
    };
  });
  if (!years.some((_, i) => aligned.every((row) => row.values[i] !== null)))
    return null;
  return {
    years,
    first,
    last,
    metric,
    rows: aligned,
    sparse: aligned.some((row) => row.values.some((v) => v === null)),
  };
}
