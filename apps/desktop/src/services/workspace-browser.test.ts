import { beforeEach, describe, expect, it } from "vitest";
import {
  browserBootstrap,
  browserCreateTrade,
  browserTrashTrade,
} from "./browser-adapter";
import {
  assignBrowserTradeMistake,
  browserMistakes,
  getBrowserTradeContext,
  listBrowserPlaybook,
  listBrowserReviews,
  listBrowserTradeMistakes,
  saveBrowserTradeContext,
  saveBrowserReview,
} from "./workspace-browser";
import { api } from "./commands";
import type { Account, ReviewInput, TradeInput } from "../types/domain";

const account = (id: string): Account => ({
  id,
  name: id,
  accountType: "personal",
  baseCurrency: "EUR",
  initialBalanceMinor: 0,
  currentBalanceMinor: 0,
  defaultRiskPercent: 1,
  isArchived: false,
});

function trade(accountId: string, instrument: string): TradeInput {
  return {
    accountId,
    status: "closed",
    instrument,
    assetClass: "forex",
    direction: "long",
    setupId: "setup-breakout",
    displayTimezone: "Europe/Berlin",
    openedAt: "2026-08-01T08:00:00.000Z",
    closedAt: "2026-08-01T09:00:00.000Z",
    grossPnlMinor: 1_000,
    feesMinor: 0,
    commissionMinor: 0,
    swapMinor: 0,
  };
}

function review(accountId: string, id?: string): ReviewInput {
  return {
    id,
    accountId,
    reviewType: "weekly",
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    status: "draft",
    metricSnapshot: { totalTrades: accountId === "account-a" ? 1 : 2 },
  };
}

describe("browser workspace account scope", () => {
  beforeEach(() => {
    localStorage.clear();
    browserBootstrap.accounts.splice(
      0,
      browserBootstrap.accounts.length,
      account("account-a"),
      account("account-b"),
    );
  });

  it("keeps identical review periods separate and rejects cross-account updates", async () => {
    const reviewA = await saveBrowserReview(review("account-a", "review-a"));
    const reviewB = await saveBrowserReview(review("account-b", "review-b"));

    await expect(listBrowserReviews("account-a")).resolves.toEqual([
      expect.objectContaining({ id: reviewA.id, accountId: "account-a" }),
    ]);
    await expect(listBrowserReviews("account-b")).resolves.toEqual([
      expect.objectContaining({ id: reviewB.id, accountId: "account-b" }),
    ]);

    await expect(
      saveBrowserReview({
        ...review("account-b", reviewA.id),
        winsHtml: "Darf Konto A nicht veraendern",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listBrowserReviews("account-a")).resolves.toEqual([reviewA]);
  });

  it("returns global setup definitions with nullable or exactly account-scoped counts", async () => {
    await browserCreateTrade(trade("account-a", "EURUSD"));
    await browserCreateTrade(trade("account-b", "GBPUSD"));
    const deletedA = await browserCreateTrade(trade("account-a", "USDJPY"));
    await browserTrashTrade("account-a", deletedA.id);

    const noAccount = await listBrowserPlaybook();
    const accountA = await listBrowserPlaybook("account-a");
    const accountB = await listBrowserPlaybook("account-b");
    const findBreakout = (
      rows: Awaited<ReturnType<typeof listBrowserPlaybook>>,
    ) => rows.find((row) => row.id === "setup-breakout");

    expect(findBreakout(noAccount)?.tradeCount).toBeNull();
    expect(findBreakout(accountA)?.tradeCount).toBe(1);
    expect(findBreakout(accountB)?.tradeCount).toBe(1);
    expect(accountA.map((row) => row.id)).toEqual(
      noAccount.map((row) => row.id),
    );
  });

  it("preserves global mistake definitions while aggregating only live trades for one account", async () => {
    const tradeA = await browserCreateTrade(trade("account-a", "EURUSD"));
    const tradeB = await browserCreateTrade(trade("account-b", "GBPUSD"));
    const deletedA = await browserCreateTrade(trade("account-a", "USDJPY"));

    await assignBrowserTradeMistake("account-a", {
      tradeId: tradeA.id,
      mistakeId: "fomo",
      severity: 2,
      estimatedCostMinor: 100,
    });
    await assignBrowserTradeMistake("account-b", {
      tradeId: tradeB.id,
      mistakeId: "fomo",
      severity: 4,
      estimatedCostMinor: 900,
    });
    await assignBrowserTradeMistake("account-a", {
      tradeId: deletedA.id,
      mistakeId: "fomo",
      severity: 5,
      estimatedCostMinor: 500,
    });
    await browserTrashTrade("account-a", deletedA.id);

    const accountA = await browserMistakes("account-a");
    const accountB = await browserMistakes("account-b");

    expect(accountA.find((row) => row.id === "fomo")).toMatchObject({
      occurrences: 1,
      estimatedCostMinor: 100,
      averageSeverity: 2,
    });
    expect(accountB.find((row) => row.id === "fomo")).toMatchObject({
      occurrences: 1,
      estimatedCostMinor: 900,
      averageSeverity: 4,
    });
    expect(accountA.find((row) => row.id === "stop")).toMatchObject({
      occurrences: 0,
      estimatedCostMinor: 0,
      averageSeverity: null,
    });
  });

  it("rejects cross-account access before reading or mutating trade children", async () => {
    const tradeA = await browserCreateTrade(trade("account-a", "EURUSD"));

    await expect(
      assignBrowserTradeMistake("account-b", {
        tradeId: tradeA.id,
        mistakeId: "fomo",
        severity: 5,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      listBrowserTradeMistakes("account-b", tradeA.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveBrowserTradeContext("account-b", {
        tradeId: tradeA.id,
        tagIds: ["tag-a"],
        legs: [],
        checklistItems: [],
        emotions: [],
        customValues: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getBrowserTradeContext("account-b", tradeA.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      listBrowserTradeMistakes("account-a", tradeA.id),
    ).resolves.toEqual([]);
    await expect(
      getBrowserTradeContext("account-a", tradeA.id),
    ).resolves.toMatchObject({ tags: [] });
  });

  it("uses stable account errors for unknown, archived and blank workspace scopes", async () => {
    await expect(listBrowserReviews(" ")).rejects.toMatchObject({
      code: "ACCOUNT_REQUIRED",
    });
    await expect(browserMistakes("missing")).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
    browserBootstrap.accounts[0].isArchived = true;
    await expect(listBrowserPlaybook("account-a")).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("routes the public facade through the same account-first browser contracts", async () => {
    await saveBrowserReview(review("account-a", "review-a"));

    await expect(api.reviews(" account-a ")).resolves.toEqual([
      expect.objectContaining({ id: "review-a", accountId: "account-a" }),
    ]);
    await expect(api.playbook()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "setup-breakout", tradeCount: null }),
      ]),
    );
    await expect(api.mistakeAnalytics("account-a")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fomo", occurrences: 0 }),
      ]),
    );
  });
});
