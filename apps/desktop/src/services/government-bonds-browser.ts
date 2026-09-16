import catalog from "../features/government-bonds/data/catalog.json";
import type {
  BondCountryDetail,
  BondDetailInput,
  GovernmentBondDetail,
  GovernmentBondsDashboard,
} from "../features/government-bonds/government-bonds-types";

// The browser exposes the same reviewed country directory without inventing market values.
export function browserGovernmentBonds(): Promise<GovernmentBondsDashboard> {
  return Promise.resolve({
    asOf: new Date().toISOString(),
    configured: false,
    desktop: false,
    catalogReviewedAt: catalog.reviewedAt,
    catalogCheckedAt: null,
    sourceUrl: catalog.sourceUrl,
    methodologyUrl: catalog.methodologyUrl,
    countries: catalog.countries,
    excluded: catalog.excluded,
    job: null,
    instruments: catalog.instruments.map((instrument) => ({
      ...instrument,
      active: true,
      date: null,
      yieldPct: null,
      previousDate: null,
      changeBps: null,
      fetchedAt: null,
      lastError: null,
      stale: false,
    })),
  });
}

export function browserGovernmentBondDetail(
  input: BondDetailInput,
): Promise<GovernmentBondDetail> {
  const detail = (countryId: string): BondCountryDetail => ({
    countryId,
    instrument:
      catalog.instruments.find(
        (i) =>
          i.countryId === countryId &&
          i.maturityMonths === input.maturityMonths,
      ) ?? null,
    history: [],
    curveSpreadBps: null,
    curve: catalog.instruments
      .filter((i) => i.countryId === countryId)
      .map((i) => ({
        symbol: i.symbol,
        maturityMonths: i.maturityMonths,
        currency: i.currency,
        yieldPct: null,
      }))
      .sort((a, b) => a.maturityMonths - b.maturityMonths),
  });
  return Promise.resolve({
    curveDate: null,
    primary: detail(input.countryId),
    comparison: input.comparisonId ? detail(input.comparisonId) : null,
    spreadDate: null,
    spreadBps: null,
  });
}
