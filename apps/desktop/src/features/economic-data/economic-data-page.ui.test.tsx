import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EconomicDataPage } from "./economic-data-page";

vi.mock("../../services/commands", () => ({
  api: {
    eodhdFeedStatus: vi.fn().mockResolvedValue({ lastSuccessAt: null }),
    macroFundamentalsDashboard: vi.fn(),
    eodhdIndicatorHistory: vi.fn(),
    syncEodhdIndicatorHistory: vi.fn(),
  },
  isTauri: () => false,
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EconomicDataPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EconomicDataPage", () => {
  it("filters economic releases by currency instead of market or asset", () => {
    renderPage();

    const currency = screen.getByLabelText("Währung") as HTMLSelectElement;
    expect(currency.value).toBe("USD");
    expect(currency.options).toHaveLength(9);
    expect(screen.queryByLabelText("Markt / Asset")).toBeNull();
    expect(screen.queryByText(/Future \(/)).toBeNull();
  });

  it("keeps every economic category and its indicators selectable", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: /Wachstum & Aktivität/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Inflation & Preise/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Arbeitsmarkt/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Geldpolitik & Zinsen/ }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Arbeitsmarkt/ }));

    const indicator = screen.getByLabelText("Indikator") as HTMLSelectElement;
    expect(indicator.options).toHaveLength(6);
    expect(Array.from(indicator.options, (option) => option.text)).toContain(
      "Nonfarm Payrolls",
    );
    expect(Array.from(indicator.options, (option) => option.text)).toContain(
      "JOLTS Job Openings",
    );
    expect(Array.from(indicator.options, (option) => option.text)).toContain(
      "Average Hourly Earnings",
    );
  });

  it("adds China-only macro releases without exposing them for other economies", () => {
    renderPage();

    const currency = screen.getByLabelText("Währung") as HTMLSelectElement;
    fireEvent.change(currency, { target: { value: "CNY" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Wachstum & Aktivität/ }),
    );

    const indicator = screen.getByLabelText("Indikator") as HTMLSelectElement;
    const chinaOptions = Array.from(indicator.options, (option) => option.text);
    expect(chinaOptions).toContain("S&P Global / Caixin Manufacturing PMI");
    expect(chinaOptions).toContain("Anlageinvestitionen");
    expect(chinaOptions).toContain("Exporte YoY");

    fireEvent.change(indicator, {
      target: { value: "fixed_asset_investment" },
    });
    fireEvent.change(currency, { target: { value: "USD" } });

    expect(indicator.value).toBe("gdp");
    expect(
      Array.from(indicator.options, (option) => option.text),
    ).not.toContain("Anlageinvestitionen");
  });
});
