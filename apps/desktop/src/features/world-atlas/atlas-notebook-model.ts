import type { QueryClient } from "@tanstack/react-query";
import { atlasValuationCatalog } from "./atlas-valuation";
import { atlasMarketProxies } from "./atlas-markets";
import { relativeRecipe, relativeTopic } from "./atlas-relative";
import { marketOverviewGroup } from "./atlas-market-overview-model";
import { cycleHypothesis, cycleSources } from "./atlas-cycle-hypotheses";
import type {
  AtlasSavedContext,
  AtlasSourceReference,
} from "./atlas-notebook-types";

export const atlasSavedParamKeys = [
  "publicSource",
  "publicMetric",
  "publicCompareMetric",
  "publicSince",
  "hhGroup",
  "hhMetric",
  "hhSince",
  "hhRecord",
  "hhCompareRecord",
  "commodityGroup",
  "commodityMetric",
  "commodityCompare",
  "commodityBasis",
  "commoditySince",
  "commoditySearch",
  "commodityPage",
  "findexGroup",
  "findexMetric",
  "findexPopulation",
  "findexSince",
  "laborGroup",
  "laborMetric",
  "laborSince",
  "innovationGroup",
  "innovationMetric",
  "innovationSince",
  "innovationThrough",
  "healthGroup",
  "healthMetric",
  "healthSince",
  "fiscalGroup",
  "fiscalMetric",
  "fiscalSince",
  "jstGroup",
  "jstMetric",
  "jstSince",
  "jstReal",
  "jstCrises",
  "view",
  "region",
  "area",
  "compare",
  "topic",
  "series",
  "perspective",
  "proxy",
  "statDomain",
  "statGroup",
  "statHorizon",
  "coverageDomain",
  "coverageStatus",
  "coverageSearch",
  "valMode",
  "valBasis",
  "valScope",
  "valMetric",
  "valGroup",
  "valSubject",
  "valCompare",
  "valCompareScope",
  "valPage",
  "valSearch",
  "valTopic",
  "hypothesis",
  "cycleStep",
  "fromCycle",
  "fromGuide",
  "map",
  "mapRegion",
  "mapSearch",
  "topicSearch",
  "numbers",
  "demoProjection",
  "demoYear",
  "historySince",
  "historyProportional",
  "energyMeasure",
  "energySince",
  "ratioBasis",
  "agriMode",
  "agriSince",
  "agriGroup",
  "agriItem",
  "agriSearch",
  "agriPage",
  "educationMetric",
  "educationSince",
  "ratioMode",
  "ratioSince",
  "propertyMode",
  "propertyBasis",
  "propertySince",
  "propertyScale",
  "creditMode",
  "creditSince",
  "debtMode",
  "debtSince",
  "capacityTech",
  "capacityGrid",
  "capacitySince",
  "marketHorizon",
  "relativeHorizon",
  "relativeBenchmark",
  "marketsHorizon",
  "marketsGroup",
] as const;

export function atlasSavedContext(params: URLSearchParams): AtlasSavedContext {
  return {
    version: 1,
    params: Object.fromEntries(
      atlasSavedParamKeys.flatMap((key) => {
        const value = params.get(key);
        if (value && ([...value].length > 256 || value.includes("\0")))
          throw new Error(
            "Bitte den Suchtext auf höchstens 256 Zeichen kürzen, bevor du die Ansicht merkst.",
          );
        return value !== null && value !== "" ? [[key, value]] : [];
      }),
    ),
  };
}

export function atlasContextParams(context: AtlasSavedContext) {
  if (
    context.version !== 1 ||
    !context.params ||
    typeof context.params !== "object"
  )
    return null;
  const result = new URLSearchParams();
  for (const key of atlasSavedParamKeys) {
    const value = context.params[key];
    if (typeof value === "string" && [...value].length <= 256 && value)
      result.set(key, value);
  }
  return result;
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown) =>
  typeof value === "string" ? [...value].slice(0, 400).join("") : null;
const families: Record<
  string,
  { family: AtlasSourceReference["family"]; label: string }
> = {
  public: { family: "public", label: "Öffentliche Quellenreihe" },
  series: { family: "worldbank", label: "World Development Indicators" },
  agriculture: { family: "fao", label: "FAO · Produktionsbilder" },
  education: { family: "uis", label: "UNESCO UIS · Bildung" },
  demography: { family: "un", label: "UN World Population Prospects" },
  households: { family: "un", label: "UN DESA · Haushalte 2026" },
  debt: {
    family: "bis",
    label: "BIS · Schulden von Haushalten und Unternehmen",
  },
  history: { family: "maddison", label: "Maddison Project Database / OWID" },
  commodities: { family: "worldbank", label: "World Bank · Rohstoffpreise" },
  findex: { family: "worldbank", label: "World Bank · Global Findex" },
  labor: { family: "ilo", label: "ILOSTAT · Beschäftigungsbilder" },
  innovation: { family: "wipo", label: "WIPO · Technologiebilder" },
  health: { family: "who", label: "WHO · Gesundheitsausgaben GHED" },
  fiscal: { family: "imf", label: "IMF · Staatsfinanzen / OWID-Archiv" },
  macrohistory: {
    family: "jst",
    label: "Jordà–Schularick–Taylor · Finanzgeschichte",
  },
  energy: { family: "ember", label: "Ember · Stromwirtschaft" },
  housingRatios: {
    family: "oecd",
    label: "OECD · Kaufpreise zu Einkommen und Mieten",
  },
  property: { family: "bis", label: "BIS · Immobilienbilder" },
  credit: { family: "bis", label: "BIS · Kreditbilder" },
  capacity: { family: "irena", label: "IRENA · Anlagenleistung" },
  market: { family: "eodhd", label: "EODHD · Atlas-Marktwelle" },
  valuation: { family: "damodaran", label: "NYU / Aswath Damodaran" },
};

/** Public Atlas metadata only. Do not serialize the shared QueryClient wholesale. */
export function atlasNotebookSources(
  client: QueryClient,
  context: AtlasSavedContext,
): AtlasSourceReference[] {
  const model = cycleHypothesis(context.params.topic);
  if (
    !context.params.view &&
    model &&
    context.params.hypothesis === model.topicId
  )
    return model.sourceIds.map((id) => ({
      family: "hypothesis",
      label: cycleSources[id].author,
      scope: cycleSources[id].scope,
      datasetId: model.topicId,
      status: "explanatory_model",
      release: null,
      retrievedAt: null,
      recipe: "atlas-cycle-model-v1",
      hashes: [],
    }));
  return client
    .getQueryCache()
    .getAll()
    .filter(
      (query) =>
        query.isActive() &&
        query.queryKey[0] === "atlas" &&
        typeof query.queryKey[1] === "string" &&
        families[query.queryKey[1]] &&
        query.state.data &&
        (context.params.view !== "markets" ||
          query.queryKey[1] !== "market" ||
          !context.params.marketsGroup ||
          context.params.marketsGroup === "all" ||
          atlasMarketProxies.some(
            (proxy) =>
              proxy.id === query.queryKey[2] &&
              marketOverviewGroup(proxy) === context.params.marketsGroup,
          )),
    )
    .slice(0, 160)
    .map((query) => {
      const row = obj(query.state.data);
      const family =
        query.queryKey[1] === "public"
          ? {
              family: "public" as const,
              label: str(obj(row.source).label) ?? "Öffentliche Quellenreihe",
            }
          : query.queryKey[1] === "series" &&
              obj(row.series).sourceId === "unsdg"
            ? { family: "un" as const, label: "UN · Global SDG Database" }
            : query.queryKey[1] === "market" &&
                context.params.topic === relativeTopic
              ? {
                  family: "eodhd" as const,
                  label: "EODHD · relative Monatskurse",
                }
              : families[String(query.queryKey[1])];
      const data = query.queryKey[1] === "valuation" ? obj(row.data) : row;
      const source = obj(data.provenance);
      const files = Array.isArray(source.files)
        ? source.files
        : Array.isArray(source.pages)
          ? source.pages
          : [source.source, source];
      const hashes = [
        ...new Set(
          files.flatMap((f) => {
            const hash = obj(f).sha256;
            return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash)
              ? [
                  hash,
                  ...(typeof obj(f).glossarySha256 === "string" &&
                  /^[a-f0-9]{64}$/i.test(String(obj(f).glossarySha256))
                    ? [String(obj(f).glossarySha256)]
                    : []),
                  ...(typeof obj(f).notesSha256 === "string" &&
                  /^[a-f0-9]{64}$/i.test(String(obj(f).notesSha256))
                    ? [String(obj(f).notesSha256)]
                    : []),
                ]
              : [];
          }),
        ),
      ].slice(0, 120);
      const geography = obj(row.geography);
      const proxy = obj(row.proxy);
      const valuation = atlasValuationCatalog.datasets.find(
        (dataset) => dataset.id === row.datasetId,
      );
      const publicationYears = files
        .map((file) => obj(file).publicationYear)
        .filter((year): year is number => typeof year === "number");
      return {
        ...family,
        scope:
          (query.queryKey[1] === "commodities"
            ? "Internationale Referenzpreise"
            : null) ??
          str(geography.label) ??
          str(data.scopeLabel) ??
          valuation?.scopeLabel ??
          str(proxy.label) ??
          "Öffentlicher Quellenstand",
        datasetId:
          str(obj(row.source).id) ??
          str(obj(row.series).id) ??
          str(row.datasetId) ??
          str(proxy.id) ??
          String(query.queryKey[1]),
        status: str(row.status) ?? "unknown",
        release:
          str(source.publishedAt) ??
          str(source.revision) ??
          str(source.sourceUpdatedAt) ??
          str(source.providerUpdatedAt) ??
          str(source.release) ??
          (publicationYears.length
            ? `${Math.min(...publicationYears)}–${Math.max(...publicationYears)}`
            : null),
        retrievedAt: str(source.retrievedAt),
        recipe:
          (query.queryKey[1] === "market" &&
          context.params.topic === relativeTopic
            ? relativeRecipe
            : null) ??
          str(obj(row.analysis).recipe) ??
          str(obj(row.analysis).recipeVersion) ??
          str(obj(row.analysis).methodVersion) ??
          str(source.recipe) ??
          str(source.catalogVersion),
        hashes,
      };
    });
}
