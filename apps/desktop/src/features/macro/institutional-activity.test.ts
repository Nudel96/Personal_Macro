import { describe, expect, it } from "vitest";
import type { CotContractView, CotDashboard } from "../../types/domain";
import {
  buildInstitutionalCurrencyActivity,
  buildInstitutionalPairActivity,
} from "./institutional-activity";

type Signal = -1 | 0 | 1;

interface SignalFixture {
  latest: Signal | null;
  pipeline: Signal | null;
}

function biasLabel(signal: Signal | null) {
  if (signal === 1) return "Bestätigt Bullish";
  if (signal === -1) return "Bestätigt Bearish";
  if (signal === 0) return "Gemischt / Neutral";
  return "Nicht verfügbar";
}

function contract(
  currency: string,
  { latest, pipeline }: SignalFixture,
): CotContractView {
  const longChange = latest === 1 ? 30 : latest === -1 ? 10 : 20;
  const shortChange = latest === 1 ? 10 : latest === -1 ? 30 : 20;
  return {
    symbol: currency,
    displayName: `${currency} COT`,
    assetClass: "Währung",
    reportFamily: "tff",
    traderGroup: "Leveraged Funds",
    currency,
    reportDate: "2026-08-04",
    longPositions: 600,
    shortPositions: 400,
    longChange,
    shortChange,
    openInterest: 1_000,
    netPositions: 200,
    netChange: longChange - shortChange,
    netPositionPctOi: 0.2,
    netChangePctOi: (longChange - shortChange) / 1_000,
    positionPercentile: 0.8,
    changePercentile: 0.75,
    positionSignal: 1,
    changeSignal: 1,
    persistenceSignal: 1,
    latestChangeSignal: latest,
    assessment: {
      scoringVersion: "cot-v3",
      status: pipeline === null ? "stale" : "available",
      quality: pipeline === null ? "unavailable" : "high",
      biasSignal: pipeline,
      biasLabel: biasLabel(pipeline),
      crowdingStatus: "Kein Extrem",
      reportDate: "2026-08-04",
      reasonCodes: pipeline === null ? ["stale_report"] : [],
      why: [],
      components: [],
    },
  };
}

function cotDashboard(fixtures: Record<string, SignalFixture>): CotDashboard {
  return {
    sourceUrl: "https://publicreporting.cftc.gov/stories/s/r4w3-av2u",
    lastSyncedAt: "2026-08-08T18:00:00Z",
    contracts: Object.entries(fixtures).map(([currency, fixture]) =>
      contract(currency, fixture),
    ),
    currencies: [],
    pairs: [],
  };
}

describe("buildInstitutionalCurrencyActivity", () => {
  it.each([
    [1, 1, 2, "Sehr Bullish"],
    [1, 0, 1, "Bullish"],
    [1, -1, 0, "Neutral"],
    [-1, 0, -1, "Bearish"],
    [-1, -1, -2, "Sehr Bearish"],
  ] as const)(
    "aggregates latest %s and pipeline %s into %s",
    (latest, pipeline, score, expectedLabel) => {
      const result = buildInstitutionalCurrencyActivity(
        "USD",
        cotDashboard({ USD: { latest, pipeline } }),
      );

      expect(result.score).toBe(score);
      expect(result.biasLabel).toBe(expectedLabel);
      expect(result.coverage).toBe(2);
    },
  );

  it("keeps one available signal and reports reduced coverage", () => {
    const result = buildInstitutionalCurrencyActivity(
      "USD",
      cotDashboard({ USD: { latest: 1, pipeline: null } }),
    );

    expect(result).toMatchObject({
      score: 1,
      coverage: 1,
      biasLabel: "Bullish",
    });
  });

  it("does not turn a missing CNY contract into neutral", () => {
    const result = buildInstitutionalCurrencyActivity("CNY", cotDashboard({}));

    expect(result).toMatchObject({
      score: null,
      coverage: 0,
      biasLabel: "Nicht verfügbar",
      contract: null,
    });
  });
});

describe("buildInstitutionalPairActivity", () => {
  it("computes +2 when the base latest flow is bullish and quote is bearish", () => {
    const result = buildInstitutionalPairActivity(
      "USD",
      "CAD",
      cotDashboard({
        USD: { latest: 1, pipeline: 0 },
        CAD: { latest: -1, pipeline: 0 },
      }),
    );

    expect(result.latestChangeScore).toBe(2);
    expect(result.pipelineScore).toBe(0);
    expect(result.score).toBe(2);
    expect(result.coverage).toBe(2);
  });

  it("cancels equal signals", () => {
    const result = buildInstitutionalPairActivity(
      "USD",
      "EUR",
      cotDashboard({
        USD: { latest: 1, pipeline: 0 },
        EUR: { latest: 1, pipeline: 0 },
      }),
    );

    expect(result.latestChangeScore).toBe(0);
    expect(result.pipelineScore).toBe(0);
    expect(result.score).toBe(0);
  });

  it("is antisymmetric", () => {
    const source = cotDashboard({
      USD: { latest: 1, pipeline: 1 },
      EUR: { latest: 1, pipeline: -1 },
    });

    const direct = buildInstitutionalPairActivity("USD", "EUR", source);
    const reverse = buildInstitutionalPairActivity("EUR", "USD", source);

    expect(direct.latestChangeScore).toBe(0);
    expect(direct.pipelineScore).toBe(2);
    expect(direct.score).toBe(-reverse.score!);
  });

  it("marks components unavailable when either side is missing", () => {
    const result = buildInstitutionalPairActivity(
      "USD",
      "CNY",
      cotDashboard({ USD: { latest: 1, pipeline: 1 } }),
    );

    expect(result).toMatchObject({
      latestChangeScore: null,
      pipelineScore: null,
      score: null,
      coverage: 0,
    });
  });
});
