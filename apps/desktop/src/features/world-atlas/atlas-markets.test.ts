import { describe, expect, it } from "vitest";
import { browserAtlasMarket } from "../../services/atlas-browser";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasMarketComparison,
  atlasMarketProxies,
  atlasMarketsFor,
} from "./atlas-markets";
import type { AtlasMarketResponse } from "./atlas-market-types";

export function marketFixture(id = "eodhd:SPY.US"): AtlasMarketResponse {
  const browser = browserAtlasMarket(id);
  return {
    ...browser,
    status: "available",
    provenance: {
      retrievedAt: "2026-09-08T00:00:00Z",
      sourceUrl: `https://eodhd.com/api/eod/${browser.proxy.symbol}`,
      sha256: "test",
      sourceFirstDate: "2000-01-31",
      sourceLastDate: "2026-08-31",
      adjustment: "Testfixture",
    },
    analysis: {
      ...browser.analysis,
      state: "above_trend",
      historyMonths: 320,
      waveMonths: 250,
      lastObservation: "2026-08",
      points: [
        { month: "2025-01", adjustedClose: 100, wave: -5, percentile: 0.1 },
        { month: "2025-02", adjustedClose: null, wave: null, percentile: null },
        { month: "2025-03", adjustedClose: 120, wave: 8, percentile: 0.8 },
      ],
    },
  };
}

describe("Atlas-Marktreihen", () => {
  it("bindet nur explizite Fonds und gibt Welt-Themen nicht als Länderreihen aus", () => {
    expect(new Set(atlasMarketProxies.map((proxy) => proxy.id)).size).toBe(
      atlasMarketProxies.length,
    );
    for (const proxy of atlasMarketProxies) {
      expect(proxy.symbol).toMatch(/^[A-Z]+\.US$/);
      expect(
        atlasCatalog.geographies.some((area) => area.id === proxy.geographyId),
      ).toBe(true);
      expect(
        proxy.topicIds.every((id) =>
          atlasCatalog.topics.some((topic) => topic.id === id),
        ),
      ).toBe(true);
      expect(proxy.issuerUrl).toMatch(/^https:\/\//);
    }
    expect(atlasMarketsFor("electricity:solar", "m49:710")).toHaveLength(0);
    expect(atlasMarketsFor("electricity:solar", "world")[0].symbol).toBe(
      "TAN.US",
    );
    expect(
      atlasMarketsFor("market_context:country_equities", "m49:356")[0].symbol,
    ).toBe("INDA.US");
    expect(browserAtlasMarket("eodhd:SPY.US").analysis.points).toHaveLength(0);
    expect(() => browserAtlasMarket("https://example.invalid")).toThrow();
  });

  it("vergleicht Wellen nur im gemeinsamen Fenster und lässt fehlende Monate offen", () => {
    const first = marketFixture();
    const second = marketFixture("eodhd:EWG.US");
    second.analysis.points = second.analysis.points.slice(1);
    const comparison = atlasMarketComparison([first, second], 20)!;
    expect(comparison.months).toEqual(["2025-03"]);
    expect(atlasMarketComparison([first], 20)!.rows[0].values).toEqual([
      -5,
      null,
      8,
    ]);
    second.proxy = { ...second.proxy, currency: "EUR" };
    expect(atlasMarketComparison([first, second], 20)).toBeNull();
    second.proxy = { ...second.proxy, currency: "USD" };
    second.analysis.recipe = "different";
    expect(atlasMarketComparison([first, second], 20)).toBeNull();
  });
});
