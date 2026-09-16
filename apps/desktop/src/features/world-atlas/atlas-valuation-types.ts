export interface ValuationPoint {
  year: number;
  value: number | null;
  status:
    | "available"
    | "not_meaningful"
    | "no_firms"
    | "source_error"
    | "source_missing";
  firmCount: number;
  methodEpoch: string;
  sourceFile: string;
}

export interface ValuationPosition {
  status:
    | "available"
    | "insufficient_history"
    | "latest_not_meaningful"
    | "small_sample"
    | "no_reference_variation"
    | "not_historical_valuation";
  percentile: number | null;
  previousMedian: number | null;
  referenceFirstYear: number | null;
  referenceLastYear: number | null;
  referenceCount: number;
  compositionChanged: boolean;
}

export interface ValuationSeries {
  metricId: string;
  points: ValuationPoint[];
  historicalPosition: ValuationPosition;
}

export interface ValuationSubject {
  id: string;
  label: string;
  providerLabel: string;
  geographyId: string | null;
  active: boolean;
  series: ValuationSeries[];
}

export interface ValuationDownload {
  datasetId: string;
  subjects: ValuationSubject[];
  provenance: {
    catalogVersion: string;
    retrievedAt: string;
    excludedSubjects: string[];
    files: {
      url: string;
      fileName: string;
      sha256: string;
      publicationYear: number;
      workbookDate: string | null;
      rowCount: number;
    }[];
  };
}

export interface AtlasValuationResponse {
  datasetId: string;
  status:
    "available" | "previous_catalog" | "not_downloaded" | "desktop_required";
  data: ValuationDownload | null;
}
