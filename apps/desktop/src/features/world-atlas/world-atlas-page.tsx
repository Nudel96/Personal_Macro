import { AtlasFindexPanel } from "./atlas-findex-panel";
import { AtlasPublicPanel } from "./atlas-public-panel";
import {
  publicComparisonSelection,
  publicMetrics,
  publicSelection,
} from "./atlas-public";
import { AtlasLibraryPanel, atlasLibraryJobId } from "./atlas-library-panel";
import {
  atlasSeriesSource,
  atlasSeriesComparable,
} from "./atlas-source-series";
import { AtlasSeriesSourceNotes } from "./atlas-series-source-notes";
import {
  atlasFindexDataset,
  findexTopics,
  findexSelection,
} from "./atlas-findex";
import { AtlasCommoditiesPanel } from "./atlas-commodities-panel";
import {
  atlasCommodityDataset,
  commoditySelection,
  commodityTopics,
} from "./atlas-commodities";
import { AtlasLaborPanel } from "./atlas-labor-panel";
import { atlasLaborDataset, laborTopics, laborSelection } from "./atlas-labor";
import { AtlasInnovationPanel } from "./atlas-innovation-panel";
import {
  atlasInnovationDataset,
  innovationTopics,
  innovationSelection,
} from "./atlas-innovation";
import { AtlasHealthPanel } from "./atlas-health-panel";
import {
  atlasHealthDataset,
  healthTopics,
  healthSelection,
} from "./atlas-health";
import { AtlasHouseholdsPanel } from "./atlas-households-panel";
import { AtlasDebtPanel } from "./atlas-debt-panel";
import { atlasDebtCatalog, atlasDebtDataset, debtTopic } from "./atlas-debt";
import {
  atlasHouseholdsCatalog,
  atlasHouseholdsDataset,
  householdSelection,
} from "./atlas-households";
import { AtlasFiscalPanel } from "./atlas-fiscal-panel";
import { atlasFiscalCatalog, atlasFiscalDataset } from "./atlas-fiscal";
import { AtlasAgriculturePanel } from "./atlas-agriculture-panel";
import { AtlasMacrohistoryPanel } from "./atlas-macrohistory-panel";
import {
  atlasMacrohistoryCatalog,
  atlasMacrohistoryDataset,
  atlasMacrohistoryTopic,
} from "./atlas-macrohistory";
import {
  agricultureTopic,
  atlasAgricultureDataset,
  atlasAgricultureCatalog,
} from "./atlas-agriculture";
import { AtlasHousingRatiosPanel } from "./atlas-housing-ratios-panel";
import {
  atlasHousingRatiosDataset,
  atlasHousingRatiosCatalog,
  housingRatiosTopic,
  housingRatioDefaultBasis,
} from "./atlas-housing-ratios";
import { AtlasPropertyPanel } from "./atlas-property-panel";
import { atlasPropertyDataset, propertyTopic } from "./atlas-property";
import { AtlasCreditPanel } from "./atlas-credit-panel";
import { atlasCreditDataset, creditTopic } from "./atlas-credit";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { AtlasDisplayContext } from "./atlas-display-state";
import { AtlasNotebookPanel } from "./atlas-notebook-panel";
import { useAtlasLastView } from "./use-atlas-last-view";
import { AtlasDemographyPanel } from "./atlas-demography-panel";
import { AtlasHistoryPanel } from "./atlas-history-panel";
import { AtlasEnergyPanel } from "./atlas-energy-panel";
import { AtlasCapacityPanel } from "./atlas-capacity-panel";
import { atlasCapacityDataset, capacityTechnologies } from "./atlas-capacity";
import { atlasEnergyDataset, atlasEnergyMode } from "./atlas-energy";
import { atlasHistoryDataset, atlasHistoryMode } from "./atlas-history";
import {
  atlasDemographyDataset,
  atlasDemographyMode,
} from "./atlas-demography";
import { useNavigationType, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Cpu,
  Factory,
  Globe,
  History,
  House,
  Landmark,
  RefreshCw,
  Search,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { PageHeader } from "../../components/ui/page-header";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { atlasCatalog, atlasGeographies } from "./atlas-catalog";
import { atlasDisplayedQuality, atlasQuality } from "./atlas-analysis";
import { AtlasSeriesChart } from "./atlas-series-chart";
import { AtlasMarketPanel } from "./atlas-market-panel";
import { AtlasRelativePanel } from "./atlas-relative-panel";
import {
  relativeBenchmark,
  relativeProxiesFor,
  relativeTopic,
} from "./atlas-relative";
import { AtlasMarketOverview } from "./atlas-market-overview";
import { AtlasStatisticsOverview } from "./atlas-statistics-overview";
import { AtlasCoveragePanel } from "./atlas-coverage-panel";
import { AtlasCyclePanel } from "./atlas-cycle-panel";
import { cycleHypothesis } from "./atlas-cycle-hypotheses";
import { AtlasContextPanel } from "./atlas-context-panel";
import { atlasContextGuide, atlasContextOrigin } from "./atlas-context-guides";
import {
  atlasValuationCatalog,
  valuationCountryScopes,
  valuationDataset,
  valuationTopicSelection,
  valuationTopicTarget,
} from "./atlas-valuation";
import { atlasStatisticsBatchId } from "./atlas-statistics-overview-model";
import { valuationComparisonRegion } from "./atlas-valuation-regions";
import { atlasMarketBatchId } from "./atlas-market-overview-model";
import { atlasMarketProxies } from "./atlas-markets";
import type { AtlasSeriesResponse } from "./atlas-types";
import "./world-atlas.css";

const AtlasValuationPanel = lazy(() => import("./atlas-valuation-panel"));
const AtlasLocationExplorer = lazy(() => import("./atlas-location-explorer"));

const icons: Record<string, LucideIcon> = {
  users: Users,
  landmark: Landmark,
  zap: Zap,
  factory: Factory,
  cpu: Cpu,
  house: House,
  globe: Globe,
  history: History,
};
const errorMessage = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Der Atlas konnte die Daten nicht laden.";

function SourceDetails({ data }: { data: AtlasSeriesResponse }) {
  if (!data.provenance) return null;
  const source = data.provenance;
  const url =
    data.series.sourceId === "unsdg"
      ? source.metadataUrl
      : `https://data.worldbank.org/indicator/${encodeURIComponent(data.series.providerCode)}`;
  return (
    <details className="atlas-details">
      <summary>Quelle und Bedeutung</summary>
      <p>{source.definition || data.series.providerLabel}</p>
      <p>{source.sourceOrganization}</p>
      <p>
        {atlasSeriesSource(data.series)} · {data.series.providerCode} · lokal
        abgerufen am {new Date(source.retrievedAt).toLocaleDateString("de")}
        {source.providerUpdatedAt
          ? ` · Quellenstand ${source.providerUpdatedAt}`
          : ""}
      </p>
      <p>
        {data.series.observationKind === "modeled_estimate"
          ? "Diese Statistik beruht auf Modellschätzungen. Die Ursprungsquelle ist oben genannt."
          : "Quellenstatistik; Erhebungen und Schätzungen können je Land und Jahr unterschiedlich sein."}{" "}
        Die gesamte Historie entspricht dem zuletzt abgerufenen Quellenstand und
        kann rückwirkende Revisionen enthalten.
      </p>
      {data.series.unit === "percent_gross_enrollment" && (
        <p>
          Eine Bruttoeinschulungsquote kann über hundert Prozent liegen, etwa
          weil Lernende außerhalb der üblichen Altersgruppe mitgezählt werden.
          Sie misst keine Börsenbewertung.
        </p>
      )}
      <p>
        Öffentliche Veröffentlichung mit den genannten Ursprungsquellen. Es
        gelten die jeweiligen Datensatzbedingungen; einzelne Ursprungsquellen
        können von CC BY 4.0 abweichende Nutzungsbedingungen haben.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (isTauri()) {
            event.preventDefault();
            void openUrl(url);
          }
        }}
      >
        Statistik bei der Quelle öffnen
      </a>
    </details>
  );
}

export function WorldAtlasPage() {
  const [params, setParams] = useSearchParams();
  const navigationType = useNavigationType();
  const pendingParams = useRef(params);
  const pendingWrites = useRef(new Set<string>());
  const atlasRoot = useRef<HTMLDivElement>(null);
  function replaceView(next: URLSearchParams) {
    pendingParams.current = next;
    pendingWrites.current.add(next.toString());
    setParams(next);
  }
  const lastViewError = useAtlasLastView(params, replaceView);
  useEffect(() => {
    // A delayed commit of an earlier picker must not discard a newer choice.
    // Browser back/forward and navigation outside this page remain authoritative.
    const value = params.toString();
    if (
      navigationType === "POP" ||
      value === pendingParams.current.toString() ||
      !pendingWrites.current.has(value)
    ) {
      pendingParams.current = params;
      pendingWrites.current.clear();
    }
  }, [params, navigationType]);
  const search = params.get("topicSearch") ?? "";
  const setSearch = (value: string) => navigate({ topicSearch: value });
  const showNumbers = params.get("numbers") === "1";
  const setShowNumbers = (value: boolean) =>
    navigate({ numbers: value ? "1" : "0" });
  const pictureHeading = useRef<HTMLHeadingElement>(null);
  const isOverview = params.get("view") === "markets";
  const isStatistics = params.get("view") === "statistics";
  const isCoverage = params.get("view") === "coverage";
  const isValuation = params.get("view") === "valuation";
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({
    queryKey: ["atlas", "catalog"],
    queryFn: api.atlasCatalog,
    initialData: atlasCatalog,
    staleTime: Infinity,
  });
  const catalog = catalogQuery.data;
  const region =
    catalog.regions.find((item) => item.id === params.get("region"))?.id ??
    "world";
  const areas = useMemo(() => atlasGeographies(region), [region]);
  const geography =
    areas.find((item) => item.id === params.get("area")) ?? areas[0];
  const topic =
    catalog.topics.find((item) => item.id === params.get("topic")) ??
    catalog.topics[0];
  const group = catalog.groups.find((item) => item.id === topic.groupId)!;
  const cycleModel = cycleHypothesis(topic.id);
  const availableContextGuide = atlasContextGuide(topic.id);
  const contextOrigin = atlasContextOrigin(topic.id, params.get("fromGuide"));
  const valuationTarget = valuationTopicTarget(topic.id, geography.id);
  const cycleOrigin = cycleHypothesis(params.get("fromCycle"));
  const isCycle =
    Boolean(cycleModel) &&
    !isOverview &&
    !isStatistics &&
    !isCoverage &&
    !isValuation;
  const cycleExpanded =
    isCycle && params.get("hypothesis") === cycleModel?.topicId;
  const pictureContext = `${topic.id}:${params.get("series") ?? ""}:${isOverview}:${isStatistics}:${isCoverage}:${isValuation}`;
  const previousPicture = useRef(pictureContext);
  useEffect(() => {
    if (previousPicture.current === pictureContext) return;
    previousPicture.current = pictureContext;
    if (cycleExpanded) return; // The opened learning picture manages its own focus.
    const heading = pictureHeading.current;
    // Long topic lists can leave a newly selected short chart above the viewport.
    // Give keyboard users the new context without moving an already visible heading.
    if (heading && heading.getBoundingClientRect().top < 80) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView?.({ block: "start", behavior: "auto" });
    }
  }, [pictureContext, cycleExpanded]);
  const domain = catalog.domains.find((item) => item.id === group.domainId)!;
  const definitions = catalog.series.filter(
    (item) => item.topicId === topic.id,
  );
  const definition =
    definitions.find((item) => item.id === params.get("series")) ??
    definitions[0];
  const prefersStatistics =
    Boolean(definition) &&
    (params.get("perspective") === "worldbank" ||
      (!params.has("perspective") &&
        definitions.some((item) => item.id === params.get("series"))));
  const contextGuide = prefersStatistics ? undefined : availableContextGuide;
  const availableDemographyMode = atlasDemographyMode(topic.id);
  const historyMode = atlasHistoryMode(topic.id);
  const availableHealth = healthTopics[topic.id];
  const availableCommodity = commodityTopics[topic.id];
  const commodityMode =
    Boolean(availableCommodity) &&
    (params.get("perspective") === "commodities" ||
      (topic.id === "materials:commodity_prices" && !params.has("series")) ||
      (!definition &&
        [
          "fuels:lng",
          "materials:copper",
          "materials:aluminium",
          "materials:nickel",
          "materials:fertilizers",
          "food_water:fisheries",
        ].includes(topic.id) &&
        !params.has("perspective")));
  const findexMode = Boolean(findexTopics[topic.id]);
  const availablePublic = publicMetrics(topic.id).length > 0;
  const publicAreaAvailable =
    availablePublic &&
    publicSelection(params, topic.id, geography.id).source?.areas.some(
      (a) => a.geographyId === geography.id,
    );
  const legacyPrimary =
    (debtTopic(topic.id) &&
      (atlasDebtCatalog.areas.some((a) => a.geographyId === geography.id) ||
        !publicAreaAvailable)) ||
    (housingRatiosTopic(topic.id) &&
      (atlasHousingRatiosCatalog.areas.some(
        (a) => a.geographyId === geography.id,
      ) ||
        !publicAreaAvailable)) ||
    (creditTopic(topic.id) && Boolean(definition));
  const publicMode =
    availablePublic &&
    !prefersStatistics &&
    (params.get("perspective") === "public" ||
      (!params.has("perspective") &&
        (params.has("publicMetric") ||
          params.has("publicSource") ||
          !legacyPrimary)));
  const availableLabor = laborTopics[topic.id];
  const laborMode =
    Boolean(availableLabor) &&
    (params.get("perspective") === "labor" ||
      (topic.id === "labor:sector_structure" && !params.has("series")));
  const availableInnovation = innovationTopics[topic.id];
  const innovationMode =
    !publicMode &&
    Boolean(availableInnovation) &&
    (params.get("perspective") === "innovation" ||
      (!availableHealth &&
        !params.has("series") &&
        !["market", "worldbank"].includes(params.get("perspective") ?? "")));
  const healthMode =
    !publicMode &&
    !innovationMode &&
    Boolean(availableHealth) &&
    params.get("perspective") !== "market" &&
    (!definition ||
      params.get("perspective") === "health" ||
      (!params.has("series") && params.get("perspective") !== "worldbank"));
  const householdsMode = topic.id === atlasHouseholdsCatalog.topicId;
  const debtSector = debtTopic(topic.id);
  const fiscalMode = atlasFiscalCatalog.topicIds.includes(topic.id);
  const macrohistoryMode = topic.id === atlasMacrohistoryTopic;
  const demographyMode =
    availableDemographyMode &&
    (!definition || params.get("perspective") !== "worldbank")
      ? params.get("perspective") === "un-age65" &&
        topic.id === "demography:age_structure"
        ? "older"
        : availableDemographyMode
      : undefined;
  const relativeMode = topic.id === relativeTopic;
  const marketTopic = atlasMarketProxies.some((proxy) =>
    proxy.topicIds.includes(topic.id),
  );
  const ratioMode = housingRatiosTopic(topic.id);
  const availableAgriculture = agricultureTopic(topic.id);
  const agricultureMode =
    availableAgriculture &&
    (!definition ||
      params.get("perspective") === "agriculture" ||
      (!params.has("series") && params.get("perspective") !== "worldbank"));
  const availableEducation = educationMetrics(topic.id);
  const educationMode =
    availableEducation.length > 0 &&
    (!definition ||
      params.get("perspective") === "education" ||
      (!params.has("series") && params.get("perspective") !== "worldbank"));
  const propertyMode = propertyTopic(topic.id);
  const availableCredit = creditTopic(topic.id);
  const creditMode =
    availableCredit && (!definition || params.get("perspective") === "credit");
  const availableEnergyMode = atlasEnergyMode(topic.id);
  const availableCapacity = capacityTechnologies(topic.id);
  const capacityMode =
    !commodityMode &&
    availableCapacity.length > 0 &&
    (params.get("perspective") === "capacity" ||
      (!availableEnergyMode &&
        (!marketTopic || params.get("perspective") !== "market")));
  const energyMode =
    !commodityMode &&
    availableEnergyMode &&
    !capacityMode &&
    (!marketTopic || params.get("perspective") !== "market")
      ? availableEnergyMode
      : undefined;
  const comparisonArea = catalog.geographies.find(
    (item) => item.id === params.get("compare") && item.id !== geography.id,
  );
  const publicHasAlternative =
    availablePublic &&
    Boolean(
      definition ||
      debtSector ||
      availableCredit ||
      ratioMode ||
      propertyMode ||
      availableInnovation ||
      availableHealth ||
      availableCommodity ||
      availableLabor,
    );
  // Subscribe to the same public queries as the panel so a saved view freezes
  // its resolved default observations without navigation effects in the child.
  const householdEnabled =
    householdsMode &&
    !isOverview &&
    !isStatistics &&
    !isCoverage &&
    !isValuation;
  const householdQuery = useQuery({
    queryKey: ["atlas", "households", geography.id],
    queryFn: () => api.atlasHouseholds(geography.id),
    enabled: householdEnabled,
  });
  const householdComparison = useQuery({
    queryKey: ["atlas", "households", comparisonArea?.id],
    queryFn: () => api.atlasHouseholds(comparisonArea!.id),
    enabled: householdEnabled && Boolean(comparisonArea),
  });
  const query = useQuery({
    queryKey: ["atlas", "series", definition?.id, geography.id],
    queryFn: () =>
      api.atlasSeries({ seriesId: definition!.id, geographyId: geography.id }),
    enabled: Boolean(
      definition &&
      !demographyMode &&
      !healthMode &&
      !commodityMode &&
      !findexMode &&
      !publicMode &&
      !laborMode &&
      !innovationMode &&
      !householdsMode &&
      !debtSector &&
      !historyMode &&
      !cycleModel &&
      !contextGuide &&
      !energyMode &&
      !capacityMode &&
      !creditMode &&
      !ratioMode &&
      !agricultureMode &&
      !educationMode &&
      !propertyMode &&
      !isCoverage &&
      !isValuation &&
      !isStatistics &&
      !isOverview,
    ),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "series", definition?.id, comparisonArea?.id],
    queryFn: () =>
      api.atlasSeries({
        seriesId: definition!.id,
        geographyId: comparisonArea!.id,
      }),
    enabled: Boolean(
      definition &&
      comparisonArea &&
      atlasSeriesComparable(definition) &&
      !demographyMode &&
      !healthMode &&
      !commodityMode &&
      !findexMode &&
      !publicMode &&
      !laborMode &&
      !innovationMode &&
      !householdsMode &&
      !debtSector &&
      !historyMode &&
      !cycleModel &&
      !contextGuide &&
      !energyMode &&
      !capacityMode &&
      !creditMode &&
      !ratioMode &&
      !agricultureMode &&
      !educationMode &&
      !propertyMode &&
      !isCoverage &&
      !isValuation &&
      !isStatistics &&
      !isOverview,
    ),
  });
  const demographyAlternative = useQuery({
    queryKey: ["atlas", "demography", geography.id],
    queryFn: () => api.atlasDemography(geography.id),
    enabled:
      topic.id === "demography:age_structure" &&
      !demographyMode &&
      ["unsupported_area", "empty"].includes(query.data?.status ?? ""),
  });
  const job = useQuery({
    queryKey: ["atlas", "job"],
    queryFn: () => api.atlasSyncStatus(),
    enabled: !isPrivateWeb(),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1000 : false,
  });
  const sync = useMutation({
    mutationFn: (id: string) => api.syncAtlasSeries(id),
    onSuccess: (job) => {
      queryClient.setQueryData(["atlas", "job"], job);
    },
  });

  useEffect(() => {
    if (job.data?.seriesId.startsWith("public:")) {
      if (job.data.status !== "running")
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "public", job.data.seriesId.slice(7)],
        });
      return;
    }
    if (job.data?.seriesId === atlasLibraryJobId) {
      if (job.data.page > 0 || job.data.status !== "running") {
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "atlas" && query.queryKey[1] !== "job",
        });
      }
      return;
    }
    if (job.data?.seriesId.startsWith("damodaran:")) {
      if (job.data.status !== "running") {
        void queryClient.invalidateQueries({
          queryKey: [
            "atlas",
            "valuation",
            job.data.seriesId.slice("damodaran:".length),
          ],
        });
      }
      return;
    }
    if (job.data?.seriesId === atlasStatisticsBatchId) {
      if (job.data.page > 0 || job.data.status !== "running") {
        void queryClient.invalidateQueries({ queryKey: ["atlas", "series"] });
      }
      return;
    }
    // Each completed fund is atomic. Show partial successes even when a later
    // fund fails or the user stops the remaining batch.
    if (job.data?.seriesId === atlasMarketBatchId) {
      if (job.data.page > 0 || job.data.status !== "running") {
        void queryClient.invalidateQueries({ queryKey: ["atlas", "market"] });
      }
      return;
    }
    if (job.data?.status === "complete") {
      if (job.data.seriesId === atlasFindexDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "findex"] });
      if (job.data.seriesId === atlasCommodityDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "commodities"],
        });
      if (job.data.seriesId === atlasLaborDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "labor"],
        });
      if (job.data.seriesId === atlasInnovationDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "innovation"],
        });
      if (job.data.seriesId === atlasHealthDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "health"] });
      if (job.data.seriesId === atlasDebtDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "debt"] });
      if (job.data.seriesId === atlasHouseholdsDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "households"],
        });
      if (job.data.seriesId === atlasFiscalDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "fiscal"] });
      if (job.data.seriesId === atlasMacrohistoryDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "macrohistory"],
        });
      if (job.data.seriesId === atlasAgricultureDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "agriculture"],
        });
      if (job.data.seriesId === atlasEducationDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "education"],
        });
      if (job.data.seriesId === atlasHousingRatiosDataset)
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "housingRatios"],
        });
      if (job.data.seriesId === atlasPropertyDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "property"] });
      if (job.data.seriesId === atlasCreditDataset)
        void queryClient.invalidateQueries({ queryKey: ["atlas", "credit"] });
      if (job.data.seriesId === atlasCapacityDataset) {
        void queryClient.invalidateQueries({ queryKey: ["atlas", "capacity"] });
      }
      if (job.data.seriesId === atlasEnergyDataset) {
        void queryClient.invalidateQueries({ queryKey: ["atlas", "energy"] });
      }
      if (job.data.seriesId === atlasHistoryDataset) {
        void queryClient.invalidateQueries({ queryKey: ["atlas", "history"] });
      }
      if (job.data.seriesId === atlasDemographyDataset) {
        void queryClient.invalidateQueries({
          queryKey: ["atlas", "demography"],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["atlas", "series", job.data.seriesId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["atlas", "market", job.data.seriesId],
      });
    }
  }, [
    job.data?.status,
    job.data?.seriesId,
    job.data?.id,
    job.data?.page,
    queryClient,
  ]);

  function navigate(values: Record<string, string>) {
    // Keep fast picker changes until the router has rendered the latest URL.
    const next = new URLSearchParams(pendingParams.current);
    if (values.topic && values.topic !== next.get("topic")) {
      next.delete("perspective");
      next.delete("series");
      if (publicMetrics(values.topic).length) {
        next.delete("publicSource");
        next.delete("publicMetric");
        next.delete("publicCompareMetric");
      }
      if (commodityTopics[values.topic]) {
        [
          "commodityGroup",
          "commodityMetric",
          "commodityCompare",
          "commodityPage",
          "commoditySearch",
        ].forEach((key) => next.delete(key));
      }
      if (findexTopics[values.topic]) {
        next.delete("findexGroup");
        next.delete("findexMetric");
      }
      if (laborTopics[values.topic]) {
        next.delete("laborGroup");
        next.delete("laborMetric");
      }
      if (innovationTopics[values.topic]) {
        next.delete("innovationGroup");
        next.delete("innovationMetric");
      }
      if (healthTopics[values.topic]) {
        next.delete("healthGroup");
        next.delete("healthMetric");
      }
      if (housingRatiosTopic(values.topic)) next.delete("ratioBasis");
      if (educationMetrics(values.topic).length) next.delete("educationMetric");
      if (!("fromCycle" in values)) next.delete("fromCycle");
      if (!("fromGuide" in values)) next.delete("fromGuide");
    }
    if (
      ["topic", "area", "region"].some(
        (key) => key in values && values[key] !== next.get(key),
      )
    )
      next.delete("proxy");
    if (
      ["area", "region"].some(
        (key) => key in values && values[key] !== next.get(key),
      )
    )
      next.delete("hhRecord");
    if ("compare" in values && values.compare !== next.get("compare"))
      next.delete("hhCompareRecord");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Normalize against the pending selection, not a previous render's region.
    if ("valBasis" in values || "valScope" in values) {
      const base = valuationDataset(
        next.get("valMode"),
        next.get("valBasis"),
        next.get("valScope"),
      );
      if (!valuationComparisonRegion(base, next.get("valCompareScope")))
        next.delete("valCompareScope");
    }
    replaceView(next);
  }
  function chooseGroup(id: string) {
    const topics = catalog.topics.filter((topic) => topic.groupId === id);
    const first =
      topics.find((topic) =>
        catalog.series.some((series) => series.topicId === topic.id),
      ) ?? topics[0];
    navigate({ topic: first.id });
  }
  const searchResults = search.trim()
    ? catalog.topics.filter((topic) =>
        `${topic.label} ${catalog.groups.find((group) => group.id === topic.groupId)?.label}`
          .toLocaleLowerCase("de")
          .includes(search.trim().toLocaleLowerCase("de")),
      )
    : [];
  const busy = sync.isPending || job.data?.status === "running";
  const quality = query.data ? atlasQuality(query.data) : null;
  const comparisonQuality = comparison.data
    ? atlasQuality(comparison.data)
    : null;
  const rows =
    query.data?.status === "available"
      ? [
          query.data,
          ...(comparisonArea &&
          atlasSeriesComparable(query.data.series) &&
          comparison.data?.status === "available"
            ? [comparison.data]
            : []),
        ]
      : [];
  const currentJob = job.data?.seriesId === definition?.id ? job.data : null;
  const displayedQuality = atlasDisplayedQuality(rows);
  const notebookParams = new URLSearchParams(params);
  notebookParams.set("region", region);
  notebookParams.set("area", geography.id);
  notebookParams.set("topic", topic.id);
  if (comparisonArea) notebookParams.set("compare", comparisonArea.id);
  else notebookParams.delete("compare");
  if (definition) notebookParams.set("series", definition.id);
  const defaultDisplay: Record<string, string> = { numbers: "0" };
  if (isOverview)
    Object.assign(defaultDisplay, {
      marketsHorizon: "20",
      marketsGroup: "all",
    });
  if (!isOverview && !isStatistics && !isCoverage && !isValuation) {
    if (agricultureMode) {
      notebookParams.set("perspective", "agriculture");
      notebookParams.set(
        "agriMode",
        params.get("agriMode") === "perCapita" ? "perCapita" : "total",
      );
      notebookParams.set(
        "agriSince",
        ["1980", "2000"].includes(params.get("agriSince") ?? "")
          ? params.get("agriSince")!
          : "1961",
      );
      notebookParams.set(
        "agriGroup",
        atlasAgricultureCatalog.groups.find(
          (g) => g.id === params.get("agriGroup"),
        )?.id ?? "overview",
      );
      notebookParams.set(
        "agriItem",
        atlasAgricultureCatalog.items.find(
          (i) => i.code === params.get("agriItem"),
        )?.code ?? "all",
      );
    }
    if (educationMode) {
      notebookParams.set("perspective", "education");
      notebookParams.set(
        "educationMetric",
        availableEducation.find((m) => m.code === params.get("educationMetric"))
          ?.code ?? availableEducation[0].code,
      );
      notebookParams.set(
        "educationSince",
        ["2000", "2010"].includes(params.get("educationSince") ?? "")
          ? params.get("educationSince")!
          : "0",
      );
    }
    if (demographyMode)
      Object.assign(defaultDisplay, {
        demoYear: "2023",
        demoProjection: demographyMode === "population" ? "1" : "0",
      });
    if (commodityMode) {
      const selected = commoditySelection(params, topic.id);
      notebookParams.set("perspective", "commodities");
      // Keep an implicit topic scope implicit: fisheries includes fish meal
      // from another group and must reopen with the same exact subset.
      notebookParams.set("commodityMetric", selected.metric?.id ?? "");
      notebookParams.set("commodityCompare", selected.compare?.id ?? "");
      notebookParams.set("commodityBasis", selected.basis);
      notebookParams.set("commoditySince", String(selected.since));
      notebookParams.set("commoditySearch", selected.search);
      notebookParams.set("commodityPage", String(selected.page));
    }
    if (publicMode) {
      const selected = publicSelection(params, topic.id, geography.id);
      notebookParams.set("perspective", "public");
      notebookParams.set("publicSource", selected.source!.id);
      notebookParams.set("publicMetric", selected.metric!.id);
      notebookParams.set("publicSince", String(selected.since));
      if (selected.source?.id === "bis-commercial-property") {
        const compared = publicComparisonSelection(
          params,
          selected.metric!,
          comparisonArea?.id ?? "",
        );
        notebookParams.set("publicCompareMetric", compared.metric?.id ?? "");
      }
    }
    if (findexMode) {
      const selected = findexSelection(params, topic.id);
      notebookParams.set("perspective", "findex");
      notebookParams.set("findexGroup", selected.group);
      notebookParams.set("findexMetric", selected.metric || "overview");
      notebookParams.set("findexPopulation", selected.population);
      notebookParams.set("findexSince", String(selected.since));
    }
    if (laborMode) {
      const selected = laborSelection(params, topic.id);
      notebookParams.set("perspective", "labor");
      notebookParams.set("laborGroup", selected.group);
      notebookParams.set("laborMetric", selected.metric || "overview");
      notebookParams.set("laborSince", String(selected.since));
    }
    if (innovationMode) {
      const selected = innovationSelection(params, topic.id);
      notebookParams.set("perspective", "innovation");
      notebookParams.set("innovationGroup", selected.group);
      notebookParams.set("innovationMetric", selected.metric || "overview");
      notebookParams.set("innovationSince", String(selected.since));
      notebookParams.set("innovationThrough", String(selected.through));
    }
    if (healthMode) {
      const selected = healthSelection(params, topic.id);
      notebookParams.set("perspective", "health");
      notebookParams.set("healthGroup", selected.group);
      notebookParams.set("healthMetric", selected.metric || "overview");
      notebookParams.set("healthSince", String(selected.since));
    }
    if (householdsMode) {
      const householdGroup =
        atlasHouseholdsCatalog.groups.find(
          (g) => g.id === params.get("hhGroup"),
        )?.id ?? "size";
      const householdMetrics = atlasHouseholdsCatalog.metrics.filter(
        (m) => m.group === householdGroup,
      );
      notebookParams.set("hhGroup", householdGroup);
      notebookParams.set(
        "hhMetric",
        householdMetrics.find((m) => m.id === params.get("hhMetric"))?.id ??
          householdMetrics[0].id,
      );
      notebookParams.set(
        "hhSince",
        ["1980", "2000"].includes(params.get("hhSince") ?? "")
          ? params.get("hhSince")!
          : "1959",
      );
      const householdMetric = householdMetrics.find(
        (m) => m.id === notebookParams.get("hhMetric"),
      )!;
      for (const [key, data] of [
        ["hhRecord", householdQuery.data],
        ["hhCompareRecord", householdComparison.data],
      ] as const) {
        const observation = householdSelection(
          data,
          householdMetric,
          params.get(key) ?? "",
        );
        if (observation) notebookParams.set(key, observation.recordId);
        else notebookParams.delete(key);
      }
    }
    if (fiscalMode) {
      notebookParams.set(
        "fiscalGroup",
        atlasFiscalCatalog.groups.some(
          (g) => g.id === params.get("fiscalGroup"),
        )
          ? params.get("fiscalGroup")!
          : topic.id === "finance:public_debt"
            ? "debt"
            : "budget",
      );
      notebookParams.set(
        "fiscalMetric",
        atlasFiscalCatalog.metrics.some(
          (m) => m.id === params.get("fiscalMetric"),
        )
          ? params.get("fiscalMetric")!
          : "",
      );
      notebookParams.set(
        "fiscalSince",
        ["1800", "1900", "1950", "1980", "2000"].includes(
          params.get("fiscalSince") ?? "",
        )
          ? params.get("fiscalSince")!
          : "1800",
      );
    }
    if (macrohistoryMode) {
      notebookParams.set(
        "jstGroup",
        atlasMacrohistoryCatalog.groups.some(
          (g) => g.id === params.get("jstGroup"),
        )
          ? params.get("jstGroup")!
          : "credit",
      );
      notebookParams.set(
        "jstMetric",
        atlasMacrohistoryCatalog.metrics.some(
          (m) => m.id === params.get("jstMetric"),
        )
          ? params.get("jstMetric")!
          : "",
      );
      notebookParams.set(
        "jstSince",
        ["1870", "1900", "1950", "1980"].includes(params.get("jstSince") ?? "")
          ? params.get("jstSince")!
          : "1870",
      );
      notebookParams.set("jstReal", params.get("jstReal") === "0" ? "0" : "1");
      notebookParams.set(
        "jstCrises",
        params.get("jstCrises") === "1" ? "1" : "0",
      );
    }
    if (historyMode)
      Object.assign(defaultDisplay, {
        historySince: "1820",
        historyProportional: "1",
      });
    if (energyMode)
      Object.assign(defaultDisplay, {
        energySince: "2000",
        energyMeasure: "share",
      });
    if (ratioMode && !publicMode) {
      notebookParams.set("perspective", "housingRatios");
      notebookParams.set(
        "ratioBasis",
        ["income", "rent"].includes(params.get("ratioBasis") ?? "")
          ? params.get("ratioBasis")!
          : housingRatioDefaultBasis(topic.id),
      );
      notebookParams.set(
        "ratioMode",
        params.get("ratioMode") === "index" ? "index" : "relative",
      );
      notebookParams.set(
        "ratioSince",
        ["2000", "2010"].includes(params.get("ratioSince") ?? "")
          ? params.get("ratioSince")!
          : "0",
      );
    }
    if (propertyMode && !publicMode) {
      notebookParams.set("perspective", "property");
      notebookParams.set(
        "propertyMode",
        params.get("propertyMode") === "change" ? "change" : "index",
      );
      notebookParams.set(
        "propertyBasis",
        params.get("propertyBasis") === "nominal" ? "nominal" : "real",
      );
      notebookParams.set(
        "propertyScale",
        params.get("propertyScale") === "proportional"
          ? "proportional"
          : "linear",
      );
      notebookParams.set(
        "propertySince",
        ["1970", "2000"].includes(params.get("propertySince") ?? "")
          ? params.get("propertySince")!
          : "0",
      );
    }
    if (creditMode && !publicMode) {
      notebookParams.set("perspective", "credit");
      notebookParams.set(
        "creditMode",
        params.get("creditMode") === "ratio" ? "ratio" : "gap",
      );
      notebookParams.set(
        "creditSince",
        ["1980", "2000"].includes(params.get("creditSince") ?? "")
          ? params.get("creditSince")!
          : "0",
      );
    }
    if (capacityMode && !publicMode) {
      notebookParams.set("perspective", "capacity");
      notebookParams.set(
        "capacityTech",
        availableCapacity.find((t) => t.id === params.get("capacityTech"))
          ?.id ?? availableCapacity[0].id,
      );
      notebookParams.set(
        "capacityGrid",
        params.get("capacityGrid") === "offgrid" ? "offgrid" : "ongrid",
      );
      notebookParams.set(
        "capacitySince",
        params.get("capacitySince") === "2010" ? "2010" : "2000",
      );
    }
    if (relativeMode) {
      const choices = relativeProxiesFor(geography.id);
      const selected =
        choices.find((p) => p.id === params.get("proxy")) ?? choices[0];
      notebookParams.set("perspective", "relative");
      if (selected) {
        notebookParams.set("proxy", selected.id);
        notebookParams.set("relativeBenchmark", relativeBenchmark(selected).id);
      } else {
        notebookParams.delete("proxy");
        notebookParams.delete("relativeBenchmark");
      }
      defaultDisplay.relativeHorizon = "20";
    }
    if (marketTopic) defaultDisplay.marketHorizon = "20";
  }
  for (const [key, value] of Object.entries(defaultDisplay))
    if (!notebookParams.has(key)) notebookParams.set(key, value);
  const valuationTopic = valuationTopicSelection(params.get("valTopic"));
  const valuationIndustry = atlasValuationCatalog.industries.find(
    (industry) =>
      industry.id === params.get("valSubject") &&
      industry.active &&
      (!valuationTopic ||
        valuationTopic.providerLabels.includes(industry.providerLabel)),
  );
  const valuationScope = valuationDataset(
    "industries",
    params.get("valBasis"),
    params.get("valScope"),
  );
  const valuationRegion = valuationIndustry
    ? valuationComparisonRegion(valuationScope, params.get("valCompareScope"))
    : null;
  const contextLabel =
    commodityMode && !isValuation && !isOverview && !isStatistics && !isCoverage
      ? `Internationale Rohstoffpreise · ${commoditySelection(params, topic.id).metric?.label ?? topic.label}`
      : isValuation && params.get("valMode") === "industries"
        ? `${valuationScope.scopeLabel}${valuationRegion ? ` / ${valuationRegion.scopeLabel}` : ""} · ${valuationIndustry?.label ?? valuationTopic?.topicLabel ?? "Branchen"} · Bewertungsbilder`
        : `${isOverview ? "Marktübersicht" : `${geography.label}${comparisonArea ? ` / ${comparisonArea.label}` : ""}`} · ${isStatistics ? "Länderübersicht" : isValuation ? "Bewertungsbilder" : isCoverage ? "Daten & Quellen" : isOverview ? "Langfristige Marktwellen" : topic.label}`;

  return (
    <AtlasDisplayContext.Provider value={{ params, navigate }}>
      <div ref={atlasRoot} className="page world-atlas-page">
        <PageHeader
          icon={Globe}
          eyebrow="Weltweite Perspektiven"
          title="Weltatlas"
          description="Menschen, Wirtschaft und Märkte über lange Zeiträume verstehen."
        />
        <AtlasNotebookPanel
          params={notebookParams}
          contextLabel={contextLabel}
          root={atlasRoot}
          onNavigate={replaceView}
          lastViewError={lastViewError}
        />
        <div
          className="atlas-view-switch atlas-wave-horizons"
          role="group"
          aria-label="Atlasansicht"
        >
          <button
            type="button"
            aria-pressed={
              !isOverview && !isStatistics && !isCoverage && !isValuation
            }
            onClick={() => navigate({ view: "" })}
          >
            Länder & Themen
          </button>
          <button
            type="button"
            aria-pressed={isStatistics}
            onClick={() => navigate({ view: "statistics" })}
          >
            Länderübersicht
          </button>
          <button
            type="button"
            aria-pressed={isOverview}
            onClick={() => navigate({ view: "markets" })}
          >
            Marktübersicht
          </button>
          <button
            type="button"
            aria-pressed={isValuation}
            onClick={() => navigate({ view: "valuation" })}
          >
            Bewertungsbilder
          </button>
          <button
            type="button"
            aria-pressed={isCoverage}
            onClick={() => navigate({ view: "coverage" })}
          >
            Daten & Quellen
          </button>
        </div>
        <AtlasLibraryPanel job={job.data} />
        {isOverview ? (
          <>
            <AtlasMarketOverview
              showNumbers={showNumbers}
              onNumbersChange={setShowNumbers}
              job={job.data}
              onChoose={(proxy) => {
                const area = catalog.geographies.find(
                  (area) => area.id === proxy.geographyId,
                )!;
                navigate({
                  view: "",
                  region: area.regionId,
                  area: area.id,
                  topic: proxy.topicIds[0],
                  proxy: proxy.id,
                  perspective: "market",
                  compare: "",
                });
              }}
            />
            {job.error && (
              <p className="atlas-notice" role="alert">
                Abrufstatus: {errorMessage(job.error)}
              </p>
            )}
          </>
        ) : (
          <>
            {!(isValuation && params.get("valMode") === "industries") && (
              <div className="atlas-location-toggle">
                <Button
                  variant="default"
                  aria-expanded={params.get("map") === "open"}
                  aria-controls="atlas-location-explorer"
                  onClick={() =>
                    navigate({
                      map: params.get("map") === "open" ? "" : "open",
                    })
                  }
                >
                  <Globe size={16} aria-hidden />
                  {params.get("map") === "open"
                    ? "Weltkarte & Länderliste schließen"
                    : "Weltkarte & Länderliste öffnen"}
                </Button>
              </div>
            )}
            {params.get("map") === "open" &&
              !(isValuation && params.get("valMode") === "industries") && (
                <div id="atlas-location-explorer">
                  <Suspense
                    fallback={<p role="status">Weltkarte wird geladen …</p>}
                  >
                    <AtlasLocationExplorer
                      geography={geography}
                      comparison={
                        !isCoverage && !isCycle ? comparisonArea : undefined
                      }
                      allowComparison={!isCoverage && !isCycle}
                      filters={{
                        region: params.get("mapRegion"),
                        search: params.get("mapSearch"),
                      }}
                      onFilter={navigate}
                      onChoose={(area, target) => {
                        if (target === "compare") {
                          navigate({
                            compare: area.id === geography.id ? "" : area.id,
                          });
                        } else {
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare:
                              area.id === comparisonArea?.id
                                ? ""
                                : (comparisonArea?.id ?? ""),
                          });
                        }
                      }}
                    />
                  </Suspense>
                </div>
              )}
            {!(isValuation && params.get("valMode") === "industries") && (
              <div
                className={`atlas-location${isCoverage || isCycle ? " is-coverage" : ""}`}
              >
                <label>
                  Region
                  <select
                    className="input"
                    value={region}
                    onChange={(event) =>
                      navigate({
                        region: event.target.value,
                        area: "",
                        compare: "",
                      })
                    }
                  >
                    {catalog.regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Land oder Gebiet
                  <select
                    className="input"
                    value={geography.id}
                    onChange={(event) => navigate({ area: event.target.value })}
                  >
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!isCoverage && !isCycle && (
                  <label>
                    Land vergleichen
                    <select
                      className="input"
                      value={comparisonArea?.id ?? ""}
                      onChange={(event) =>
                        navigate({ compare: event.target.value })
                      }
                    >
                      <option value="">Einzelansicht</option>
                      {atlasGeographies("world")
                        .filter((area) => area.id !== geography.id)
                        .map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {isValuation ? (
              <Suspense
                fallback={<p role="status">Bewertungsansicht wird geladen …</p>}
              >
                <AtlasValuationPanel
                  geography={geography}
                  comparison={comparisonArea}
                  showNumbers={showNumbers}
                  onNumbersChange={setShowNumbers}
                  job={job.data}
                  filters={{
                    mode: params.get("valMode"),
                    basis: params.get("valBasis"),
                    scope: params.get("valScope"),
                    metric: params.get("valMetric"),
                    group: params.get("valGroup"),
                    subject: params.get("valSubject"),
                    compare: params.get("valCompare"),
                    compareScope: params.get("valCompareScope"),
                    page: params.get("valPage"),
                    topic: params.get("valTopic"),
                  }}
                  onNavigate={navigate}
                />
                {job.error && (
                  <p className="atlas-notice" role="alert">
                    Abrufstatus: {errorMessage(job.error)}
                  </p>
                )}
              </Suspense>
            ) : isCoverage ? (
              <AtlasCoveragePanel
                geography={geography}
                showNumbers={showNumbers}
                onNumbersChange={setShowNumbers}
                filters={{
                  domain: params.get("coverageDomain"),
                  search: params.get("coverageSearch"),
                  status: params.get("coverageStatus"),
                }}
                onNavigate={navigate}
              />
            ) : isStatistics ? (
              <>
                <AtlasStatisticsOverview
                  geography={geography}
                  comparison={comparisonArea}
                  showNumbers={showNumbers}
                  onNumbersChange={setShowNumbers}
                  job={job.data}
                  filters={{
                    domain: params.get("statDomain"),
                    group: params.get("statGroup"),
                    horizon: params.get("statHorizon"),
                  }}
                  onFilters={navigate}
                  onChoose={(definition) =>
                    navigate({
                      view: "",
                      topic: definition.topicId,
                      series: definition.id,
                      perspective: "worldbank",
                    })
                  }
                />
                {job.error && (
                  <p className="atlas-notice" role="alert">
                    Abrufstatus: {errorMessage(job.error)}
                  </p>
                )}
              </>
            ) : (
              <>
                <nav className="atlas-domains" aria-label="Themenfelder">
                  {catalog.domains.map((item) => {
                    const Icon = icons[item.icon] ?? Globe;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={item.id === domain.id}
                        onClick={() =>
                          chooseGroup(
                            catalog.groups.find(
                              (group) => group.domainId === item.id,
                            )!.id,
                          )
                        }
                      >
                        <Icon size={20} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <div className="atlas-workspace">
                  <aside className="atlas-topics" aria-label="Themenauswahl">
                    <label className="atlas-search">
                      <Search size={16} aria-hidden="true" />
                      <input
                        className="input"
                        aria-label="Thema suchen"
                        placeholder="Thema suchen …"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    {search.trim() ? (
                      <div
                        className="atlas-search-results"
                        aria-label="Suchergebnisse"
                      >
                        {searchResults.length ? (
                          searchResults.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => {
                                navigate({ topic: item.id });
                                setSearch("");
                              }}
                            >
                              <span>{item.label}</span>
                              <small>
                                {
                                  catalog.groups.find(
                                    (group) => group.id === item.groupId,
                                  )?.label
                                }
                              </small>
                            </button>
                          ))
                        ) : (
                          <p className="muted">
                            Kein passendes Thema gefunden.
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <nav aria-label="Themengruppen">
                          {catalog.groups
                            .filter((item) => item.domainId === domain.id)
                            .map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                aria-pressed={item.id === group.id}
                                onClick={() => chooseGroup(item.id)}
                              >
                                {item.label}
                              </button>
                            ))}
                        </nav>
                        <div
                          className="atlas-topic-list"
                          aria-label={group.label}
                        >
                          {catalog.topics
                            .filter((item) => item.groupId === group.id)
                            .map((item) => (
                              <button
                                type="button"
                                key={item.id}
                                aria-current={
                                  item.id === topic.id ? "true" : undefined
                                }
                                onClick={() => navigate({ topic: item.id })}
                              >
                                {item.label}
                              </button>
                            ))}
                        </div>
                      </>
                    )}
                  </aside>
                  <section
                    className="atlas-picture"
                    aria-labelledby="atlas-picture-title"
                  >
                    <div className="atlas-breadcrumb" aria-live="polite">
                      {commodityMode
                        ? "Internationale Referenzpreise"
                        : isCycle
                          ? "Modellansicht"
                          : geography.label}{" "}
                      · {domain.label} · {group.label}
                    </div>
                    {!isCycle && cycleOrigin && (
                      <button
                        type="button"
                        className="atlas-cycle-return"
                        onClick={() =>
                          navigate({
                            topic: cycleOrigin.topicId,
                            fromCycle: "",
                            hypothesis: cycleOrigin.topicId,
                          })
                        }
                      >
                        Zur Zyklusthese zurück ·{" "}
                        {
                          catalog.topics.find(
                            (item) => item.id === cycleOrigin.topicId,
                          )?.label
                        }
                      </button>
                    )}
                    {!contextGuide && contextOrigin && (
                      <button
                        type="button"
                        className="atlas-cycle-return"
                        onClick={() =>
                          navigate({
                            topic: contextOrigin.topicId,
                            fromGuide: "",
                          })
                        }
                      >
                        Zum Themen-Einstieg zurück ·{" "}
                        {
                          catalog.topics.find(
                            (item) => item.id === contextOrigin.topicId,
                          )?.label
                        }
                      </button>
                    )}
                    <div className="atlas-picture-heading">
                      <div>
                        <span className="atlas-kind">
                          {publicMode
                            ? publicSelection(params, topic.id, geography.id)
                                .source?.label
                            : findexMode
                              ? "Finanzielle Teilhabe · Findex"
                              : commodityMode
                                ? "Internationale Rohstoffpreise"
                                : laborMode
                                  ? "Beschäftigungsbilder · ILOSTAT"
                                  : innovationMode
                                    ? "Technologiebilder · WIPO"
                                    : healthMode
                                      ? "Gesundheitsbilder · WHO"
                                      : debtSector
                                        ? "Schuldenbilder · BIS"
                                        : contextGuide
                                          ? contextGuide.research
                                            ? "Themen-Einstieg · Quellen und Grenzen"
                                            : "Themen-Einstieg · vorhandene Datenbilder"
                                          : householdsMode
                                            ? "Haushalte · UN-Erhebungen"
                                            : fiscalMode
                                              ? "Staatsfinanzen · IMF"
                                              : macrohistoryMode
                                                ? "Finanzgeschichte · JST"
                                                : agricultureMode
                                                  ? "Agrarbilder · FAO"
                                                  : educationMode
                                                    ? "Bildung · UNESCO UIS"
                                                    : ratioMode
                                                      ? "Kaufpreise, Einkommen & Mieten"
                                                      : propertyMode
                                                        ? "Langfristige Immobilienbilder"
                                                        : creditMode
                                                          ? "Langfristige Kreditbilder"
                                                          : energyMode ||
                                                              capacityMode
                                                            ? "Strom & Kapazität"
                                                            : historyMode
                                                              ? "Jahrhundertperspektive"
                                                              : demographyMode
                                                                ? "Demografie · UN-Perspektive"
                                                                : relativeMode
                                                                  ? "Relative Marktstärke"
                                                                  : marketTopic
                                                                    ? "Marktwelle"
                                                                    : definition
                                                                      ? definition.observationKind ===
                                                                        "modeled_estimate"
                                                                        ? "Modellschätzungen"
                                                                        : definition.sourceId ===
                                                                            "unsdg"
                                                                          ? "UN-SDG · Erhebungen und Schätzungen"
                                                                          : "Entwicklung"
                                                                      : group.id ===
                                                                          "cycle_hypotheses"
                                                                        ? "Zyklusthese"
                                                                        : "Themenperspektive"}
                        </span>
                        <h2
                          id="atlas-picture-title"
                          ref={pictureHeading}
                          tabIndex={-1}
                        >
                          {publicMode ||
                          findexMode ||
                          commodityMode ||
                          laborMode ||
                          innovationMode ||
                          healthMode ||
                          debtSector ||
                          householdsMode ||
                          fiscalMode ||
                          macrohistoryMode ||
                          agricultureMode ||
                          educationMode ||
                          ratioMode ||
                          propertyMode ||
                          creditMode ||
                          demographyMode ||
                          energyMode ||
                          capacityMode
                            ? topic.label
                            : (definition?.label ?? topic.label)}
                        </h2>
                      </div>
                      {(publicMode ||
                        findexMode ||
                        commodityMode ||
                        laborMode ||
                        innovationMode ||
                        healthMode ||
                        debtSector ||
                        householdsMode ||
                        fiscalMode ||
                        macrohistoryMode ||
                        definition ||
                        agricultureMode ||
                        educationMode ||
                        marketTopic ||
                        relativeMode ||
                        demographyMode ||
                        energyMode ||
                        capacityMode ||
                        ratioMode ||
                        propertyMode ||
                        creditMode ||
                        historyMode) && (
                        <label className="atlas-numbers">
                          <input
                            type="checkbox"
                            checked={showNumbers}
                            onChange={(event) =>
                              setShowNumbers(event.target.checked)
                            }
                          />{" "}
                          Zahlen anzeigen
                        </label>
                      )}
                    </div>
                    {(availableCommodity ||
                      publicHasAlternative ||
                      availableLabor ||
                      availableInnovation ||
                      (availableHealth && definition)) && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Themenquelle"
                      >
                        {publicHasAlternative && (
                          <button
                            type="button"
                            aria-pressed={publicMode}
                            onClick={() => navigate({ perspective: "public" })}
                          >
                            Weitere Quellenperspektive
                          </button>
                        )}
                        {availablePublic && debtSector && (
                          <button
                            type="button"
                            aria-pressed={!publicMode && !prefersStatistics}
                            onClick={() => navigate({ perspective: "debt" })}
                          >
                            Schuldenbilder · BIS
                          </button>
                        )}
                        {availablePublic && availableCredit && !definition && (
                          <button
                            type="button"
                            aria-pressed={!publicMode && creditMode}
                            onClick={() => navigate({ perspective: "credit" })}
                          >
                            Kreditwelle · BIS
                          </button>
                        )}
                        {availablePublic && ratioMode && (
                          <button
                            type="button"
                            aria-pressed={!publicMode && !prefersStatistics}
                            onClick={() =>
                              navigate({ perspective: "housingRatios" })
                            }
                          >
                            Kaufpreise zu Einkommen und Mieten · OECD
                          </button>
                        )}
                        {availablePublic && propertyMode && (
                          <button
                            type="button"
                            aria-pressed={!publicMode && !prefersStatistics}
                            onClick={() =>
                              navigate({ perspective: "property" })
                            }
                          >
                            Immobilienpreise · BIS
                          </button>
                        )}
                        {availableCommodity && (
                          <button
                            type="button"
                            aria-pressed={commodityMode}
                            onClick={() =>
                              navigate({ perspective: "commodities" })
                            }
                          >
                            Rohstoffpreise · Weltbank
                          </button>
                        )}
                        {availableLabor && (
                          <button
                            type="button"
                            aria-pressed={laborMode}
                            onClick={() => navigate({ perspective: "labor" })}
                          >
                            Beschäftigungsbilder · ILOSTAT
                          </button>
                        )}
                        {availableInnovation && (
                          <button
                            type="button"
                            aria-pressed={!publicMode && innovationMode}
                            onClick={() =>
                              navigate({ perspective: "innovation" })
                            }
                          >
                            Technologiebilder · WIPO
                          </button>
                        )}
                        {availableHealth && (
                          <button
                            type="button"
                            aria-pressed={healthMode}
                            onClick={() => navigate({ perspective: "health" })}
                          >
                            Gesundheitsbilder · WHO
                          </button>
                        )}
                        {definition && (
                          <button
                            type="button"
                            aria-pressed={
                              !commodityMode &&
                              !publicMode &&
                              !findexMode &&
                              !laborMode &&
                              !healthMode &&
                              !innovationMode
                            }
                            onClick={() =>
                              navigate({ perspective: "worldbank" })
                            }
                          >
                            WDI-Perspektive · Weltbank
                          </button>
                        )}
                        {availableInnovation && marketTopic && (
                          <button
                            type="button"
                            aria-pressed={
                              params.get("perspective") === "market"
                            }
                            onClick={() => navigate({ perspective: "market" })}
                          >
                            Marktwelle
                          </button>
                        )}
                      </div>
                    )}
                    {propertyMode && (
                      <div className="atlas-wave-horizons atlas-perspectives">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              topic: "housing:affordability",
                              perspective: "housingRatios",
                              ratioBasis: "income",
                              ratioMode: "relative",
                              ratioSince: "0",
                            })
                          }
                        >
                          Kaufpreise zu Einkommen & Mieten ansehen
                        </button>
                      </div>
                    )}
                    {availableAgriculture && definition && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Agrarquelle"
                      >
                        <button
                          type="button"
                          aria-pressed={agricultureMode}
                          onClick={() =>
                            navigate({ perspective: "agriculture" })
                          }
                        >
                          Produktionsbilder · FAO
                        </button>
                        <button
                          type="button"
                          aria-pressed={!agricultureMode}
                          onClick={() => navigate({ perspective: "worldbank" })}
                        >
                          WDI-Perspektive · Weltbank
                        </button>
                      </div>
                    )}
                    {availableEducation.length > 0 && definition && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Bildungsquelle"
                      >
                        <button
                          type="button"
                          aria-pressed={educationMode}
                          onClick={() => navigate({ perspective: "education" })}
                        >
                          Bildungsbilder · UNESCO
                        </button>
                        <button
                          type="button"
                          aria-pressed={!educationMode}
                          onClick={() => navigate({ perspective: "worldbank" })}
                        >
                          WDI-Perspektive · Weltbank
                        </button>
                      </div>
                    )}
                    {ratioMode && (
                      <div className="atlas-wave-horizons atlas-perspectives">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              topic: "housing:house_prices",
                              perspective: "property",
                            })
                          }
                        >
                          Wohnimmobilienpreise bei der BIS ansehen
                        </button>
                      </div>
                    )}
                    {availableCredit && definition && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Kreditperspektive"
                      >
                        <button
                          type="button"
                          aria-pressed={!creditMode}
                          onClick={() => navigate({ perspective: "worldbank" })}
                        >
                          Inlandskredit · Weltbank
                        </button>
                        <button
                          type="button"
                          aria-pressed={creditMode}
                          onClick={() => navigate({ perspective: "credit" })}
                        >
                          Kreditwelle · BIS
                        </button>
                      </div>
                    )}
                    {availableDemographyMode && definition && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Demografische Perspektive"
                      >
                        <button
                          type="button"
                          aria-pressed={
                            Boolean(demographyMode) &&
                            demographyMode !== "older"
                          }
                          onClick={() => navigate({ perspective: "" })}
                        >
                          Altersprofil · UN
                        </button>
                        {topic.id === "demography:age_structure" && (
                          <button
                            type="button"
                            aria-pressed={demographyMode === "older"}
                            onClick={() =>
                              navigate({
                                perspective: "un-age65",
                                demoProjection: "0",
                              })
                            }
                          >
                            Anteil 65+ · UN
                          </button>
                        )}
                        <button
                          type="button"
                          aria-pressed={!demographyMode}
                          onClick={() => navigate({ perspective: "worldbank" })}
                        >
                          Anteil 65+ · Weltbank
                        </button>
                      </div>
                    )}
                    {(availableEnergyMode || availableCapacity.length > 0) && (
                      <div
                        className="atlas-wave-horizons atlas-perspectives"
                        role="group"
                        aria-label="Energieperspektive"
                      >
                        {availableEnergyMode && (
                          <button
                            type="button"
                            aria-pressed={Boolean(energyMode)}
                            onClick={() => navigate({ perspective: "" })}
                          >
                            Energiewirtschaft
                          </button>
                        )}
                        {availableCapacity.length > 0 && (
                          <button
                            type="button"
                            aria-pressed={capacityMode}
                            onClick={() =>
                              navigate({ perspective: "capacity" })
                            }
                          >
                            Anlagen & Technologien
                          </button>
                        )}
                        {marketTopic && (
                          <button
                            type="button"
                            aria-pressed={!energyMode && !capacityMode}
                            onClick={() => navigate({ perspective: "market" })}
                          >
                            Börsenlage
                          </button>
                        )}
                      </div>
                    )}
                    {valuationTarget && (
                      <div className="atlas-overview-download">
                        <Button
                          size="sm"
                          onClick={() => navigate(valuationTarget)}
                        >
                          Bewertungsbilder zu diesem Thema öffnen
                        </Button>
                        <span>
                          {valuationTarget.valMode === "countries"
                            ? `Unternehmenskennzahlen · ${geography.label}`
                            : valuationCountryScopes[geography.id]
                              ? "Branchen der eigenen NYU-Quellenregion"
                              : "Globale Branchenstichprobe · anderes Quellengebiet"}
                        </span>
                      </div>
                    )}
                    {publicMode ? (
                      <AtlasPublicPanel
                        topicId={topic.id}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(id) =>
                          navigate({
                            area: id,
                            region:
                              catalog.geographies.find((g) => g.id === id)
                                ?.regionId ?? "world",
                            compare: "",
                          })
                        }
                      />
                    ) : contextGuide ? (
                      <AtlasContextPanel
                        guide={contextGuide}
                        geography={geography}
                        comparison={comparisonArea}
                        onNavigate={navigate}
                      />
                    ) : cycleModel ? (
                      <AtlasCyclePanel
                        key={cycleModel.topicId}
                        model={cycleModel}
                        geography={geography}
                        comparison={comparisonArea}
                        opened={params.get("hypothesis") === cycleModel.topicId}
                        stepId={params.get("cycleStep")}
                        onNavigate={navigate}
                      />
                    ) : commodityMode ? (
                      <AtlasCommoditiesPanel
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : findexMode ? (
                      <AtlasFindexPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : laborMode ? (
                      <AtlasLaborPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : innovationMode ? (
                      <AtlasInnovationPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : healthMode ? (
                      <AtlasHealthPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : debtSector ? (
                      <AtlasDebtPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        sector={debtSector}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({ area: area.id, region: area.regionId })
                        }
                      />
                    ) : householdsMode ? (
                      <AtlasHouseholdsPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(id) => {
                          const area = catalog.geographies.find(
                            (a) => a.id === id,
                          )!;
                          navigate({ area: id, region: area.regionId });
                        }}
                      />
                    ) : fiscalMode ? (
                      <AtlasFiscalPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : macrohistoryMode ? (
                      <AtlasMacrohistoryPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                      />
                    ) : agricultureMode ? (
                      <AtlasAgriculturePanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({ area: area.id, region: area.regionId })
                        }
                      />
                    ) : educationMode ? (
                      <AtlasEducationPanel
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({ area: area.id, region: area.regionId })
                        }
                      />
                    ) : ratioMode ? (
                      <AtlasHousingRatiosPanel
                        key={geography.id}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare: "",
                          })
                        }
                      />
                    ) : propertyMode ? (
                      <AtlasPropertyPanel
                        key={geography.id}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare: "",
                          })
                        }
                      />
                    ) : creditMode ? (
                      <AtlasCreditPanel
                        key={geography.id}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare: "",
                          })
                        }
                      />
                    ) : capacityMode ? (
                      <AtlasCapacityPanel
                        key={`${topic.id}:${geography.id}`}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        topicId={topic.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        onAreaChange={(area) =>
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare: "",
                          })
                        }
                      />
                    ) : energyMode ? (
                      <>
                        <AtlasEnergyPanel
                          key={`${topic.id}:${geography.id}`}
                          geography={geography}
                          compareId={comparisonArea?.id}
                          mode={energyMode}
                          showNumbers={showNumbers}
                          job={job.data}
                          onAreaChange={(area) =>
                            navigate({
                              region: area.regionId,
                              area: area.id,
                              compare: "",
                            })
                          }
                        />
                        {job.error && (
                          <p role="alert">
                            Abrufstatus: {errorMessage(job.error)}
                          </p>
                        )}
                      </>
                    ) : historyMode ? (
                      <>
                        <AtlasHistoryPanel
                          key={`${topic.id}:${geography.id}`}
                          geography={geography}
                          compareId={comparisonArea?.id}
                          mode={historyMode}
                          showNumbers={showNumbers}
                          job={job.data}
                        />
                        {job.error && (
                          <p role="alert">
                            Abrufstatus: {errorMessage(job.error)}
                          </p>
                        )}
                      </>
                    ) : demographyMode ? (
                      <>
                        <AtlasDemographyPanel
                          key={`${topic.id}:${geography.id}`}
                          mode={demographyMode}
                          geography={geography}
                          compareId={comparisonArea?.id}
                          showNumbers={showNumbers}
                          job={job.data}
                        />
                        {job.error && (
                          <p role="alert">
                            Abrufstatus: {errorMessage(job.error)}
                          </p>
                        )}
                      </>
                    ) : relativeMode ? (
                      <AtlasRelativePanel
                        key={`${topic.id}:${geography.id}`}
                        geography={geography}
                        compareId={comparisonArea?.id}
                        showNumbers={showNumbers}
                        job={job.data}
                        proxyId={params.get("proxy") ?? undefined}
                        onProxyChange={(proxy) => navigate({ proxy })}
                        onAreaChange={(area) =>
                          navigate({
                            region: area.regionId,
                            area: area.id,
                            compare: "",
                          })
                        }
                      />
                    ) : marketTopic ? (
                      <>
                        <AtlasMarketPanel
                          key={`${topic.id}:${geography.id}`}
                          topicId={topic.id}
                          geography={geography}
                          compareId={comparisonArea?.id}
                          showNumbers={showNumbers}
                          job={job.data}
                          proxyId={params.get("proxy") ?? undefined}
                          onProxyChange={(proxy) => navigate({ proxy })}
                          onAreaChange={(area) =>
                            navigate({
                              region: area.regionId,
                              area: area.id,
                              compare: "",
                            })
                          }
                        />
                        {job.error && (
                          <p role="alert">
                            Abrufstatus: {errorMessage(job.error)}
                          </p>
                        )}
                      </>
                    ) : !definition && valuationTarget ? (
                      <p className="atlas-comparison-note">
                        {valuationTopicSelection(topic.id)?.scopeNote ??
                          "Die veröffentlichten Unternehmenskennzahlen öffnen sich in den Bewertungsbildern. Dort bleiben Kennzahl, Vorgeschichte und Quellengebiet sichtbar."}
                      </p>
                    ) : !definition ? (
                      <div className="atlas-empty">
                        <Globe size={32} aria-hidden="true" />
                        <h3>Noch keine passende Zeitreihe hinterlegt</h3>
                        <p>
                          {group.id === "cycle_hypotheses"
                            ? "Langfristige Zyklusthesen benötigen jeweils eine belegte Datenbasis, einen Geltungsbereich und eine eigene Einordnung."
                            : "Dieses Thema ist im Atlas eingeordnet. Eine Länderansicht wird verfügbar, sobald eine geeignete Quelle zugeordnet ist."}
                        </p>
                        <details className="atlas-details">
                          <summary>Vorgesehene Quellen</summary>
                          {group.sourceIds.map((id) => {
                            const source = catalog.sources.find(
                              (source) => source.id === id,
                            );
                            return (
                              source && (
                                <p key={id}>
                                  <strong>{source.label}</strong>
                                  <br />
                                  {source.limits}
                                </p>
                              )
                            );
                          })}
                        </details>
                      </div>
                    ) : (
                      <>
                        {definitions.length > 1 && (
                          <label className="atlas-statistic-picker">
                            Statistik auswählen
                            <select
                              className="input"
                              value={definition.id}
                              onChange={(event) =>
                                navigate({ series: event.target.value })
                              }
                            >
                              {definitions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {definition.explanation && (
                          <p className="atlas-statistic-meaning">
                            {definition.explanation}
                          </p>
                        )}
                        {definition.scopeNote && (
                          <details className="atlas-details atlas-statistic-scope">
                            <summary>Was dieses Bild bedeutet</summary>
                            <p>{definition.scopeNote}</p>
                          </details>
                        )}
                        {query.isPending && (
                          <div className="atlas-notice" role="status">
                            Lokaler Datenstand wird geladen …
                          </div>
                        )}
                        {query.error && (
                          <div className="atlas-notice" role="alert">
                            {errorMessage(query.error)}{" "}
                            <Button
                              size="sm"
                              onClick={() => void query.refetch()}
                            >
                              Erneut prüfen
                            </Button>
                          </div>
                        )}
                        {query.data?.status === "desktop_required" && (
                          <div className="atlas-empty">
                            <Globe size={32} aria-hidden="true" />
                            <h3>Atlas-Daten in der Desktop-App laden</h3>
                            <p>
                              Hier kannst du Länder und Themen erkunden. Die
                              Desktop-App lädt die öffentlichen Zeitreihen und
                              bewahrt sie für die Offline-Nutzung auf.
                            </p>
                          </div>
                        )}
                        {query.data?.status === "not_downloaded" && (
                          <div className="atlas-empty">
                            <Globe size={32} aria-hidden="true" />
                            <h3>
                              Diese Statistik ist noch nicht lokal gespeichert
                            </h3>
                            <p>
                              Ein Abruf lädt die verfügbaren Länder gemeinsam.
                              Anschließend kannst du zwischen ihnen wechseln und
                              sie vergleichen.
                            </p>
                          </div>
                        )}
                        {query.data?.status === "unsupported_area" && (
                          <div className="atlas-empty">
                            <h3>Gebiet in dieser Quelle nicht enthalten</h3>
                            <p>
                              {atlasSeriesSource(definition)} führt für diese
                              Statistik keine passende Gebietszuordnung. Ein
                              anderer Länderwert wird dafür nicht eingesetzt.
                            </p>
                          </div>
                        )}
                        {query.data?.status === "empty" && (
                          <div className="atlas-empty">
                            <h3>Keine Werte für dieses Gebiet</h3>
                            <p>
                              Die Quelle wurde geprüft, enthält hier aber keine
                              nutzbaren Beobachtungen.
                            </p>
                          </div>
                        )}
                        {topic.id === "demography:age_structure" &&
                          ["unsupported_area", "empty"].includes(
                            query.data?.status ?? "",
                          ) &&
                          demographyAlternative.data?.status ===
                            "available" && (
                            <div className="atlas-notice">
                              <p>
                                Für {geography.label} ist ein UN-Altersprofil
                                lokal vorhanden. Daraus ist derselbe
                                Altersanteil als ausdrücklich benannte
                                UN-Perspektive verfügbar.
                              </p>
                              <Button
                                onClick={() =>
                                  navigate({
                                    perspective: "un-age65",
                                    demoProjection: "0",
                                  })
                                }
                              >
                                Anteil ab 65 Jahren aus UN-Daten anzeigen
                              </Button>
                            </div>
                          )}
                        {rows.length > 0 && (
                          <>
                            <div className="atlas-reading">
                              <strong>
                                {displayedQuality?.trend ??
                                  "Kein gemeinsamer Vergleichszeitraum"}
                              </strong>
                              <span>
                                {quality?.extent &&
                                  `Daten bis ${quality.extent.last}`}
                                {quality?.old ? " · älterer Datenstand" : ""}
                                {quality?.gaps.length
                                  ? " · mit Datenlücken"
                                  : ""}
                              </span>
                            </div>
                            <AtlasSeriesChart
                              series={rows}
                              showNumbers={showNumbers}
                            />
                            {comparisonArea &&
                              atlasSeriesComparable(definition) &&
                              comparison.isPending && (
                                <p role="status">Vergleich wird geladen …</p>
                              )}
                            {comparisonArea && comparison.error && (
                              <div className="atlas-notice" role="alert">
                                Vergleich: {errorMessage(comparison.error)}
                              </div>
                            )}
                            {comparisonArea &&
                              comparison.data &&
                              comparison.data.status !== "available" && (
                                <div className="atlas-notice">
                                  Für {comparisonArea.label} liegt in dieser
                                  Statistik kein nutzbarer lokaler Datenstand
                                  vor.
                                </div>
                              )}
                            {comparisonArea && comparisonQuality?.extent && (
                              <p className="atlas-comparison-note">
                                {comparisonArea.label}: Daten bis{" "}
                                {comparisonQuality.extent.last}
                                {comparisonQuality.old
                                  ? " · älterer Datenstand"
                                  : ""}
                                {comparisonQuality.gaps.length
                                  ? " · mit Datenlücken"
                                  : ""}
                                . Das Bild nutzt den gemeinsamen Zeitraum.
                              </p>
                            )}
                            <p className="atlas-explanation">
                              Das Bild zeigt die Entwicklung dieser Statistik.
                              Steigend und fallend beschreiben ihre Richtung;
                              daraus entsteht keine automatische Markt- oder
                              Anlagebewertung.
                            </p>
                          </>
                        )}
                        {isTauri() && (
                          <div className="atlas-download">
                            <Button
                              onClick={() => sync.mutate(definition.id)}
                              disabled={busy}
                            >
                              <RefreshCw
                                size={15}
                                className={
                                  busy ? "atlas-loading-icon" : undefined
                                }
                              />
                              {busy
                                ? "Abruf läuft …"
                                : query.data?.provenance
                                  ? "Länderdaten aktualisieren"
                                  : "Für alle Länder laden"}
                            </Button>
                            <span>
                              {atlasSeriesSource(definition)} ·{" "}
                              {query.data?.provenance
                                ? "Quellenpaket lokal gespeichert"
                                : "öffentliche Datenquelle"}
                            </span>
                          </div>
                        )}
                        {((currentJob &&
                          (currentJob.status !== "complete" ||
                            query.data?.status === "available")) ||
                          job.data?.status === "running") && (
                          <p
                            className="atlas-job"
                            role={
                              currentJob?.status === "failed"
                                ? "alert"
                                : "status"
                            }
                          >
                            {currentJob?.message ??
                              "Eine andere Atlas-Statistik wird gerade geladen."}
                            {showNumbers &&
                            currentJob?.status === "running" &&
                            currentJob.pages > 0
                              ? ` (${currentJob.page}/${currentJob.pages})`
                              : ""}
                          </p>
                        )}
                        {sync.error && (
                          <div className="atlas-notice" role="alert">
                            {errorMessage(sync.error)}
                          </div>
                        )}
                        {job.error && (
                          <div className="atlas-notice" role="alert">
                            Abrufstatus: {errorMessage(job.error)}
                          </div>
                        )}
                        {comparisonArea &&
                          !atlasSeriesComparable(definition) && (
                            <p className="atlas-notice">
                              Diese Statistik verwendet nationale Definitionen.
                              Sie wird für {geography.label} allein angezeigt;
                              ein direkter Vergleich mit {comparisonArea.label}{" "}
                              wäre nicht gleichartig.
                            </p>
                          )}
                        <AtlasSeriesSourceNotes
                          rows={rows}
                          showNumbers={showNumbers}
                        />
                        {query.data && <SourceDetails data={query.data} />}
                      </>
                    )}
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AtlasDisplayContext.Provider>
  );
}
import { AtlasEducationPanel } from "./atlas-education-panel";
import { atlasEducationDataset, educationMetrics } from "./atlas-education";
