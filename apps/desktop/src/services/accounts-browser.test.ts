import { beforeEach, describe, expect, it } from "vitest";
import {
  browserBootstrap,
  browserCreateTrade,
  browserTrashTrade,
} from "./browser-adapter";
import {
  browserAccountBootstrap,
  browserAccountJournal,
  browserAddAccountCashflow,
  browserSaveAccount,
} from "./accounts-browser";
import type { TradeInput } from "../types/domain";

describe("account funding and lifetime P&L", () => {
  beforeEach(() => {
    localStorage.clear();
    browserBootstrap.accounts = [];
  });
  const createAccount = (name = "Journal") =>
    browserSaveAccount({
      name,
      accountType: "personal",
      baseCurrency: "EUR",
      initialBalanceMinor: 100000,
      defaultRiskPercent: 1,
    });
  const trade = (accountId: string, pnl?: number) =>
    browserCreateTrade({
      accountId,
      instrument: "EURUSD",
      assetClass: "forex",
      direction: "long",
      status: "closed",
      closedAt: "2026-09-10T12:00:00Z",
      displayTimezone: "Europe/Berlin",
      feesMinor: 0,
      commissionMinor: 0,
      swapMinor: 0,
      netPnlMinor: pnl,
    } satisfies TradeInput);

  it("starts at invested capital and sums 40.75 + 34.59 independently of funding", async () => {
    const a = createAccount();
    expect(browserAccountJournal(a.id)).toMatchObject({
      initialBalanceMinor: 100000,
      journalBalanceMinor: 100000,
      netPnlMinor: 0,
      closedTrades: 0,
    });
    expect(browserAccountJournal(a.id).capitalCurve).toHaveLength(1);
    await trade(a.id, 4075);
    await trade(a.id, 3459);
    browserAddAccountCashflow({
      accountId: a.id,
      amountMinor: 50000,
      kind: "deposit",
      occurredAt: "2026-09-01T12:00:00Z",
    });
    browserAddAccountCashflow({
      accountId: a.id,
      amountMinor: -20000,
      kind: "withdrawal",
      occurredAt: "2026-09-02T12:00:00Z",
    });
    expect(browserAccountJournal(a.id)).toMatchObject({
      netPnlMinor: 7534,
      cashflowMinor: 30000,
      journalBalanceMinor: 137534,
    });
    expect(browserAccountBootstrap().accounts[0].currentBalanceMinor).toBe(
      137534,
    );
    expect(
      browserAccountJournal(a.id).capitalCurve.slice(-1)[0]?.balanceMinor,
    ).toBe(137534);
  });

  it("corrects the initial capital without changing trades or deposits", async () => {
    const a = createAccount();
    await trade(a.id, -2000);
    browserSaveAccount({
      ...a,
      broker: a.broker ?? undefined,
      initialBalanceMinor: 200000,
    });
    expect(browserAccountJournal(a.id)).toMatchObject({
      initialBalanceMinor: 200000,
      journalBalanceMinor: 198000,
      netPnlMinor: -2000,
    });
    const saved = JSON.parse(
      localStorage.getItem("personal-macro:browser-accounts:v1")!,
    );
    expect(saved[0].initialBalanceMinor).toBe(200000);
  });

  it("keeps zero distinct from missing results and excludes deleted and foreign trades", async () => {
    const a = createAccount();
    const b = createAccount("Other");
    await trade(a.id, 0);
    await trade(a.id);
    const deleted = await trade(a.id, 12345);
    await browserTrashTrade(a.id, deleted.id);
    await trade(b.id, 99999);
    expect(browserAccountJournal(a.id)).toMatchObject({
      netPnlMinor: 0,
      missingPnlTrades: 1,
      closedTrades: 2,
      journalBalanceMinor: 100000,
    });
    expect(browserAccountJournal(a.id).capitalCurve).toHaveLength(2);
  });

  it("rejects negative deposits, positive withdrawals and invalid dates", () => {
    const a = createAccount();
    const input = {
      accountId: a.id,
      amountMinor: -100,
      kind: "deposit" as const,
      occurredAt: "2026-09-10T12:00:00Z",
    };
    expect(() => browserAddAccountCashflow(input)).toThrow();
    expect(() =>
      browserAddAccountCashflow({
        ...input,
        kind: "withdrawal",
        amountMinor: 100,
      }),
    ).toThrow();
    expect(() =>
      browserAddAccountCashflow({
        ...input,
        amountMinor: 100,
        occurredAt: "invalid",
      }),
    ).toThrow();
    expect(() =>
      browserSaveAccount({
        ...a,
        broker: a.broker ?? undefined,
        initialBalanceMinor: -1,
      }),
    ).toThrow();
  });
});
