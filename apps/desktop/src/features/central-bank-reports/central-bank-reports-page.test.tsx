import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type {
  CentralBankReportDashboard,
  CentralBankReportDetail,
} from "../../types/domain";
import { CentralBankReportsPage } from "./central-bank-reports-page";

vi.mock("../../services/commands", () => ({
  isTauri: () => true,
  api: {
    centralBankReports: vi.fn(),
    centralBankReport: vi.fn(),
    openCentralBankReportFile: vi.fn(),
    syncCentralBankReports: vi.fn(),
    markCentralBankReportRead: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const banks = [
  ["FED", "USD"],
  ["ECB", "EUR"],
  ["BOE", "GBP"],
  ["BOJ", "JPY"],
  ["RBA", "AUD"],
  ["RBNZ", "NZD"],
  ["BOC", "CAD"],
  ["SNB", "CHF"],
  ["PBOC", "CNY"],
] as const;

function dashboard(): CentralBankReportDashboard {
  return {
    reports: [
      {
        id: "fed-report",
        bankCode: "FED",
        currency: "USD",
        reportType: "decision",
        title: "Federal Reserve issues FOMC statement",
        sourceUrl: "https://www.federalreserve.gov/example.htm",
        publishedAt: "2026-09-03T18:00:00Z",
        discoveredAt: "2026-09-03T18:01:00Z",
        language: "en",
        mimeType: "text/html",
        localPath: null,
        extractionStatus: "complete",
        summaryStatus: "complete",
        summaryProvider: "openai",
        summaryModel: "gpt-5-mini",
        summarizedAt: "2026-09-03T18:02:00Z",
        readAt: null,
      },
      {
        id: "ecb-report",
        bankCode: "ECB",
        currency: "EUR",
        reportType: "projections",
        title: "Eurosystem staff macroeconomic projections",
        sourceUrl: "https://www.ecb.europa.eu/example.html",
        publishedAt: "2026-09-02T12:00:00Z",
        discoveredAt: "2026-09-02T12:01:00Z",
        language: "en",
        mimeType: "application/pdf",
        localPath: "ECB/2026/example.pdf",
        extractionStatus: "complete",
        summaryStatus: "local_fallback",
        summaryProvider: "local",
        summaryModel: null,
        summarizedAt: "2026-09-02T12:02:00Z",
        readAt: "2026-09-02T13:00:00Z",
      },
    ],
    sources: banks.map(([bankCode, currency]) => ({
      id: `${bankCode.toLowerCase()}-source`,
      bankCode,
      bankName: bankCode,
      currency,
      sourceUrl: `https://example.test/${bankCode}`,
      lastCheckedAt: "2026-09-04T08:00:00Z",
      lastSuccessAt: "2026-09-04T08:00:00Z",
      lastStatus: "success",
      errorMessage: null,
    })),
    automation: {
      enabled: true,
      refreshIntervalMinutes: 15,
      lastAttemptAt: "2026-09-04T08:00:00Z",
      lastSuccessAt: "2026-09-04T08:00:00Z",
      lastStatus: "success",
      errorMessage: null,
      nextRefreshAt: "2026-09-04T08:15:00Z",
      openaiConfigured: true,
      summaryModel: "gpt-5-mini",
    },
  };
}

function detail(): CentralBankReportDetail {
  return {
    ...dashboard().reports[0],
    extractedText:
      "[Absatz 1]\nThe Committee decided to maintain the target range.",
    summary: {
      overview: "Die Federal Reserve beließ das Zielband unverändert.",
      stance: "neutral",
      sections: [
        {
          key: "decision",
          title: "Entscheidung",
          points: [
            {
              text: "Das Zielband blieb unverändert.",
              sourceRefs: ["Absatz 1"],
            },
          ],
        },
      ],
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CentralBankReportsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CentralBankReportsPage", () => {
  it("zeigt alle neun Zentralbanken und die bewusst ausgeschlossenen Dokumentarten", async () => {
    vi.mocked(api.centralBankReports).mockResolvedValue(dashboard());

    renderPage();

    expect(await screen.findByText("Zentralbank-Briefings")).toBeTruthy();
    for (const [bankCode] of banks) {
      expect(screen.getAllByText(bankCode).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByText(/Bewusst ohne Reden, Forschung, Minutes/),
    ).toBeTruthy();
    expect(screen.getByText(/9\/9 Quellen zuletzt erreichbar/)).toBeTruthy();
  });

  it("filtert das Archiv und öffnet eine quellengebundene Zusammenfassung", async () => {
    vi.mocked(api.centralBankReports).mockResolvedValue(dashboard());
    vi.mocked(api.centralBankReport).mockResolvedValue(detail());
    vi.mocked(api.markCentralBankReportRead).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Federal Reserve issues FOMC statement");

    expect(
      await screen.findByText(
        "Die Federal Reserve beließ das Zielband unverändert.",
      ),
    ).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Zentralbank"), "ECB");
    expect(
      screen.queryByRole("button", {
        name: /Federal Reserve issues FOMC statement/,
      }),
    ).toBeNull();
    expect(
      screen.getByText("Eurosystem staff macroeconomic projections"),
    ).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Zentralbank"), "all");
    await user.click(
      screen.getByRole("button", {
        name: /Federal Reserve issues FOMC statement/,
      }),
    );

    expect(
      await screen.findByText(
        "Die Federal Reserve beließ das Zielband unverändert.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Absatz 1")).toBeTruthy();
    expect(vi.mocked(api.markCentralBankReportRead).mock.calls[0]?.[0]).toBe(
      "fed-report",
    );
  });

  it("öffnet lokale Originale über den abgesicherten Backend-Befehl", async () => {
    vi.mocked(api.centralBankReports).mockResolvedValue(dashboard());
    vi.mocked(api.centralBankReport).mockResolvedValue({
      ...detail(),
      ...dashboard().reports[1],
    });
    vi.mocked(api.openCentralBankReportFile).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Federal Reserve issues FOMC statement");

    await user.click(
      screen.getByText("Eurosystem staff macroeconomic projections"),
    );
    await user.click(
      await screen.findByRole("button", { name: "Lokales Original öffnen" }),
    );

    expect(api.openCentralBankReportFile).toHaveBeenCalledWith("ecb-report");
  });

  it("startet den manuellen Abruf", async () => {
    vi.mocked(api.centralBankReports).mockResolvedValue(dashboard());
    vi.mocked(api.syncCentralBankReports).mockResolvedValue({
      sourcesChecked: 12,
      reportsDiscovered: 1,
      reportsDownloaded: 1,
      reportsSummarized: 1,
      completedAt: "2026-09-04T08:05:00Z",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Zentralbank-Briefings");

    await user.click(
      screen.getByRole("button", { name: "Jetzt aktualisieren" }),
    );

    expect(api.syncCentralBankReports).toHaveBeenCalledTimes(1);
  });
});
