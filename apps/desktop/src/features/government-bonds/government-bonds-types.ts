export interface BondCountry {
  id: string;
  name: string;
  region: string;
}

export interface BondInstrument {
  symbol: string;
  countryId: string;
  name: string;
  maturityMonths: number;
  currency: string | null;
  providerCountry: string | null;
}

export interface BondObservation {
  date: string;
  yieldPct: string | null;
}

export interface BondQuote extends BondInstrument {
  active: boolean;
  date: string | null;
  yieldPct: string | null;
  previousDate: string | null;
  changeBps: string | null;
  fetchedAt: string | null;
  lastError: string | null;
  stale: boolean;
}

export interface BondSyncJob {
  id: string;
  status:
    | "running"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled"
    | "interrupted";
  countryId: string | null;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  currentSymbol: string | null;
  message: string;
}

export interface GovernmentBondsDashboard {
  asOf: string;
  configured: boolean;
  desktop: boolean;
  catalogReviewedAt: string;
  catalogCheckedAt: string | null;
  sourceUrl: string;
  methodologyUrl: string;
  countries: BondCountry[];
  instruments: BondQuote[];
  excluded: { symbol: string; reason: string }[];
  job: BondSyncJob | null;
}

export interface BondDetailInput {
  countryId: string;
  comparisonId: string | null;
  maturityMonths: number;
}

export interface BondCurvePoint {
  symbol: string;
  maturityMonths: number;
  currency: string | null;
  yieldPct: string | null;
}

export interface BondCountryDetail {
  countryId: string;
  instrument: BondInstrument | null;
  history: BondObservation[];
  curve: BondCurvePoint[];
  curveSpreadBps: string | null;
}

export interface GovernmentBondDetail {
  curveDate: string | null;
  primary: BondCountryDetail;
  comparison: BondCountryDetail | null;
  spreadDate: string | null;
  spreadBps: string | null;
}
