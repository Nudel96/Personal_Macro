import type {
  Account,
  AccountInput,
  AccountJournal,
  AccountCashflow,
  AccountCapitalPoint,
} from "../types/domain";
import {
  browserAccountTrades,
  browserBootstrap,
  requireBrowserAccount,
} from "./browser-adapter";

const ACCOUNTS_KEY = "personal-macro:browser-accounts:v1";
export function browserAccountCashflows(accountId: string): AccountCashflow[] {
  requireBrowserAccount(accountId);
  return JSON.parse(
    localStorage.getItem(`personal-macro:browser-cashflows:${accountId}`) ??
      "[]",
  );
}

export function browserAccountJournal(accountId: string): AccountJournal {
  requireBrowserAccount(accountId);
  const account = browserBootstrap.accounts.find(
    (item) => item.id === accountId,
  )!;
  const trades = browserAccountTrades(accountId);
  const closed = trades.filter((trade) => trade.status === "closed");
  const cashflows = browserAccountCashflows(accountId);
  const events = [
    ...cashflows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      kind: row.kind,
      label:
        row.kind === "deposit"
          ? "Einzahlung"
          : row.kind === "withdrawal"
            ? "Auszahlung"
            : "Korrektur",
      amount: row.amountMinor,
    })),
    ...closed
      .filter((trade) => trade.netPnlMinor != null)
      .map((trade) => ({
        id: trade.id,
        occurredAt: trade.closedAt ?? trade.openedAt ?? trade.createdAt,
        kind: "trade",
        label: trade.instrument,
        amount: trade.netPnlMinor!,
      })),
  ].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  let balance = account.initialBalanceMinor;
  let pnl = 0;
  const curve: AccountCapitalPoint[] = [
    {
      id: "initial",
      occurredAt: null,
      kind: "initial",
      label: "Startkapital",
      changeMinor: balance,
      balanceMinor: balance,
      cumulativePnlMinor: 0,
    },
  ];
  for (const event of events) {
    balance += event.amount;
    if (event.kind === "trade") pnl += event.amount;
    curve.push({
      id: event.id,
      occurredAt: event.occurredAt,
      kind: event.kind,
      label: event.label,
      changeMinor: event.amount,
      balanceMinor: balance,
      cumulativePnlMinor: pnl,
    });
  }
  return {
    accountId,
    currency: account.baseCurrency,
    initialBalanceMinor: account.initialBalanceMinor,
    cashflowMinor: balance - account.initialBalanceMinor - pnl,
    netPnlMinor: pnl,
    journalBalanceMinor: balance,
    closedTrades: closed.length,
    openTrades: trades.filter((trade) => trade.status === "open").length,
    missingPnlTrades: closed.filter((trade) => trade.netPnlMinor == null)
      .length,
    brokerBalanceMinor: null,
    capitalCurve: curve,
  };
}

export function browserAccountBootstrap() {
  for (const account of browserBootstrap.accounts) {
    if (!account.isArchived)
      account.currentBalanceMinor = browserAccountJournal(
        account.id,
      ).journalBalanceMinor;
  }
  return structuredClone(browserBootstrap);
}

export function browserSaveAccount(input: AccountInput): Account {
  if (
    !input.name.trim() ||
    !/^[A-Za-z]{3}$/.test(input.baseCurrency) ||
    !Number.isSafeInteger(input.initialBalanceMinor) ||
    input.initialBalanceMinor < 0
  )
    throw {
      code: "VALIDATION",
      message:
        "Bitte Kontoname, Währung und ein gültiges Startkapital ab 0 angeben.",
    };
  if (
    !Number.isFinite(input.defaultRiskPercent) ||
    input.defaultRiskPercent <= 0 ||
    input.defaultRiskPercent > 25
  )
    throw {
      code: "VALIDATION",
      message: "Das Standardrisiko muss zwischen 0 und 25 Prozent liegen.",
    };
  const current = browserBootstrap.accounts.find(
    (item) => item.id === input.id,
  );
  if (input.id && (!current || current.isArchived))
    throw {
      code: "ACCOUNT_NOT_FOUND",
      message: "Das ausgewählte Konto ist nicht verfügbar.",
    };
  if (current && current.baseCurrency !== input.baseCurrency.toUpperCase())
    throw {
      code: "VALIDATION",
      message: "Die Währung eines bestehenden Kontos bleibt erhalten.",
    };
  const account: Account = {
    ...input,
    name: input.name.trim(),
    baseCurrency: input.baseCurrency.toUpperCase(),
    id: current?.id ?? crypto.randomUUID(),
    currentBalanceMinor: input.initialBalanceMinor,
    isArchived: false,
  };
  const next = current
    ? browserBootstrap.accounts.map((item) =>
        item.id === current.id ? account : item,
      )
    : [...browserBootstrap.accounts, account];
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  browserBootstrap.accounts = next;
  account.currentBalanceMinor = browserAccountJournal(
    account.id,
  ).journalBalanceMinor;
  return structuredClone(account);
}

export function browserArchiveAccount(id: string) {
  requireBrowserAccount(id);
  if (browserBootstrap.accounts.filter((item) => !item.isArchived).length <= 1)
    throw {
      code: "VALIDATION",
      message: "Mindestens ein aktives Konto muss erhalten bleiben.",
    };
  const next = browserBootstrap.accounts.map((item) =>
    item.id === id ? { ...item, isArchived: true } : item,
  );
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  browserBootstrap.accounts = next;
}

export function browserAddAccountCashflow(
  input: Omit<AccountCashflow, "id" | "createdAt">,
) {
  requireBrowserAccount(input.accountId);
  if (
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor === 0 ||
    !Number.isFinite(new Date(input.occurredAt).getTime()) ||
    !(
      input.kind === "adjustment" ||
      (input.kind === "deposit" && input.amountMinor > 0) ||
      (input.kind === "withdrawal" && input.amountMinor < 0)
    )
  )
    throw {
      code: "VALIDATION",
      message: "Bitte Buchungsart, Datum und Betrag prüfen.",
    };
  const row = {
    ...input,
    occurredAt: new Date(input.occurredAt).toISOString(),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(
    `personal-macro:browser-cashflows:${input.accountId}`,
    JSON.stringify([row, ...browserAccountCashflows(input.accountId)]),
  );
  return row;
}
