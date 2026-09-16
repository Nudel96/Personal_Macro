export interface AtlasGeography {
  id: string;
  label: string;
  /** Empty for source aggregates or distinct historical/source areas without an ISO code. */
  iso3: string;
  regionId: string;
  kind: string;
}

export interface AtlasSeriesDefinition {
  id: string;
  topicId: string;
  sourceId: string;
  providerCode: string;
  label: string;
  providerLabel: string;
  unit: string;
  observationKind: string;
  explanation?: string;
  scopeNote?: string;
  /** Curated historical window; excludes later unreviewed model years. */
  throughYear?: number | null;
}

export interface AtlasCatalog {
  version: string;
  regions: { id: string; label: string }[];
  geographies: AtlasGeography[];
  domains: { id: string; label: string; icon: string }[];
  groups: {
    id: string;
    domainId: string;
    label: string;
    sourceIds: string[];
  }[];
  topics: { id: string; groupId: string; label: string }[];
  sources: { id: string; label: string; url: string | null; limits: string }[];
  series: AtlasSeriesDefinition[];
}

export interface AtlasPoint {
  year: number;
  value: number | null;
  sourceFlag: string;
}

export interface AtlasProvenance {
  retrievedAt: string;
  providerUpdatedAt: string;
  sourceOrganization: string;
  definition: string;
  metadataUrl: string;
  pages: { url: string; sha256: string }[];
  providerAreas: string[];
}

export interface AtlasSeriesInput {
  seriesId: string;
  geographyId: string;
}

export interface AtlasSeriesResponse {
  series: AtlasSeriesDefinition;
  geography: AtlasGeography;
  status:
    | "available"
    | "empty"
    | "not_downloaded"
    | "unsupported_area"
    | "desktop_required";
  points: AtlasPoint[];
  provenance: AtlasProvenance | null;
}

export interface AtlasSyncJob {
  id: string;
  seriesId: string;
  status: "running" | "complete" | "failed" | "interrupted";
  page: number;
  pages: number;
  observations: number;
  message: string;
  startedAt: string;
  finishedAt: string | null;
}
