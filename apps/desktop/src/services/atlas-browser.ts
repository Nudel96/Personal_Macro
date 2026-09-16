import { atlasCatalog } from "../features/world-atlas/atlas-catalog";
import {
  atlasPublicCatalog,
  type AtlasPublicResponse,
} from "../features/world-atlas/atlas-public";

export function browserAtlasPublicSource(
  sourceId: string,
  geographyId: string,
): AtlasPublicResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  const source = atlasPublicCatalog.sources.find((s) => s.id === sourceId);
  if (!geography || !source)
    throw new Error("Unbekanntes Atlas-Gebiet oder unbekannte Quelle.");
  return {
    geography,
    source,
    profiles: [],
    metrics: atlasPublicCatalog.metrics.filter((m) => m.sourceId === sourceId),
    status: source.areas.some((a) => a.geographyId === geographyId)
      ? "desktop_required"
      : "unsupported_area",
    provenance: null,
  };
}

export function browserAtlasFindex(
  geographyId: string,
): import("../features/world-atlas/atlas-findex").AtlasFindexResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

export function browserAtlasCommodities(): import("../features/world-atlas/atlas-commodities").AtlasCommodityResponse {
  return { status: "desktop_required", points: [], provenance: null };
}
export function browserAtlasLabor(
  geographyId: string,
): import("../features/world-atlas/atlas-labor").AtlasLaborResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasInnovation(
  geographyId: string,
): import("../features/world-atlas/atlas-innovation").AtlasInnovationResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasHealth(
  geographyId: string,
): import("../features/world-atlas/atlas-health").AtlasHealthResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasDebt(
  geographyId: string,
): import("../features/world-atlas/atlas-debt").AtlasDebtResponse {
  const geography = atlasCatalog.geographies.find((g) => g.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
import { atlasValuationCatalog } from "../features/world-atlas/atlas-valuation";
import type { AtlasValuationResponse } from "../features/world-atlas/atlas-valuation-types";
import { atlasMarketProxies } from "../features/world-atlas/atlas-markets";
import type { AtlasMarketResponse } from "../features/world-atlas/atlas-market-types";
import type { AtlasDemographyResponse } from "../features/world-atlas/atlas-demography-types";
import type { AtlasHistoryResponse } from "../features/world-atlas/atlas-history";
import type { AtlasEnergyResponse } from "../features/world-atlas/atlas-energy";
import type {
  AtlasSeriesInput,
  AtlasSeriesResponse,
} from "../features/world-atlas/atlas-types";

export function browserAtlasValuation(
  datasetId: string,
): AtlasValuationResponse {
  if (!atlasValuationCatalog.datasets.some((d) => d.id === datasetId))
    throw new Error("Unbekannte Bewertungsgrundlage.");
  return { datasetId, status: "desktop_required", data: null };
}

export function browserAtlasEnergy(geographyId: string): AtlasEnergyResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

export function browserAtlasHistory(geographyId: string): AtlasHistoryResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

export function browserAtlasDemography(
  geographyId: string,
): AtlasDemographyResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

export function browserAtlasMarket(proxyId: string): AtlasMarketResponse {
  const proxy = atlasMarketProxies.find((proxy) => proxy.id === proxyId);
  if (!proxy) throw new Error("Unbekannte Atlas-Marktreihe.");
  return {
    proxy,
    status: "desktop_required",
    provenance: null,
    analysis: {
      recipe: "log-ols60-trailing12-rank120-min60-v1",
      points: [],
      state: "insufficient_history",
      historyMonths: 0,
      waveMonths: 0,
      missingMonths: 0,
      stale: false,
      lastObservation: null,
      parameterSensitive: null,
    },
  };
}

export function browserAtlasSeries(
  input: AtlasSeriesInput,
): AtlasSeriesResponse {
  const series = atlasCatalog.series.find((item) => item.id === input.seriesId);
  const geography = atlasCatalog.geographies.find(
    (item) => item.id === input.geographyId,
  );
  if (!series || !geography) throw new Error("Unbekannte Atlas-Auswahl.");
  return {
    series,
    geography,
    points: [],
    provenance: null,
    status: "desktop_required",
  };
}
import type { AtlasCapacityResponse } from "../features/world-atlas/atlas-capacity";

export function browserAtlasCapacity(
  geographyId: string,
): AtlasCapacityResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

import type { AtlasCreditResponse } from "../features/world-atlas/atlas-credit";

export function browserAtlasFiscal(
  geographyId: string,
): import("../features/world-atlas/atlas-fiscal").AtlasFiscalResponse {
  const geography = atlasCatalog.geographies.find((a) => a.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasHouseholds(
  geographyId: string,
): import("../features/world-atlas/atlas-households").AtlasHouseholdsResponse {
  const geography = atlasCatalog.geographies.find((a) => a.id === geographyId);
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasMacrohistory(
  geographyId: string,
): import("../features/world-atlas/atlas-macrohistory").AtlasMacrohistoryResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

export function browserAtlasCredit(geographyId: string): AtlasCreditResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

import type { AtlasPropertyResponse } from "../features/world-atlas/atlas-property";

export function browserAtlasProperty(
  geographyId: string,
): AtlasPropertyResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}

import type { AtlasHousingRatiosResponse } from "../features/world-atlas/atlas-housing-ratios";

export function browserAtlasHousingRatios(
  geographyId: string,
): AtlasHousingRatiosResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
import type { AtlasEducationResponse } from "../features/world-atlas/atlas-education";
export function browserAtlasAgriculture(
  geographyId: string,
): import("../features/world-atlas/atlas-agriculture").AtlasAgricultureResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
export function browserAtlasEducation(
  geographyId: string,
): AtlasEducationResponse {
  const geography = atlasCatalog.geographies.find(
    (area) => area.id === geographyId,
  );
  if (!geography) throw new Error("Unbekanntes Atlas-Gebiet.");
  return {
    geography,
    status: "desktop_required",
    profile: null,
    provenance: null,
  };
}
