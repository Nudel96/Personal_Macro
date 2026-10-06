export type WeatherPhase =
  "growth" | "flowering" | "ripening" | "harvest" | "dormant" | "mixed";

export interface WeatherPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface WeatherRegion {
  id: string;
  label: string;
  country: string;
  iso3: string;
  points: WeatherPoint[];
}

export interface WeatherAsset {
  id: string;
  label: string;
  group: string;
  marketContext: string;
  mechanism: string;
  sourceIds: string[];
  thresholds: {
    heatC: number;
    frostC: number;
    heavyRainMm: number;
    wetWeekMm: number;
    waterGapMm: number;
  };
  regions: { regionId: string; phases: WeatherPhase[] }[];
}

export interface WeatherCatalog {
  version: string;
  reviewedOn: string;
  sources: { id: string; label: string; url: string }[];
  assets: WeatherAsset[];
  regions: WeatherRegion[];
}

export interface WeatherEnvelope {
  assetId: string;
  fetchedAt: string;
  pointIds: string[];
  responses: unknown[];
}

export interface WeatherDay {
  date: string;
  weatherCode: number | null;
  rainMm: number | null;
  minC: number | null;
  maxC: number | null;
  et0Mm: number | null;
  gustKmh: number | null;
  rainHours: number | null;
  rainProbability: number | null;
}

export interface WeatherPointSeries {
  pointId: string;
  latitude: number;
  longitude: number;
  currentAt: string;
  currentC: number | null;
  days: WeatherDay[];
}

export interface WeatherSnapshot {
  assetId: string;
  fetchedAt: string;
  today: string;
  points: WeatherPointSeries[];
}

export type WeatherEffect =
  "supportive" | "mixed" | "stress" | "watch" | "context" | "unknown";
export interface WeatherFinding {
  kind: "support" | "stress" | "watch";
  title: string;
  explanation: string;
}
export interface WeatherAssessment {
  effect: WeatherEffect;
  findings: WeatherFinding[];
  coverage: number;
  expected: number;
  rainMm: number | null;
  balanceMm: number | null;
  minC: number | null;
  maxC: number | null;
}
