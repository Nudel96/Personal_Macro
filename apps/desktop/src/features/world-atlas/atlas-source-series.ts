import sdg from "./data/sdg-catalog.json";
import africa from "./data/africa-development-catalog.json";
import type { AtlasSeriesDefinition } from "./atlas-types";

export const atlasSdgCatalog = sdg;
export const atlasSdgDefinition = (id: string) =>
  sdg.series.find((item) => item.id === id);
export const atlasSeriesSource = (definition: AtlasSeriesDefinition) =>
  definition.sourceId === "unsdg"
    ? "UN · Global SDG Database"
    : "Weltbank · WDI";
export const atlasSeriesConnect = (definition: AtlasSeriesDefinition) =>
  atlasSdgDefinition(definition.id)?.connect ??
  africa.series.find((item) => item.id === definition.id)?.connect ??
  true;
export const atlasSeriesComparable = (definition: AtlasSeriesDefinition) =>
  atlasSdgDefinition(definition.id)?.compare ?? true;

export interface AtlasSdgPointSource {
  provider: "unsdg";
  value: string | null;
  lowerBound: string | null;
  upperBound: string | null;
  source: string | null;
  timeDetail: string | null;
  timeCoverage: string | null;
  basePeriod: string | null;
  footnotes: string[] | null;
  attributes: Record<string, string>;
}
export function atlasSdgPointSource(flag: string): AtlasSdgPointSource | null {
  if (!flag.startsWith("{")) return null;
  try {
    const value = JSON.parse(flag) as AtlasSdgPointSource;
    return value.provider === "unsdg" && value.attributes ? value : null;
  } catch {
    return null;
  }
}
export const atlasSdgNature = (code?: string) =>
  ({
    C: "Länderstatistik",
    CA: "Angepasste Länderstatistik",
    E: "Schätzung",
    M: "Modell",
    G: "Globale Quellenstatistik",
    N: "Datenart nicht anwendbar (N)",
    NA: "Datenart nicht verfügbar",
  })[code ?? ""] ?? `Quellenkennzeichen ${code || "nicht verfügbar"}`;
