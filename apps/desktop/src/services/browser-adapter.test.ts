import { beforeEach, describe, expect, it } from "vitest";
import {
  browserCreateTrade,
  browserDashboard,
  browserListTrades,
} from "./browser-adapter";
import type { TradeInput } from "../types/domain";

function input(overrides: Partial<TradeInput> = {}): TradeInput {
  return {
    status: "closed",
    instrument: "eurusd",
    assetClass: "forex",
    direction: "long",
    openedAt: "2026-07-01T08:00:00.000Z",
    closedAt: "2026-07-01T12:00:00.000Z",
    displayTimezone: "Europe/Berlin",
    plannedRiskMinor: 5_000,
    grossPnlMinor: 10_000,
    feesMinor: 0,
    commissionMinor: 0,
    swapMinor: 0,
    ...overrides,
  };
}

describe("browser journal calculations", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes instruments and calculates net P&L plus R", async () => {
    const trade = await browserCreateTrade(
      input({ feesMinor: 500, commissionMinor: 100, swapMinor: 50 }),
    );
    expect(trade.instrument).toBe("EURUSD");
    expect(trade.netPnlMinor).toBe(9_350);
    expect(trade.calculatedR).toBe("1.87");
  });

  it("uses break-even trades in the win-rate denominator", async () => {
    await browserCreateTrade(input({ grossPnlMinor: 10_000 }));
    await browserCreateTrade(
      input({
        instrument: "xauusd",
        direction: "short",
        grossPnlMinor: -5_000,
      }),
    );
    await browserCreateTrade(input({ instrument: "btcusd", grossPnlMinor: 0 }));
    const dashboard = await browserDashboard({});
    expect(dashboard.metrics.totalTrades).toBe(3);
    expect(dashboard.metrics.winRate.value).toBeCloseTo(1 / 3);
    expect(dashboard.metrics.profitFactor.value).toBe(2);
    expect(dashboard.metrics.medianR.value).toBe(0);
  });

  it("applies direction filters consistently", async () => {
    await browserCreateTrade(input({ direction: "long" }));
    await browserCreateTrade(
      input({ instrument: "xauusd", direction: "short" }),
    );
    const page = await browserListTrades({ directions: ["short"] });
    const dashboard = await browserDashboard({ directions: ["short"] });
    expect(page.total).toBe(1);
    expect(dashboard.metrics.totalTrades).toBe(1);
    expect(dashboard.directionPerformance[0]?.label).toBe("Short");
  });
});
