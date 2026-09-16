import type { AtlasPoint, AtlasSeriesResponse } from "./atlas-types";
import { atlasSeriesComparable, atlasSdgCatalog } from "./atlas-source-series";

export const atlasUnits: Record<string, string> = {
  ...Object.fromEntries(
    atlasSdgCatalog.series.map((series) => [series.unit, series.unit]),
  ),
  persons: "Einwohner",
  migrants: "Internationale Migranten · geschätzte Personenanzahl",
  migrants_per_year: "Zu- minus Abwanderung · Personen pro Jahr",
  percent_population: "Anteil an der Bevölkerung (%)",
  percent_rural_population: "Anteil an der ländlichen Bevölkerung (%)",
  percent_urban_population: "Anteil an der städtischen Bevölkerung (%)",
  percent_children_under5: "Anteil an Kindern unter fünf Jahren (%)",
  percent_population_15_49: "Anteil an der Bevölkerung von 15–49 Jahren (%)",
  percent_population_15_24: "Anteil an der Bevölkerung von 15–24 Jahren (%)",
  maternal_deaths_per_100000_live_births:
    "Müttersterbefälle je 100.000 Lebendgeburten",
  malaria_cases_per_1000_at_risk: "Malariafälle je 1.000 Menschen unter Risiko",
  tb_cases_per_100000_people: "Tuberkulosefälle je 100.000 Einwohner",
  nurses_midwives_per_1000: "Pflegekräfte und Hebammen je 1.000 Einwohner",
  fertilizer_kg_per_arable_hectare:
    "Kilogramm Düngernährstoffe je Hektar Ackerland",
  percent_agricultural_land: "Anteil an der landwirtschaftlichen Fläche (%)",
  arable_hectares_per_person: "Hektar Ackerland je Einwohner",
  metric_tonnes: "Metrische Tonnen",
  percent_merchandise_imports: "Anteil am Wert der Warenimporte (%)",
  percent_merchandise_exports: "Anteil am Wert der Warenexporte (%)",
  percent_gni: "Anteil am Bruttonationaleinkommen (%)",
  current_usd_per_person: "Laufende US-Dollar je Einwohner",
  current_usd: "Laufende US-Dollar",
  percent_exports_primary_income:
    "Anteil an Exporten von Waren, Dienstleistungen und Primäreinkommen (%)",
  months_of_imports: "Importmonate",
  births_per_1000_women_15_19: "Geburten je 1.000 Frauen von 15–19 Jahren",
  percent_income_consumption: "Anteil am gesamten Einkommen oder Konsum (%)",
  births_per_woman: "Geburten je Frau",
  constant_2015_usd_per_person:
    "Preisbereinigte US-Dollar je Einwohner (Basis 2015)",
  percent_labor_force: "Anteil an den Erwerbspersonen (%)",
  percent_gross_enrollment: "Bruttoeinschulungsquote (%)",
  percent_gdp: "Anteil an der Wirtschaftsleistung (%)",
  percent_employment: "Anteil an allen Erwerbstätigen (%)",
  percent_manufacturing_value_added:
    "Anteil an der Wertschöpfung des verarbeitenden Gewerbes (%)",
  percent_gross_intake: "Bruttozugang zur Abschlussklasse (%)",
  percent_population_15plus: "Anteil an der Bevölkerung ab 15 Jahren (%)",
  pupils_per_teacher: "Lernende je Lehrkraft",
  physicians_per_1000: "Ärztinnen und Ärzte je 1.000 Einwohner",
  beds_per_1000: "Krankenhausbetten je 1.000 Einwohner",
  percent_children_12_23months:
    "Anteil an Kindern im Alter von 12–23 Monaten (%)",
  years: "Jahre",
  deaths_per_1000_live_births:
    "Sterbefälle vor dem 5. Geburtstag je 1.000 Lebendgeburten",
  percent_annual_change: "Jährliche Veränderung (%)",
  percent_youth_labor_force:
    "Anteil an den Erwerbspersonen von 15–24 Jahren (%)",
  constant_2021_ppp_per_worker:
    "Internationale Dollar je Erwerbstätigen (Kaufkraftbasis 2021)",
  gini_index: "Gini-Index · höher = ungleicher",
  constant_2015_usd: "Preisbereinigte US-Dollar (Basis 2015)",
  index_2014_2016: "Produktionsindex (2014–2016 = 100)",
  kg_per_harvested_hectare: "Kilogramm je abgeerntetem Hektar",
  percent_land_area: "Anteil an der Landfläche (%)",
  percent_available_freshwater:
    "Entnahme im Verhältnis zum verfügbaren Süßwasser (%)",
  subscriptions_per_100_people: "Anschlüsse / Verträge je 100 Einwohner",
  researcher_fte_per_million:
    "Forschende in Vollzeitäquivalenten je Million Einwohner",
  patent_applications: "Patentanmeldungen",
  micrograms_per_m3: "Mikrogramm PM2,5 je Kubikmeter Luft",
  tonnes_co2e_per_person:
    "Tonnen CO₂-Äquivalente je Einwohner · nur CO₂, ohne Landnutzung",
  passenger_boardings: "Beförderte Fluggäste",
  container_teu: "Containerumschlag (TEU)",
  route_km: "Betriebene Streckenkilometer",
  mj_per_2021_ppp_gdp:
    "Megajoule je internationalem Dollar Wirtschaftsleistung (Kaufkraftbasis 2021)",
  percent_primary_energy_use: "Anteil am Primärenergieverbrauch (%)",
  percent_electricity_output: "Anteil an der Stromproduktion (%)",
  registrations_per_1000_15_64:
    "Neuregistrierungen je 1.000 Menschen von 15–64 Jahren",
  index_2015: "Index (2015 = 100)",
  price_level_us100: "Preisniveauindex (USA = 100 im jeweiligen Jahr)",
  logistics_index_1_5: "Logistikindex · 1 = niedrig, 5 = hoch",
  shipping_index_2004_max: "Index (höchster Länderwert 2004 = 100)",
  percent_advanced_education_working_age:
    "Anteil an Menschen im Erwerbsalter mit tertiärer Bildung (%)",
};

/** Include zero and real negative values; gross/GDP ratios can exceed 100. */
export function atlasValueDomain(values: (number | null)[]) {
  const usable = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (!usable.length) return null;
  const min = Math.min(0, ...usable);
  const max = Math.max(0, ...usable);
  return { min, max: min === max ? 1 : max };
}

export function atlasIsolatedPoint(values: (number | null)[], index: number) {
  return (
    values[index] != null &&
    values[index - 1] == null &&
    values[index + 1] == null
  );
}

export function atlasExtent(points: AtlasPoint[]) {
  const years = points
    .filter((point) => point.value !== null && Number.isFinite(point.value))
    .map((point) => point.year);
  return years.length
    ? { first: Math.min(...years), last: Math.max(...years) }
    : null;
}

export function atlasQuality(
  data: AtlasSeriesResponse,
  currentYear = new Date().getFullYear(),
) {
  const extent = atlasExtent(data.points);
  if (!extent)
    return {
      extent: null,
      gaps: [],
      old: false,
      trend: "Keine Werte verfügbar",
    };
  const values = new Map(data.points.map((point) => [point.year, point.value]));
  const gaps = Array.from(
    { length: extent.last - extent.first + 1 },
    (_, index) => extent.first + index,
  ).filter((year) => values.get(year) == null);
  const first = values.get(extent.first)!;
  const last = values.get(extent.last)!;
  const trend =
    extent.first === extent.last
      ? "Einzelner Datenpunkt"
      : first === last
        ? "Am Anfang und Ende auf gleichem Niveau"
        : last > first
          ? "Über den gezeigten Zeitraum gestiegen"
          : "Über den gezeigten Zeitraum gesunken";
  return { extent, gaps, old: extent.last < currentYear - 3, trend };
}

export function atlasComparison(series: AtlasSeriesResponse[]) {
  if (series.length > 1 && !atlasSeriesComparable(series[0].series))
    return null;
  const extents = series.map((row) => atlasExtent(row.points));
  if (!series.length || extents.some((range) => range === null)) return null;
  if (
    series.some(
      (row) =>
        row.series.id !== series[0].series.id ||
        row.series.unit !== series[0].series.unit,
    )
  )
    return null;
  if (
    series.some(
      (row) =>
        row.provenance?.retrievedAt !== series[0].provenance?.retrievedAt,
    )
  )
    return null;
  const first = Math.max(...extents.map((range) => range!.first));
  const last = Math.min(...extents.map((range) => range!.last));
  if (first > last) return null;
  const years = Array.from(
    { length: last - first + 1 },
    (_, index) => first + index,
  );
  const rows = series.map((series) => {
    const points = new Map(
      series.points.map((point) => [point.year, point.value]),
    );
    return {
      name: series.geography.label,
      values: years.map((year) => points.get(year) ?? null),
    };
  });
  // A shared outer interval alone does not prove an actual comparable observation.
  if (
    !years.some((_, index) => rows.every((row) => row.values[index] !== null))
  )
    return null;
  return { first, last, years, rows };
}

export function atlasDisplayedQuality(series: AtlasSeriesResponse[]) {
  const view = atlasComparison(series);
  if (!view) return null;
  return atlasQuality({
    ...series[0],
    points: series[0].points.filter(
      (point) => point.year >= view.first && point.year <= view.last,
    ),
  });
}
