import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CotContractView, CotDashboard } from "../../types/domain";
import { CotOverview } from "./cot-components";

function contract(
  symbol: string,
  weeklyLongShareChange: number,
): CotContractView {
  return {
    symbol,
    displayName: symbol,
    assetClass: "Test",
    reportFamily: "legacy",
    traderGroup: "Non-Commercial",
    reportDate: "2026-08-04",
    longPositions: 60,
    shortPositions: 40,
    longChange: 10,
    shortChange: -10,
    openInterest: 100,
    openInterestChange: -5,
    netPositions: 20,
    netChange: 20,
    netPositionPctOi: 0.2,
    netChangePctOi: 0.2,
    longShare: 0.6,
    shortShare: 0.4,
    weeklyLongShareChange,
    positionSignal: 1,
    changeSignal: weeklyLongShareChange > 0 ? 1 : -1,
    persistenceSignal: 1,
    latestChangeSignal: weeklyLongShareChange > 0 ? 1 : -1,
    assessment: {
      scoringVersion: "cot-v4-legacy-noncommercial",
      status: "available",
      quality: "high",
      biasSignal: 1,
      biasLabel: "Bestätigt Bullish",
      crowdingStatus: "Kein Extrem",
      reportDate: "2026-08-04",
      reasonCodes: [],
      why: [],
      components: [],
    },
  };
}

describe("CotOverview", () => {
  it("sortiert und beschriftet den Legacy-Non-Commercial-Long-Anteil", () => {
    const dashboard: CotDashboard = {
      sourceUrl:
        "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
      lastSyncedAt: "2026-08-07T20:00:00Z",
      contracts: [
        contract("ETH", -0.00004),
        contract("BTC", -0.0118),
        contract("USD", 0.0736),
        contract("JPY", 0.1564),
      ],
      currencies: [],
      pairs: [],
    };

    render(<CotOverview dashboard={dashboard} />);

    expect(
      screen.getByText("Legacy Futures Only · Non-Commercial"),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", {
        name: "Long-Anteil Δ zur Vorwoche",
      }),
    ).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("JPY")).toBeTruthy();
    expect(within(rows[1]).getByText("+15,64 PP")).toBeTruthy();
    expect(within(rows[2]).getByText("USD")).toBeTruthy();
    expect(within(rows[2]).getByText("+7,36 PP")).toBeTruthy();
    expect(within(rows[4]).getByText("BTC")).toBeTruthy();
    expect(within(rows[4]).getByText("-1,18 PP")).toBeTruthy();
  });
});
