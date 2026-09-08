import { beforeEach, describe, expect, it } from "vitest";
import {
  browserBootstrap,
  browserCreateTrade,
  browserDashboard,
  browserGetTrade,
  browserListDeletedTrades,
  browserListTrades,
  browserRestoreTrade,
  browserTrashTrade,
  browserUpdateTrade,
} from "./browser-adapter";
import { api } from "./commands";
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
    accountId: "account-a",
    ...overrides,
  };
}

describe("browser journal calculations", () => {
  beforeEach(() => {
    localStorage.clear();
    browserBootstrap.accounts.splice(
      0,
      browserBootstrap.accounts.length,
      {
        id: "account-a",
        name: "Konto A",
        accountType: "personal",
        baseCurrency: "EUR",
        initialBalanceMinor: 0,
        currentBalanceMinor: 0,
        defaultRiskPercent: 1,
        isArchived: false,
      },
      {
        id: "account-b",
        name: "Konto B",
        accountType: "personal",
        baseCurrency: "EUR",
        initialBalanceMinor: 0,
        currentBalanceMinor: 0,
        defaultRiskPercent: 1,
        isArchived: false,
      },
    );
  });

  it("requires exactly one nonblank account scope for browser lists and metrics", async () => {
    await browserCreateTrade(input({ accountId: "account-a" }));
    await browserCreateTrade(
      input({ accountId: "account-b", instrument: "xauusd" }),
    );

    await expect(browserListTrades({})).rejects.toMatchObject({
      code: "ACCOUNT_REQUIRED",
    });
    await expect(
      browserListTrades({ accountIds: ["account-a", "account-b"] }),
    ).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED" });
    await expect(browserDashboard({ accountIds: [" "] })).rejects.toMatchObject(
      { code: "ACCOUNT_REQUIRED" },
    );

    await expect(
      browserListTrades({ accountIds: ["account-a"] }),
    ).resolves.toMatchObject({
      total: 1,
    });
    await expect(
      browserDashboard({ accountIds: ["account-a"] }),
    ).resolves.toMatchObject({
      metrics: { totalTrades: 1 },
    });
  });

  it("rejects every cross-account trade read or mutation", async () => {
    const trade = await browserCreateTrade(input({ accountId: "account-a" }));

    await expect(browserGetTrade("account-b", trade.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      browserUpdateTrade(
        "account-b",
        trade.id,
        input({ accountId: "account-b" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      browserTrashTrade("account-b", trade.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await browserTrashTrade("account-a", trade.id);
    await expect(browserListDeletedTrades("account-b")).resolves.toEqual([]);
    await expect(
      browserRestoreTrade("account-b", trade.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(browserListDeletedTrades("account-a")).resolves.toEqual([
      expect.objectContaining({ id: trade.id }),
    ]);
    await expect(
      browserRestoreTrade("account-a", trade.id),
    ).resolves.toMatchObject({ accountId: "account-a", status: "closed" });
  });

  it("normalizes account scopes and keeps rejected cross-account mutations immutable", async () => {
    const trade = await browserCreateTrade(input({ accountId: "account-a" }));

    await expect(
      browserListTrades({ accountIds: [" account-a "] }),
    ).resolves.toMatchObject({
      total: 1,
    });
    await expect(
      browserDashboard({ accountIds: [" account-a "] }),
    ).resolves.toMatchObject({
      filter: { accountIds: ["account-a"] },
      metrics: { totalTrades: 1 },
    });
    await expect(api.listTrades(" ")).rejects.toMatchObject({
      code: "ACCOUNT_REQUIRED",
    });
    await expect(
      api.duplicateTrade("account-b", trade.id),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(browserGetTrade("account-a", trade.id)).resolves.toMatchObject(
      {
        status: "closed",
        accountId: "account-a",
      },
    );

    const duplicate = await api.duplicateTrade("account-a", trade.id);
    expect(duplicate.id).not.toBe(trade.id);
    expect(duplicate).toMatchObject({
      accountId: "account-a",
      instrument: trade.instrument,
      status: "draft",
    });
    await expect(browserGetTrade("account-a", trade.id)).resolves.toMatchObject(
      { id: trade.id, accountId: "account-a", status: "closed" },
    );

    await browserTrashTrade("account-a", trade.id);
    await expect(
      browserRestoreTrade("account-a", trade.id),
    ).resolves.toMatchObject({
      status: "closed",
      accountId: "account-a",
    });
    browserBootstrap.accounts[0].isArchived = true;
    await expect(
      browserListTrades({ accountIds: ["account-a"] }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
    await expect(
      browserListTrades({ accountIds: ["missing"] }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
  });

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
    const dashboard = await browserDashboard({ accountIds: ["account-a"] });
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
    const page = await browserListTrades({
      accountIds: ["account-a"],
      directions: ["short"],
    });
    const dashboard = await browserDashboard({
      accountIds: ["account-a"],
      directions: ["short"],
    });
    expect(page.total).toBe(1);
    expect(dashboard.metrics.totalTrades).toBe(1);
    expect(dashboard.directionPerformance[0]?.label).toBe("Short");
  });
});
