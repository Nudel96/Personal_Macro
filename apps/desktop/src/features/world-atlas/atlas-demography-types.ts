import type { AtlasGeography } from "./atlas-types";

export interface AtlasAgePopulation {
  ageStart: number;
  male: number | null;
  female: number | null;
  total: number | null;
}
export interface AtlasDemographyYear {
  year: number;
  kind: "estimate" | "projection";
  ages: AtlasAgePopulation[];
}
export interface AtlasDemographyProfile {
  geographyId: string;
  providerId: string;
  providerLabel: string;
  notes: string[];
  years: AtlasDemographyYear[];
}
export interface AtlasDemographyResponse {
  geography: AtlasGeography;
  status:
    "available" | "not_downloaded" | "unsupported_area" | "desktop_required";
  profile: AtlasDemographyProfile | null;
  provenance: {
    revision: string;
    retrievedAt: string;
    estimateEnd: number;
    projectionStart: number;
    pages: { url: string; sha256: string }[];
    areaCount: number;
    sourceRowCount: number;
  } | null;
}
