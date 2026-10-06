import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { PolicyRateDashboard } from "../../types/domain";
import { RatesPage } from "./rates-page";

vi.mock("../../services/commands", () => ({
  api: {
    policyRates: vi.fn(),
    syncPolicyRates: vi.fn(),
  },
}));

const currencies = [
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "USD",
];

function dashboard(): PolicyRateDashboard {
  return {
    snapshotAt: "2026-08-01T08:00:00Z",
    sourceName: "EODHD Economic Events API",
    sourceUrl: "https://eodhd.com/api/economic-events",
    rates: currencies.map((currency) => ({
      currency,
      centralBank: `${currency} central bank`,
      currentRate: currency === "CNY" ? "3" : "2.5",
      rateDefinition:
        currency === "CNY"
          ? "1Y Loan Prime Rate (kein einheitlicher Policy Rate)"
          : "Policy Rate",
      officialSourceUrl: "https://example.test/official",
      officialPublishedAt: "2026-07-31T00:00:00Z",
      providerSnapshotAt: "2026-08-01T08:00:00Z",
      qualityStatus: "provider_confirmed",
      weight: "1",
      availabilityStatus: "unavailable",
    })),
    usdRelative: {
      coveredCentralBanks: 0,
      requiredCentralBanks: 4,
      hikeCount: 0,
      holdCount: 0,
      cutCount: 0,
      availabilityStatus: "unavailable",
    },
    automation: {
      enabled: true,
      lastAttemptAt: "2026-08-01T08:00:00Z",
      lastSuccessAt: "2026-08-01T08:00:00Z",
      lastStatus: "success",
      coveredCurrencies: 9,
      expectedCurrencies: 9,
      refreshIntervalHours: 6,
      nextRefreshAt: "2026-08-01T14:00:00Z",
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RatesPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("RatesPage", () => {
  it("shows every supported currency and the automatic coverage", async () => {
    vi.mocked(api.policyRates).mockResolvedValue(dashboard());

    renderPage();

    expect(await screen.findByText("Automatisch · 9/9")).toBeTruthy();
    for (const currency of currencies) {
      expect(screen.getAllByText(currency).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("EODHD bestätigt")).toHaveLength(9);
    expect(screen.getByText(/kein einheitlicher Policy Rate/)).toBeTruthy();
  });

  it("runs a manual refresh and replaces the cached dashboard", async () => {
    const current = dashboard();
    vi.mocked(api.policyRates).mockResolvedValue(current);
    vi.mocked(api.syncPolicyRates).mockResolvedValue(current);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Automatisch · 9/9");

    await user.click(
      screen.getByRole("button", { name: "Jetzt aktualisieren" }),
    );

    expect(api.syncPolicyRates).toHaveBeenCalledTimes(1);
  });

  it("shows the imported private snapshot without provider actions or automatic polling", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.useFakeTimers();
    vi.mocked(api.policyRates).mockResolvedValue({
      ...dashboard(),
      cloudGeneration: "9a654938-e146-49bb-9866-9ff4c54c1e50",
      cloudImportedAt: "2026-09-24T10:00:00Z",
    });
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText("Übernommener Snapshot")).toBeTruthy();
    expect(
      screen.getByText(
        /Übernommen am .*Keine automatische Cloud-Aktualisierung/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Automatisch · 9/9")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /aktualisieren|synchronisieren/i }),
    ).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_001);
    });
    expect(api.policyRates).toHaveBeenCalledTimes(1);
    expect(api.syncPolicyRates).not.toHaveBeenCalled();
  });

  it("does not offer an unsupported provider sync when the private snapshot is empty", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.mocked(api.policyRates).mockResolvedValue({ ...dashboard(), rates: [] });
    renderPage();
    expect(
      await screen.findByText(
        /Der übernommene Datenstand enthält noch keine Leitzinsen/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /aktualisieren|synchronisieren/i }),
    ).toBeNull();
    expect(api.syncPolicyRates).not.toHaveBeenCalled();
  });
});
