import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Account } from "../../types/domain";
import { AccountCapitalOverview } from "./analytics-page";

describe("AccountCapitalOverview", () => {
  it("shows the current balance of every account in its base currency", () => {
    const accounts: Account[] = [
      {
        id: "main",
        name: "Hauptkonto",
        accountType: "personal",
        baseCurrency: "EUR",
        initialBalanceMinor: 0,
        currentBalanceMinor: 10_000,
        defaultRiskPercent: 1,
        isArchived: false,
      },
    ];

    render(<AccountCapitalOverview accounts={accounts} />);

    expect(screen.getByText("Aktuelles Kapital · Hauptkonto")).toBeTruthy();
    expect(screen.getByText(/100,00/)).toBeTruthy();
  });
});
