import {
  atlasFindexCatalog,
  findexValue,
  validFindexResponse,
  type AtlasFindexResponse,
} from "./atlas-findex";
import {
  atlasCommodityCatalog,
  commodityTopics,
  commoditySeries,
  type AtlasCommodityResponse,
} from "./atlas-commodities";
import {
  atlasLaborCatalog,
  laborTopics,
  laborValue,
  validLaborResponse,
  type AtlasLaborResponse,
} from "./atlas-labor";
import {
  atlasInnovationCatalog,
  innovationTopics,
  innovationValue,
  validInnovationResponse,
  type AtlasInnovationResponse,
} from "./atlas-innovation";
import {
  atlasHealthCatalog,
  healthUnits,
  healthValue,
  validHealthResponse,
  type AtlasHealthResponse,
} from "./atlas-health";
import {
  atlasFiscalCatalog,
  atlasFiscalTopic,
  type AtlasFiscalResponse,
} from "./atlas-fiscal";
import {
  atlasDebtCatalog,
  debtPoints,
  debtTitle,
  type AtlasDebtResponse,
  type DebtSector,
} from "./atlas-debt";
import {
  atlasHouseholdsCatalog,
  householdValue,
  validHouseholdResponse,
  type AtlasHouseholdsResponse,
} from "./atlas-households";
import {
  atlasPropertyCatalog,
  propertyTopic,
  propertyMetric,
  type AtlasPropertyResponse,
} from "./atlas-property";
import {
  atlasMacrohistoryCatalog,
  atlasMacrohistoryTopic,
  type AtlasMacrohistoryResponse,
} from "./atlas-macrohistory";
import {
  atlasAgricultureCatalog,
  type AtlasAgricultureResponse,
} from "./atlas-agriculture";
import {
  atlasCreditCatalog,
  creditTopic,
  type AtlasCreditResponse,
} from "./atlas-credit";
import { atlasCatalog } from "./atlas-catalog";
import {
  capacityTechnologies,
  type AtlasCapacityResponse,
} from "./atlas-capacity";
import capacityMapping from "./data/capacity-geographies.json";
import mapping from "./data/coverage-catalog.json";
import {
  atlasDemographyMode,
  demographicPyramid,
  demographicSummary,
} from "./atlas-demography";
import type { AtlasDemographyResponse } from "./atlas-demography-types";
import {
  atlasHistoryMode,
  historyView,
  type AtlasHistoryResponse,
} from "./atlas-history";
import {
  atlasEnergyMode,
  energyView,
  type AtlasEnergyResponse,
} from "./atlas-energy";
import { atlasMarketProxies, atlasMarketReading } from "./atlas-markets";
import type { AtlasMarketResponse } from "./atlas-market-types";
import {
  relativeBenchmark,
  relativePicture,
  relativeProxies,
  relativeTopic,
} from "./atlas-relative";
import type { AtlasSeriesResponse } from "./atlas-types";
import { atlasSdgCatalog } from "./atlas-source-series";
import {
  atlasPublicCatalog,
  publicProfile,
  publicValue,
  type AtlasPublicResponse,
} from "./atlas-public";
import {
  atlasValuationCatalog,
  valuationCountryScopes,
  valuationTopicIndustries,
  valuationTopicSelection,
} from "./atlas-valuation";
import type { AtlasValuationResponse } from "./atlas-valuation-types";

import {
  atlasHousingRatiosCatalog,
  housingRatiosTopic,
  housingRatioMetric,
  type AtlasHousingRatiosResponse,
} from "./atlas-housing-ratios";

export const atlasCoverageMapping = mapping;
export type CoverageFamily =
  | `public:${string}`
  | keyof typeof mapping.families
  | "valuation"
  | "capacity"
  | "credit"
  | "debt"
  | "property"
  | "housingRatios"
  | "education"
  | "agriculture"
  | "macrohistory"
  | "households"
  | "findex"
  | "labor"
  | "commodities"
  | "innovation"
  | "health"
  | "fiscal"
  | "sdg";
export const coverageFamilies: {
  id: CoverageFamily;
  label: string;
  description: string;
}[] = [
  ...atlasPublicCatalog.sources.map((source) => ({
    id: `public:${source.id}` as const,
    label: source.label,
    description: `${source.areas.length} geprüfte Quellengebiete; ${source.firstPeriod} bis ${source.lastPeriod}. Die einzelnen Messgrößen behalten ihre Definition und Frequenz.`,
  })),
  {
    id: "sdg",
    label: "Weitere Sektor- und Gesellschaftsbilder · UN-SDG",
    description:
      "Recycling, Tourismus, Infrastruktur, informelle Arbeit, Armut, Artenrisiko und internationale Energiefinanzierung. Erhebungen und Schätzungen bleiben gekennzeichnet.",
  },
  {
    id: "findex",
    label: "Finanzielle Teilhabe · Findex",
    description:
      "42 Perspektiven, 162 Länder und Gebiete sowie zwölf veröffentlichte Aggregate. Einzelne Befragungen von 2011 bis 2024.",
  },
  {
    id: "commodities",
    label: "Rohstoffpreise · Weltbank",
    description:
      "85 internationale Preis- und Indexreihen seit frühestens 1960. Weltweite Referenzen mit eigenen Marktdefinitionen, keine Länderprofile.",
  },
  {
    id: "labor",
    label: "Beschäftigungsbilder · ILOSTAT",
    description:
      "14 Wirtschaftsbereiche, 188 Länder und Gebiete, Welt und ILO-Afrika; Modellgeschichte 1991–2024.",
  },
  {
    id: "innovation",
    label: "Technologiebilder · WIPO",
    description:
      "35 Technologiefelder und nicht zugeordnete Veröffentlichungen; 199 Länder und Gebiete, Geschichte ab frühestens 1980.",
  },
  {
    id: "health",
    label: "Gesundheitsbilder · WHO",
    description:
      "Finanzierung, Grundversorgung, Pflege und Investitionen; 38 Perspektiven für 195 Länder und Gebiete ab 2000.",
  },
  {
    id: "debt",
    label: "Haushalts- und Unternehmensschulden · BIS",
    description:
      "Zwei getrennte Schuldenquoten über Jahrzehnte, 43 Länder und Wirtschaftsgebiete, Euroraum sowie vier eigene Ländergruppen.",
  },
  {
    id: "households",
    label: "Haushaltsbilder · UN DESA",
    description:
      "Haushaltsgröße, Wohnformen und Generationen; 200 Länder und Gebiete, einzelne Erhebungen von 1959 bis 2025.",
  },
  {
    id: "fiscal",
    label: "Staatsfinanzen · IMF",
    description:
      "Historische Staatshaushalte, Schulden, Zinsen und Wachstum; 151 Länder und Gebiete, getrennte staatliche Abgrenzung.",
  },
  {
    id: "macrohistory",
    label: "Finanzgeschichte · JST",
    description:
      "Historische Wirtschaft, Kredit, Banken und Märkte für 18 Länder seit 1870; Quellenstand bis 2020.",
  },
  {
    id: "agriculture",
    label: "Agrarbilder · FAO",
    description:
      "Landwirtschaft und einzelne Agrarmärkte: langfristige Produktion insgesamt und je Einwohner.",
  },
  {
    id: "education",
    label: "Bildungsbilder · UNESCO UIS",
    description:
      "Schulzugang, Abschlüsse, Lernen, Lehrkräfte und Ausstattung; Erhebungen und Modelle getrennt.",
  },
  {
    id: "housingRatios",
    label: "Kaufpreise & Einkommen · OECD",
    description:
      "Wohnimmobilien im Verhältnis zu Einkommen und Mieten; veröffentlichte historische Vergleiche.",
  },
  {
    id: "property",
    label: "Immobilienbilder · BIS",
    description:
      "Wohnimmobilienpreise über Jahrzehnte; Inflation und jährliche Veränderung getrennt.",
  },
  {
    id: "credit",
    label: "Kreditbilder · BIS",
    description:
      "Private Schulden und ihre Abweichung vom langfristigen Modelltrend.",
  },
  {
    id: "capacity",
    label: "Anlagen & Technologien · IRENA",
    description:
      "Installierte elektrische Leistung; Netzanschluss und Teiltechnologien bleiben getrennt.",
  },
  {
    id: "valuation",
    label: "Bewertungsbilder · NYU",
    description:
      "Veröffentlichte Unternehmenskennzahlen für Länder; Branchen in ausdrücklich benannten Quellenregionen.",
  },
  {
    id: "statistics",
    label: "Länderstatistiken · Weltbank",
    description:
      "Bildung, Gesundheit, Wirtschaft, Versorgung und weitere Jahresreihen.",
  },
  {
    id: "demography",
    label: "Altersbilder · Vereinte Nationen",
    description:
      "Altersformen, Bevölkerungsentwicklung und ausdrücklich benannte Szenarien.",
  },
  {
    id: "energy",
    label: "Stromwirtschaft · Ember",
    description:
      "Erzeugungsanteile und Strommix; weitere Stromgrößen im großen Bild.",
  },
  {
    id: "history",
    label: "Jahrhundertperspektiven · Maddison",
    description:
      "Rekonstruierte Wirtschaftsleistung und historische Weltanteile.",
  },
  {
    id: "markets",
    label: "Börsenwellen & relative Stärke · EODHD",
    description:
      "Explizit zugeordnete Fonds, lange Kurslage und relative Monatsvergleiche. Keine fundamentale Bewertung.",
  },
];
export const coverageLabels = {
  available: "Bild lokal vorhanden",
  checking: "Lokalen Stand prüfen …",
  not_downloaded: "Noch nicht geladen",
  desktop_required: "In der Desktop-App prüfen / laden",
  empty: "Startansicht ohne nutzbare Werte",
  unsupported_area: "Kein zugeordnetes Quellengebiet",
  too_short: "Marktgeschichte für eine lange Welle zu kurz",
  elsewhere: "Nur für ein anderes Gebiet angebunden",
  unbound: "Noch keine geprüfte Datenanbindung",
  error: "Lokaler Lesefehler",
};
export type CoverageStatus = keyof typeof coverageLabels;
export type CoverageQuery<T> = { data?: T; error?: unknown };
export interface CoverageInputs {
  publicSources?: Record<string, CoverageQuery<AtlasPublicResponse>>;
  commodities?: CoverageQuery<AtlasCommodityResponse>;
  findex?: CoverageQuery<AtlasFindexResponse>;
  labor?: CoverageQuery<AtlasLaborResponse>;
  innovation?: CoverageQuery<AtlasInnovationResponse>;
  health?: CoverageQuery<AtlasHealthResponse>;
  debt?: CoverageQuery<AtlasDebtResponse>;
  households?: CoverageQuery<AtlasHouseholdsResponse>;
  fiscal?: CoverageQuery<AtlasFiscalResponse>;
  macrohistory?: CoverageQuery<AtlasMacrohistoryResponse>;
  agriculture?: CoverageQuery<AtlasAgricultureResponse>;
  education?: CoverageQuery<AtlasEducationResponse>;
  valuation?: CoverageQuery<AtlasValuationResponse>;
  valuationIndustries?: CoverageQuery<AtlasValuationResponse>;
  series: Record<string, CoverageQuery<AtlasSeriesResponse>>;
  demography: CoverageQuery<AtlasDemographyResponse>;
  history: CoverageQuery<AtlasHistoryResponse>;
  energy: CoverageQuery<AtlasEnergyResponse>;
  housingRatios?: CoverageQuery<AtlasHousingRatiosResponse>;
  property?: CoverageQuery<AtlasPropertyResponse>;
  credit?: CoverageQuery<AtlasCreditResponse>;
  capacity?: CoverageQuery<AtlasCapacityResponse>;
  markets: Record<string, CoverageQuery<AtlasMarketResponse>>;
}
export interface CoverageOption {
  id: string;
  topicId: string;
  family: CoverageFamily;
  label: string;
  status: CoverageStatus;
  years: number[];
  periodNote?: string;
  note?: string;
  target: Record<string, string>;
}
export function coverageMapped(family: CoverageFamily, geographyId: string) {
  if (family.startsWith("public:"))
    return (
      atlasPublicCatalog.sources
        .find((s) => `public:${s.id}` === family)
        ?.areas.some((a) => a.geographyId === geographyId) ?? false
    );
  if (family === "sdg")
    return atlasSdgCatalog.areas.some(
      (area) => area.geographyId === geographyId,
    );
  if (family === "commodities") return geographyId === "world";
  if (family === "findex")
    return atlasFindexCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "labor")
    return atlasLaborCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "innovation")
    return atlasInnovationCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "health")
    return atlasHealthCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "debt")
    return atlasDebtCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "households")
    return atlasHouseholdsCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "fiscal")
    return atlasFiscalCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "macrohistory")
    return atlasMacrohistoryCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "agriculture")
    return atlasAgricultureCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "education")
    return atlasEducationCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "housingRatios")
    return atlasHousingRatiosCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "property")
    return atlasPropertyCatalog.areas.some(
      (a) => a.geographyId === geographyId,
    );
  if (family === "credit")
    return atlasCreditCatalog.areas.some((a) => a.geographyId === geographyId);
  if (family === "capacity")
    return capacityMapping.geographyIds.includes(geographyId);
  if (family === "valuation")
    return atlasValuationCatalog.geographies.some(
      (g) => g.geographyId === geographyId,
    );
  return (
    (
      mapping.families[family as keyof typeof mapping.families] as
        string[] | undefined
    )?.includes(geographyId) ?? false
  );
}
function status<T extends { status: string }>(
  query: CoverageQuery<T> | undefined,
  family: CoverageFamily,
  geographyId: string,
  years: number[],
): CoverageStatus {
  if (query?.error) return "error";
  if (query?.data?.status === "available")
    return years.length ? "available" : "empty";
  if (query?.data?.status === "empty") return "empty";
  if (
    query?.data?.status === "unsupported_area" ||
    !coverageMapped(family, geographyId)
  )
    return "unsupported_area";
  if (!query?.data) return "checking";
  return query.data.status === "previous_catalog"
    ? years.length
      ? "available"
      : "empty"
    : (query.data.status as CoverageStatus);
}
export function coverageOptions(
  geographyId: string,
  input: CoverageInputs,
): CoverageOption[] {
  const result: CoverageOption[] = [];
  for (const metric of atlasPublicCatalog.metrics) {
    const source = atlasPublicCatalog.sources.find(
      (s) => s.id === metric.sourceId,
    )!;
    const query = input.publicSources?.[source.id];
    if (source.id === "bis-commercial-property") {
      const area = source.areas.find((a) => a.geographyId === geographyId);
      if (
        area
          ? !area.seriesTitles[metric.providerCode]
          : metric.id !==
            atlasPublicCatalog.metrics.find((m) => m.sourceId === source.id)?.id
      )
        continue;
    }
    const profile = query?.data ? publicProfile(query.data, metric) : null;
    const years = [
      ...new Set(
        profile?.points
          .filter((p) => publicValue(p.value) !== null)
          .map((p) =>
            Number(
              metric.kind === "period_snapshot"
                ? p.period.slice(5)
                : p.period.slice(0, 4),
            ),
          ) ?? [],
      ),
    ];
    const mapped = Boolean(
      source.areas.find((a) => a.geographyId === geographyId)?.seriesTitles[
        metric.providerCode
      ],
    );
    result.push({
      id: metric.id,
      topicId: metric.topicId,
      family: `public:${source.id}`,
      label:
        source.id === "bis-commercial-property" &&
        !source.areas.some((a) => a.geographyId === geographyId)
          ? "Gewerbeimmobilien · Quellengebiete"
          : metric.label,
      years,
      periodNote:
        metric.kind === "projection_snapshot"
          ? `Projektionsmodell · Ausgabe ${source.publishedAt}`
          : metric.kind === "period_snapshot"
            ? `Zeitraumwert ${source.firstPeriod}–${source.lastPeriod}`
            : undefined,
      status: mapped
        ? status(query, `public:${source.id}`, geographyId, years)
        : "unsupported_area",
      note: metric.scopeNote,
      target: {
        view: "",
        topic: metric.topicId,
        perspective: "public",
        publicSource: source.id,
        publicMetric: metric.id,
        publicSince: "0",
      },
    });
  }
  for (const metric of atlasCommodityCatalog.metrics) {
    const years =
      geographyId === "world" && input.commodities?.data
        ? (commoditySeries(
            input.commodities.data,
            metric,
            "real",
            1960,
          )?.points.map((p) => p.year) ?? [])
        : [];
    for (const [topicId, scope] of Object.entries(commodityTopics)) {
      if (
        topicId !== "materials:commodity_prices" &&
        !(scope.ids.length
          ? scope.ids.includes(metric.id)
          : scope.group === metric.group)
      )
        continue;
      result.push({
        id: `commodities:${metric.id}${topicId === "materials:commodity_prices" ? "" : `:${topicId}`}`,
        topicId,
        family: "commodities",
        label: metric.label,
        years,
        status:
          geographyId === "world"
            ? status(input.commodities, "commodities", geographyId, years)
            : "elsewhere",
        note: "Internationaler Referenzpreis, kein eigenes Länderprofil. MUV-preisbereinigte Jahresmittel relativ zum eigenen Preis von 2010.",
        target: {
          view: "",
          area: "world",
          region: "world",
          compare: "",
          topic: topicId,
          perspective: "commodities",
          commodityGroup: metric.group,
          commodityMetric: metric.id,
          commodityCompare: "",
          commodityBasis: "real",
          commoditySince: "1960",
          commoditySearch: "",
          commodityPage: "1",
        },
      });
    }
  }
  for (const item of atlasAgricultureCatalog.items) {
    const topicId =
      item.code === "2054"
        ? "food_water:food_security"
        : ["02", "211"].includes(item.group) ||
            ["2044", "1770", "1780"].includes(item.code)
          ? "food_water:livestock"
          : "food_water:crop_production";
    for (const mode of ["total", "perCapita"] as const) {
      const years = (input.agriculture?.data?.profile?.series[item.code] ?? [])
        .filter((p) => p[mode] != null && Number.isFinite(p[mode]))
        .map((p) => p.year);
      result.push({
        id: `agriculture:${item.code}:${mode}`,
        topicId,
        family: "agriculture",
        label: `${item.title} · ${mode === "total" ? "Produktion" : "Produktion je Einwohner"}`,
        years,
        status: status(input.agriculture, "agriculture", geographyId, years),
        note: "FAO-Schätzwerte relativ zur eigenen Basis. Keine Marktgröße, Preise oder Ernährungssicherheit.",
        target: {
          view: "",
          topic: topicId,
          perspective: "agriculture",
          agriItem: item.code,
          agriGroup: item.group,
          agriMode: mode,
          agriSince: "1961",
          agriPage: "0",
          agriSearch: "",
        },
      });
    }
  }
  for (const sector of ["households", "corporations"] as const) {
    const topicId =
      sector === "households"
        ? "finance:household_debt"
        : "finance:corporate_debt";
    for (const mode of ["level", "change"] as const) {
      const row = input.debt?.data;
      const years = row
        ? [
            ...new Set(
              debtPoints(row, sector, mode)
                .filter((p) => p.value != null)
                .map((p) => Number(p.period.slice(0, 4))),
            ),
          ]
        : [];
      result.push({
        id: `debt:${sector}:${mode}`,
        topicId,
        family: "debt",
        label: `${debtTitle(sector as DebtSector)} · ${mode === "level" ? "Quote zur Wirtschaftsleistung" : "Steigen & Fallen"}`,
        years,
        status: status(input.debt, "debt", geographyId, years),
        note: "BIS-Reihen mit historischen Anpassungen; kein fairer Marktwert.",
        target: {
          view: "",
          topic: topicId,
          perspective: "",
          debtMode: mode,
          debtSince: "0",
        },
      });
    }
  }
  for (const metric of atlasHouseholdsCatalog.metrics) {
    const row = input.households?.data;
    const years = validHouseholdResponse(row)
      ? [
          ...new Set(
            row.profile.observations
              .filter((p) => householdValue(p, metric) !== null)
              .map((p) => p.year),
          ),
        ].sort((a, b) => a - b)
      : [];
    result.push({
      id: `households:${metric.id}`,
      topicId: atlasHouseholdsCatalog.topicId,
      family: "households",
      label: metric.label,
      years,
      status: status(input.households, "households", geographyId, years),
      note: metric.explanation,
      target: {
        view: "",
        topic: atlasHouseholdsCatalog.topicId,
        hhGroup: metric.group,
        hhMetric: metric.id,
        hhSince: "1959",
        hhRecord: "",
        hhCompareRecord: "",
      },
    });
  }
  for (const metric of atlasFindexCatalog.metrics) {
    const data = input.findex?.data;
    const years = (
      data && validFindexResponse(data) && data.geography.id === geographyId
        ? data.profile!.points
        : []
    )
      .filter((p) => p.population === "all" && findexValue(p, metric) !== null)
      .map((p) => p.year);
    const topicId =
      metric.group === "payments"
        ? "digital:digital_payments"
        : metric.group === "transfers"
          ? "finance:payments"
          : "finance:financial_access";
    result.push({
      id: `findex:${metric.id}`,
      topicId,
      family: "findex",
      label: metric.label,
      years,
      status: status(input.findex, "findex", geographyId, years),
      note: "Befragung: alle Erwachsenen ab 15 Jahren. " + metric.note,
      target: {
        view: "",
        topic: topicId,
        perspective: "findex",
        findexGroup: metric.group,
        findexMetric: metric.id,
        findexPopulation: "all",
        findexSince: "2011",
      },
    });
  }
  for (const metric of atlasLaborCatalog.metrics) {
    const years = (
      input.labor?.data &&
      validLaborResponse(input.labor.data) &&
      input.labor.data.geography.id === geographyId
        ? input.labor.data.profile!.points
        : []
    )
      .filter(
        (p) =>
          p.year <= atlasLaborCatalog.lastYear &&
          laborValue(p, metric) !== null,
      )
      .map((p) => p.year);
    const topicId =
      Object.entries(laborTopics).find(
        ([, v]) => v.metric === metric.id,
      )?.[0] ?? "labor:sector_structure";
    result.push({
      id: `labor:${metric.id}`,
      topicId,
      family: "labor",
      label: metric.label,
      years,
      status: status(input.labor, "labor", geographyId, years),
      note:
        "ILO-Modellschätzungen: Beschäftigungsanteile 1991–2024; keine faire Bewertung. " +
        metric.note +
        "",
      target: {
        view: "",
        topic: topicId,
        perspective: "labor",
        laborGroup: metric.group,
        laborMetric: metric.id,
        laborSince: "1991",
      },
    });
  }
  for (const metric of atlasInnovationCatalog.metrics) {
    const years = (
      input.innovation?.data &&
      validInnovationResponse(input.innovation.data) &&
      input.innovation.data.geography.id === geographyId
        ? input.innovation.data.profile!.points
        : []
    )
      .filter(
        (p) =>
          p.year <= atlasInnovationCatalog.defaultThrough &&
          innovationValue(p, metric) !== null,
      )
      .map((p) => p.year);
    const topicId =
      Object.entries(innovationTopics).find(
        ([, v]) => v.metric === metric.id,
      )?.[0] ?? "innovation:patents";
    result.push({
      id: `innovation:${metric.id}`,
      topicId,
      family: "innovation",
      label: metric.label,
      years,
      status: status(input.innovation, "innovation", geographyId, years),
      note: "WIPO-Patentveröffentlichungen nach Herkunft. Startansicht bis 2023; Randjahr 2024 optional. Keine Börsenbewertung oder Zahl einzigartiger Erfindungen.",
      target: {
        view: "",
        topic: topicId,
        perspective: "innovation",
        innovationGroup: metric.group,
        innovationMetric: metric.id,
        innovationSince: "1980",
        innovationThrough: "2023",
      },
    });
  }
  for (const metric of atlasHealthCatalog.metrics) {
    const years = (
      input.health?.data && validHealthResponse(input.health.data)
        ? input.health.data.profile!.points
        : []
    )
      .filter((p) => healthValue(p, metric) !== null)
      .map((p) => p.year);
    const topicId =
      metric.field === "hp1_usd_pc"
        ? "health:hospitals"
        : metric.field === "hk112_usd_pc"
          ? "health:medical_equipment"
          : metric.field === "hcri1_usd_pc"
            ? "health:pharmaceuticals"
            : metric.field === "hc3_usd_pc"
              ? "health:elderly_care"
              : metric.group === "schemes"
                ? "health:health_insurance"
                : metric.field === "hc62_che" || metric.field === "hc6_usd_pc"
                  ? "health:prevention"
                  : metric.group === "primary"
                    ? "health:healthcare_access"
                    : "health:healthcare_spending";
    result.push({
      id: `health:${metric.id}`,
      topicId,
      family: "health",
      label: metric.label,
      years,
      status: status(input.health, "health", geographyId, years),
      note: `${healthUnits[metric.unit]}. ${metric.scopeNote} WHO-Statistik mit Schätzungen; 2024 vorläufig.`,
      target: {
        view: "",
        topic: topicId,
        perspective: "health",
        healthGroup: metric.group,
        healthMetric: metric.id,
        healthSince: "2000",
      },
    });
  }
  for (const metric of atlasFiscalCatalog.metrics) {
    const years = (input.fiscal?.data?.profile?.points ?? [])
      .filter(
        (p) =>
          p.values[metric.field] != null &&
          Number.isFinite(p.values[metric.field]),
      )
      .map((p) => p.year);
    result.push({
      id: `fiscal:${metric.id}`,
      topicId:
        metric.id === "grossDebt" ? "finance:public_debt" : atlasFiscalTopic,
      family: "fiscal",
      label: metric.label,
      years,
      status: status(input.fiscal, "fiscal", geographyId, years),
      note: metric.explanation,
      target: {
        view: "",
        topic: atlasFiscalTopic,
        fiscalGroup: metric.group,
        fiscalMetric: metric.id,
        fiscalSince: "1800",
      },
    });
  }
  for (const metric of atlasMacrohistoryCatalog.metrics) {
    const years = (input.macrohistory?.data?.profile?.points ?? [])
      .filter(
        (p) =>
          p.values[metric.id]?.value != null &&
          Number.isFinite(p.values[metric.id].value),
      )
      .map((p) => p.year);
    result.push({
      id: `macrohistory:${metric.id}`,
      topicId: atlasMacrohistoryTopic,
      family: "macrohistory",
      label: metric.label,
      years,
      status: status(input.macrohistory, "macrohistory", geographyId, years),
      note: metric.explanation,
      target: {
        view: "",
        topic: atlasMacrohistoryTopic,
        jstGroup: metric.group,
        jstMetric: metric.id,
        jstSince: "1870",
        jstReal: "1",
        jstCrises: "0",
      },
    });
  }
  for (const metric of atlasEducationCatalog.metrics) {
    const years = educationPoints(input.education?.data, metric.code)
      .filter((p) => p.value !== null && Number.isFinite(p.value))
      .map((p) => p.year);
    result.push({
      id: `education:${metric.code}`,
      topicId: metric.topicId,
      family: "education",
      label: metric.label,
      years,
      status: status(input.education, "education", geographyId, years),
      note: metric.explanation,
      target: {
        view: "",
        topic: metric.topicId,
        perspective: "education",
        educationMetric: metric.code,
        educationSince: "0",
      },
    });
  }
  const country = input.valuation?.data?.data?.subjects.find(
    (s) => s.id === geographyId,
  );
  for (const metric of atlasValuationCatalog.metrics.filter((m) =>
    m.id.startsWith("country_"),
  )) {
    const series = country?.series.find((s) => s.metricId === metric.id);
    const years =
      series?.points
        .filter((p) => p.status === "available")
        .map((p) => p.year) ?? [];
    const rowStatus = coverageMapped("valuation", geographyId)
      ? status(input.valuation, "valuation", geographyId, years)
      : "unsupported_area";
    result.push({
      id: `valuation:${metric.id}`,
      topicId:
        metric.kind === "forecast_valuation"
          ? "market_context:earnings_quality"
          : "market_context:historical_valuation",
      family: "valuation",
      label: metric.label,
      years,
      status: rowStatus,
      note: "Unternehmensstichprobe des Landes; Mittelwerte und Mediane bleiben getrennt. Vorhandene Jahreswerte garantieren keine lange historische Einordnung.",
      target: {
        view: "valuation",
        valMode: "countries",
        valTopic: "",
        valMetric: metric.id,
        valSubject: "",
        valCompare: "",
        valCompareScope: "",
      },
    });
  }
  const scope = valuationCountryScopes[geographyId];
  for (const [topicId, names] of Object.entries(valuationTopicIndustries)) {
    for (const name of names) {
      const industry = atlasValuationCatalog.industries.find(
        (i) => i.providerLabel === name,
      )!;
      const subject = input.valuationIndustries?.data?.data?.subjects.find(
        (s) => s.id === industry.id,
      );
      const series = subject?.series.find((s) => s.metricId === "industry_pbv");
      const years =
        series?.points
          .filter((p) => p.status === "available")
          .map((p) => p.year) ?? [];
      result.push({
        id: `valuation:${topicId}:${industry.id}`,
        topicId,
        family: "valuation",
        label: `${industry.label} · Buchwertbewertung`,
        years,
        status: scope
          ? status(input.valuationIndustries, "valuation", geographyId, years)
          : "elsewhere",
        note: `${valuationTopicSelection(topicId)?.scopeNote ?? ""} ${
          scope
            ? "Börsennotierte Unternehmen dieser Quellenregion; keine vollständige Realwirtschaft. Einzelne Quellenregionen haben nur einen Jahresstand."
            : "Für dieses Gebiet nicht separat angebunden. Der Link öffnet ausdrücklich die globale Branchenstichprobe."
        }`,
        target: {
          view: "valuation",
          valMode: "industries",
          valTopic: topicId,
          valPage: "",
          valSearch: "",
          valScope: scope ?? "global",
          valBasis: "pbv",
          valMetric: "industry_pbv",
          valSubject: industry.id,
          valCompare: "",
          valCompareScope: "",
        },
      });
    }
  }
  for (const definition of atlasCatalog.series) {
    const family = definition.sourceId === "unsdg" ? "sdg" : "statistics";
    const query = input.series[definition.id];
    const years =
      query?.data?.points
        .filter((p) => p.value !== null && Number.isFinite(p.value))
        .map((p) => p.year) ?? [];
    result.push({
      id: definition.id,
      topicId: definition.topicId,
      family,
      label: definition.label,
      years,
      status: status(query, family, geographyId, years),
      target: {
        view: "",
        topic: definition.topicId,
        series: definition.id,
        perspective: "worldbank",
      },
    });
  }
  for (const topic of atlasCatalog.topics) {
    const demoMode = atlasDemographyMode(topic.id);
    if (demoMode) {
      const data = input.demography.data;
      const years =
        data?.profile?.years
          .filter((year) => {
            const totals = demographicSummary(year);
            if (demoMode === "pyramid")
              return demographicPyramid(year) !== null;
            return totals && (demoMode !== "dependency" || totals.working > 0);
          })
          .map((year) => year.year) ?? [];
      result.push({
        id: `demography:${topic.id}`,
        topicId: topic.id,
        family: "demography",
        label: topic.label,
        years,
        status: status(input.demography, "demography", geographyId, years),
        note: data?.provenance
          ? `Schätzungen bis ${data.provenance.estimateEnd}; mittlere Projektion ab ${data.provenance.projectionStart}.`
          : "UN-Schätzungen und die mittlere Projektion bleiben getrennt.",
        target: { view: "", topic: topic.id, perspective: "" },
      });
    }
    const historyMode = atlasHistoryMode(topic.id);
    if (historyMode) {
      const view = input.history.data
        ? historyView([input.history.data], historyMode, 1)
        : null;
      const years =
        view?.years.filter((_, index) => view.rows[0].values[index] !== null) ??
        [];
      result.push({
        id: `history:${topic.id}`,
        topicId: topic.id,
        family: "history",
        label: topic.label,
        years,
        status: status(input.history, "history", geographyId, years),
        note: "Historische Rekonstruktion; Lücken sind keine geschlossenen Jahresreihen.",
        target: { view: "", topic: topic.id, perspective: "" },
      });
    }
    const energyMode = atlasEnergyMode(topic.id);
    if (housingRatiosTopic(topic.id)) {
      const basis = topic.id === "housing:price_rent" ? "rent" : "income";
      for (const mode of ["relative", "index"] as const) {
        const metric = housingRatioMetric(basis, mode);
        const years =
          input.housingRatios?.data?.profile?.points
            .filter(
              (p) =>
                p[metric] != null &&
                Number.isFinite(p[metric]) &&
                p[metric]! > 0,
            )
            .map((p) => Number(p.period.slice(0, 4))) ?? [];
        result.push({
          id: `housingRatios:${topic.id}:${metric}`,
          topicId: topic.id,
          family: "housingRatios",
          label: `Kaufpreise zu ${basis === "income" ? "Einkommen" : "Mieten"} · ${mode === "relative" ? "Hoch & Tief zum OECD-Durchschnitt" : "Verhältnis mit Bezugsjahr 2015"}`,
          years,
          status: status(
            input.housingRatios,
            "housingRatios",
            geographyId,
            years,
          ),
          note: "Historischer OECD-Vergleich; kein fairer Preis oder individuelles Haushaltsbudget.",
          target: {
            view: "",
            topic: topic.id,
            perspective: "housingRatios",
            ratioBasis: basis,
            ratioMode: mode,
            ratioSince: "0",
          },
        });
      }
    }
    if (propertyTopic(topic.id)) {
      for (const basis of ["real", "nominal"] as const)
        for (const mode of ["index", "change"] as const) {
          const metric = propertyMetric(basis, mode);
          const years =
            input.property?.data?.profile?.points
              .filter((p) => p[metric] != null && Number.isFinite(p[metric]))
              .map((p) => Number(p.period.slice(0, 4))) ?? [];
          result.push({
            id: `property:${topic.id}:${metric}`,
            topicId: topic.id,
            family: "property",
            label: `Wohnimmobilien · ${basis === "real" ? "Inflation bereinigt" : "Mit Inflation"} · ${mode === "index" ? "Preisentwicklung" : "Steigen & Fallen"}`,
            years,
            status: status(input.property, "property", geographyId, years),
            note: "Preisveränderung; keine Bezahlbarkeit oder faire Bewertung. Historische Quellenwechsel möglich.",
            target: {
              view: "",
              topic: topic.id,
              perspective: "property",
              propertyMode: mode,
              propertyBasis: basis,
              propertySince: "0",
              propertyScale: "linear",
            },
          });
        }
    }
    if (creditTopic(topic.id)) {
      for (const mode of ["gap", "ratio"] as const) {
        const years =
          input.credit?.data?.profile?.points
            .filter((p) => p[mode] != null && Number.isFinite(p[mode]))
            .map((p) => Number(p.period.slice(0, 4))) ?? [];
        result.push({
          id: `credit:${topic.id}:${mode}`,
          topicId: topic.id,
          family: "credit",
          label:
            mode === "gap"
              ? "Private Kreditwelle · BIS-Modelltrend"
              : "Private Schuldenquote & Trend · BIS",
          years,
          status: status(input.credit, "credit", geographyId, years),
          note: "Haushalte und nicht finanzielle Unternehmen; keine Bewertung oder Staatsschulden.",
          target: {
            view: "",
            topic: topic.id,
            perspective: "credit",
            creditMode: mode,
            creditSince: "0",
          },
        });
      }
    }
    for (const technology of capacityTechnologies(topic.id)) {
      for (const grid of ["ongrid", "offgrid"] as const) {
        const key = `${technology.id}.${grid}`;
        const years =
          input.capacity?.data?.profile?.years
            .filter(
              (p) => p.values[key] != null && Number.isFinite(p.values[key]),
            )
            .map((p) => p.year) ?? [];
        result.push({
          id: `capacity:${key}`,
          topicId: topic.id,
          family: "capacity",
          label: `${technology.label} · ${grid === "ongrid" ? "Mit Netzanschluss" : "Ohne Netzanschluss"}`,
          years,
          status: status(input.capacity, "capacity", geographyId, years),
          note: "Installierte elektrische Leistung. Kein Ersatz für Stromerzeugung oder Börsenbewertung.",
          target: {
            view: "",
            topic: topic.id,
            perspective: "capacity",
            capacityTech: technology.id,
            capacityGrid: grid,
            capacitySince: "2000",
          },
        });
      }
    }
    if (energyMode) {
      const view = input.energy.data
        ? energyView([input.energy.data], energyMode, "share", 2000)
        : null;
      const years =
        view?.years.filter((_, index) => view.rows[0].values[index] !== null) ??
        [];
      result.push({
        id: `energy:${topic.id}`,
        topicId: topic.id,
        family: "energy",
        label: topic.label,
        years,
        status: status(input.energy, "energy", geographyId, years),
        note: "Abdeckung der Startansicht. Erzeugung und installierte Leistung sind eigene Größen im Strombild.",
        target: { view: "", topic: topic.id, perspective: "energy" },
      });
    }
  }
  for (const proxy of relativeProxies) {
    const own = proxy.geographyId === geographyId;
    const benchmark = relativeBenchmark(proxy);
    const query = input.markets[proxy.id],
      base = input.markets[benchmark.id];
    const picture =
      query?.data && base?.data
        ? relativePicture([{ market: query.data, benchmark: base.data }], 20)
        : null;
    const states = [query, base];
    const state: CoverageStatus = !own
      ? "elsewhere"
      : states.some((q) => q?.error)
        ? "error"
        : states.some((q) => !q?.data)
          ? "checking"
          : states.some((q) => q?.data?.status === "desktop_required")
            ? "desktop_required"
            : states.some((q) => q?.data?.status === "not_downloaded")
              ? "not_downloaded"
              : picture
                ? "available"
                : "too_short";
    const area = atlasCatalog.geographies.find(
      (g) => g.id === proxy.geographyId,
    )!;
    result.push({
      id: `relative:${proxy.id}`,
      topicId: relativeTopic,
      family: "markets",
      label: `${proxy.label} / ${benchmark.label}`,
      status: state,
      years: [
        ...new Set(
          picture?.rows[0].points
            .filter((p) => p.value !== null)
            .map((p) => Number(p.month.slice(0, 4))) ?? [],
        ),
      ],
      note: "Monatlicher Vergleich bereinigter Fondskurse mit benannter Referenz. Die gemeinsame Basis ist kein fairer Wert.",
      target: {
        view: "",
        topic: relativeTopic,
        perspective: "relative",
        proxy: proxy.id,
        relativeHorizon: "20",
        ...(own ? {} : { area: area.id, region: area.regionId, compare: "" }),
      },
    });
  }
  for (const proxy of atlasMarketProxies) {
    const own = proxy.geographyId === geographyId;
    const query = input.markets[proxy.id];
    const years =
      query?.data?.analysis.points
        .filter((p) => p.wave !== null && Number.isFinite(p.wave))
        .map((p) => Number(p.month.slice(0, 4))) ?? [];
    let state = own
      ? status(query, "markets", geographyId, years)
      : ("elsewhere" as CoverageStatus);
    if (own && state === "empty") state = "too_short";
    const area = atlasCatalog.geographies.find(
      (g) => g.id === proxy.geographyId,
    )!;
    for (const topicId of proxy.topicIds) {
      result.push({
        id: `${proxy.id}:${topicId}`,
        topicId,
        family: "markets",
        label: `${proxy.label} · ${area.label}`,
        status: state,
        years: [...new Set(years)],
        note:
          own && query?.data
            ? atlasMarketReading[query.data.analysis.state]
            : proxy.scope,
        target: {
          view: "",
          topic: topicId,
          perspective: "market",
          proxy: proxy.id,
          ...(own ? {} : { area: area.id, region: area.regionId, compare: "" }),
        },
      });
    }
  }
  return result;
}
export function coverageTopicStatus(options: CoverageOption[]): CoverageStatus {
  // A real local image wins over an unavailable second perspective, but a
  // global proxy must never mark the selected country's topic as available.
  return (
    (
      [
        "available",
        "error",
        "checking",
        "not_downloaded",
        "desktop_required",
        "too_short",
        "empty",
        "elsewhere",
        "unsupported_area",
      ] as CoverageStatus[]
    ).find((state) => options.some((option) => option.status === state)) ??
    "unbound"
  );
}
export function coverageTone(status: CoverageStatus) {
  if (status === "available") return "ready";
  if (["not_downloaded", "desktop_required", "checking"].includes(status))
    return "pending";
  return status === "unbound" ? "unbound" : "limited";
}
export function coverageAlternatives(
  family: CoverageFamily,
  geographyId: string,
) {
  const area = atlasCatalog.geographies.find((g) => g.id === geographyId)!;
  return atlasCatalog.geographies.filter(
    (g) =>
      g.id !== geographyId &&
      g.kind === "aggregate" &&
      coverageMapped(family, g.id) &&
      (g.regionId === area.regionId || g.id === "world"),
  );
}
export function coverageFamilyTarget(
  family: CoverageFamily,
  geographyId: string,
): Record<string, string> {
  const area = atlasCatalog.geographies.find((g) => g.id === geographyId)!;
  const target: Record<string, string> = {
    view: "",
    area: area.id,
    region: area.regionId,
    perspective: "",
  };
  if (family.startsWith("public:")) {
    const metric = atlasPublicCatalog.metrics.find(
      (m) => `public:${m.sourceId}` === family,
    );
    return metric
      ? {
          ...target,
          topic: metric.topicId,
          perspective: "public",
          publicSource: metric.sourceId,
          publicMetric: metric.id,
          publicSince: "0",
        }
      : target;
  }
  if (family === "sdg")
    return {
      ...target,
      topic: "materials:recycling",
      series: "unsdg:EN_EWT_RCYR",
      perspective: "worldbank",
    };
  if (family === "commodities")
    return {
      ...target,
      area: "world",
      region: "world",
      compare: "",
      topic: "materials:commodity_prices",
      perspective: "commodities",
      commodityGroup: "indices",
      commodityMetric: "",
      commodityCompare: "",
      commodityBasis: "real",
      commoditySince: "1960",
      commodityPage: "1",
      commoditySearch: "",
    };
  if (family === "findex")
    return {
      view: "",
      topic: "finance:financial_access",
      perspective: "findex",
      findexGroup: "accounts",
      findexMetric: "overview",
      findexPopulation: "all",
      findexSince: "2011",
    };
  if (family === "labor")
    return {
      ...target,
      topic: "labor:sector_structure",
      perspective: "labor",
      laborGroup: "production",
      laborMetric: "overview",
      laborSince: "1991",
    };
  if (family === "innovation")
    return {
      ...target,
      topic: "innovation:patents",
      perspective: "innovation",
      innovationGroup: "digital",
      innovationMetric: "overview",
      innovationSince: "1980",
      innovationThrough: "2023",
    };
  if (family === "health")
    return {
      ...target,
      topic: "health:healthcare_spending",
      perspective: "health",
      healthGroup: "volume",
      healthMetric: "overview",
      healthSince: "2000",
    };
  if (family === "debt")
    return {
      ...target,
      topic: "finance:household_debt",
      debtMode: "level",
      debtSince: "0",
    };
  if (family === "households")
    return {
      ...target,
      topic: atlasHouseholdsCatalog.topicId,
      hhGroup: "size",
      hhMetric: "averageSize",
      hhSince: "1959",
      hhRecord: "",
      hhCompareRecord: "",
    };
  if (family === "fiscal")
    return {
      ...target,
      topic: atlasFiscalTopic,
      fiscalGroup: "budget",
      fiscalMetric: "",
      fiscalSince: "1800",
    };
  if (family === "macrohistory")
    return {
      ...target,
      topic: atlasMacrohistoryTopic,
      jstGroup: "credit",
      jstMetric: "",
      jstSince: "1870",
      jstReal: "1",
      jstCrises: "0",
    };
  if (family === "agriculture")
    return {
      ...target,
      topic: "food_water:crop_production",
      perspective: "agriculture",
      agriItem: "all",
      agriGroup: "overview",
      agriMode: "total",
      agriSince: "1961",
      agriSearch: "",
      agriPage: "0",
    };
  if (family === "education")
    return {
      ...target,
      topic: "education:primary_school",
      perspective: "education",
      educationMetric: "CR.1",
      educationSince: "0",
    };
  if (family === "housingRatios")
    return {
      ...target,
      topic: "housing:affordability",
      perspective: "housingRatios",
      ratioBasis: "income",
      ratioMode: "relative",
      ratioSince: "0",
    };
  if (family === "property")
    return {
      ...target,
      view: "",
      topic: "long_history:long_run_housing",
      perspective: "property",
      propertyMode: "index",
      propertyBasis: "real",
      propertySince: "0",
      propertyScale: "linear",
    };
  if (family === "credit")
    return {
      ...target,
      topic: "long_history:long_run_credit",
      perspective: "credit",
      creditMode: "gap",
      creditSince: "0",
    };
  if (family === "statistics")
    return { ...target, view: "statistics", statDomain: "all", statGroup: "" };
  if (family === "capacity")
    return {
      ...target,
      topic: "electricity:solar",
      perspective: "capacity",
      capacityTech: "solar",
      capacityGrid: "ongrid",
      capacitySince: "2000",
    };
  if (family === "valuation")
    return {
      ...target,
      view: "valuation",
      valMode: "countries",
      valMetric: "country_median_pbv",
      valSubject: "",
      valCompare: "",
      valCompareScope: "",
    };
  if (family === "demography")
    return { ...target, topic: "demography:age_structure" };
  if (family === "energy")
    return {
      ...target,
      topic: "electricity:generation_mix",
      perspective: "energy",
    };
  if (family === "history")
    return { ...target, topic: "long_history:long_run_prosperity" };
  const proxy = atlasMarketProxies.find((p) => p.geographyId === geographyId)!;
  return {
    ...target,
    topic: proxy.topicIds[0],
    proxy: proxy.id,
    perspective: "market",
  };
}
import {
  atlasEducationCatalog,
  educationPoints,
  type AtlasEducationResponse,
} from "./atlas-education";
