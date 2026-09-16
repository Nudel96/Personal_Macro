export interface AtlasMarketProxy {
  id: string;
  symbol: string;
  label: string;
  topicIds: string[];
  geographyId: string;
  scope: string;
  currency: string;
  issuerUrl: string;
  inception: string;
  limits: string;
  breaks: string[];
}

export interface AtlasWavePoint {
  month: string;
  adjustedClose: number | null;
  wave: number | null;
  percentile: number | null;
}

export interface AtlasMarketResponse {
  proxy: AtlasMarketProxy;
  status: "available" | "not_downloaded" | "desktop_required";
  provenance: {
    retrievedAt: string;
    sourceUrl: string;
    sha256: string;
    sourceFirstDate: string;
    sourceLastDate: string;
    adjustment: string;
  } | null;
  analysis: {
    recipe: string;
    points: AtlasWavePoint[];
    state:
      | "above_trend"
      | "below_trend"
      | "at_trend"
      | "stale"
      | "insufficient_history";
    historyMonths: number;
    waveMonths: number;
    missingMonths: number;
    stale: boolean;
    lastObservation: string | null;
    parameterSensitive: boolean | null;
  };
}
