import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type {
  CentralBankReportDashboard,
  CentralBankReportDetail,
} from "../../types/domain";
import { CentralBankReportsPage } from "./central-bank-reports-page";
const nativeOpen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: nativeOpen }));
vi.mock("../../services/commands", () => ({
  isTauri: () => false,
  api: {
    centralBankReports: vi.fn(),
    centralBankReport: vi.fn(),
    centralBankReportReadMarkers: vi.fn(),
    markCentralBankReportRead: vi.fn(),
    syncCentralBankReports: vi.fn(),
    summarizeCentralBankReports: vi.fn(),
  },
}));
const generation = "11111111-1111-4111-8111-111111111111";
const detail: CentralBankReportDetail = {
  id: "report-1",
  bankCode: "FED",
  currency: "USD",
  reportType: "decision",
  title: "Synthetic official report",
  sourceUrl: "https://www.federalreserve.gov/report.htm",
  discoveredAt: "2026-09-01T00:00:00Z",
  language: "en",
  extractionStatus: "complete",
  summaryStatus: "complete",
  extractedText: "Synthetic original text",
  summary: {
    language: "de",
    overview: "Deutsches Briefing",
    stance: "unclear",
    sections: [],
  },
};
const dashboard: CentralBankReportDashboard = {
  cloudGeneration: generation,
  cloudImportedAt: "2026-09-01T00:00:00Z",
  reports: [detail],
  sources: [],
  automation: {
    enabled: false,
    refreshIntervalMinutes: 0,
    openaiConfigured: false,
    summaryModel: "",
  },
};
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  vi.mocked(api.centralBankReports).mockResolvedValue(dashboard);
  vi.mocked(api.centralBankReport).mockResolvedValue(detail);
  vi.mocked(api.centralBankReportReadMarkers).mockResolvedValue([]);
  vi.mocked(api.markCentralBankReportRead).mockResolvedValue();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <CentralBankReportsPage />
    </QueryClientProvider>,
  );
}
describe("private reports", () => {
  it("shows cloud scheduling, cost reservations and exact evidence without starting provider requests from the browser", async () => {
    const proven: CentralBankReportDetail = {
      ...detail,
      summary: {
        language: "de",
        overview: "Belegtes deutsches Briefing",
        stance: "neutral",
        quality: {
          version: 3,
          sourceChunks: 12,
          sentChunks: 2,
          sourceCharacters: 10000,
          sentCharacters: 2000,
          partial: true,
        },
        sections: [
          {
            key: "decision",
            title: "Entscheidung",
            points: [
              {
                text: "Der Leitzins bleibt bei vier Prozent.",
                sourceRefs: ["Absatz 1"],
                evidence: [
                  {
                    sourceRef: "Absatz 1",
                    quote: "The policy rate remains at four percent.",
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    vi.mocked(api.centralBankReport).mockResolvedValue(proven);
    vi.mocked(api.centralBankReports).mockResolvedValue({
      ...dashboard,
      reports: [proven],
      automation: {
        ...dashboard.automation,
        enabled: true,
        refreshIntervalMinutes: 1440,
        openaiConfigured: true,
        aiBudget: {
          month: "2026-09",
          currency: "USD",
          limitMicros: 500000,
          spentMicros: 12500,
          heldMicros: 35000,
          requests: 4,
          uncertainRequests: 1,
          inputTokens: 10000,
          cachedTokens: 500,
          outputTokens: 6500,
          reasoningTokens: 2500,
          priceVersion: "test-tariff",
        },
      },
    });
    mount();
    await screen.findByText("Belegtes deutsches Briefing");
    expect(screen.getByText("Cloud-Aktualisierung aktiv")).not.toBeNull();
    expect(screen.getByText(/Tägliche Quellenprüfung/)).not.toBeNull();
    expect(screen.getByText(/KI-Teilbudget für 2026-09/).textContent).toContain(
      "0,50",
    );
    expect(
      screen.getByText(/Ungeklärte Anfragen bleiben reserviert/),
    ).not.toBeNull();
    expect(screen.getByText(/2 von 12 Textabschnitten/)).not.toBeNull();
    await userEvent.setup().click(screen.getByText("Originalbelege anzeigen"));
    expect(
      screen.getByText("The policy rate remains at four percent."),
    ).not.toBeNull();
    expect(api.syncCentralBankReports).not.toHaveBeenCalled();
    expect(api.summarizeCentralBankReports).not.toHaveBeenCalled();
  });
  it("uses pinned reports, stores read markers and opens official originals through the browser", async () => {
    const user = userEvent.setup();
    const browserOpen = vi.spyOn(window, "open").mockReturnValue(null);
    mount();
    await screen.findByText("Deutsches Briefing");
    expect(api.centralBankReport).toHaveBeenCalledWith("report-1", generation);
    expect(
      screen.queryByRole("button", { name: "Jetzt aktualisieren" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Briefings auf Deutsch" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Synthetic official report/ }),
    );
    await waitFor(() =>
      expect(api.markCentralBankReportRead).toHaveBeenCalledWith(
        "report-1",
        expect.anything(),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Offizielle Quelle öffnen" }),
    );
    expect(browserOpen).toHaveBeenCalledWith(
      detail.sourceUrl,
      "_blank",
      "noopener,noreferrer",
    );
    expect(nativeOpen).not.toHaveBeenCalled();
    expect(api.syncCentralBankReports).not.toHaveBeenCalled();
    expect(api.summarizeCentralBankReports).not.toHaveBeenCalled();
  });
  it("rejects forged external report links", async () => {
    vi.mocked(api.centralBankReport).mockResolvedValue({
      ...detail,
      sourceUrl: "https://federalreserve.gov.bad.test/",
    });
    const browserOpen = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    mount();
    await screen.findByText("Deutsches Briefing");
    await user.click(
      screen.getByRole("button", { name: "Offizielle Quelle öffnen" }),
    );
    expect(browserOpen).not.toHaveBeenCalled();
  });
});
