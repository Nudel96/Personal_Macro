import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
vi.mock("../../services/runtime-mode", () => ({
  isPrivateWeb: vi.fn(() => false),
}));
import type { CotDashboard } from "../../types/domain";
import { CotPage } from "./cot-page";

vi.mock("../../services/commands", () => ({
  api: {
    cotDashboard: vi.fn(),
    cotAssetDetail: vi.fn(),
    syncCot: vi.fn(),
  },
  isTauri: () => false,
}));

const dashboard: CotDashboard = {
  sourceUrl:
    "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  lastSyncedAt: "2026-08-15T10:00:00Z",
  contracts: [],
  currencies: [],
  pairs: [],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CotPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(isPrivateWeb).mockReturnValue(false);
  vi.clearAllMocks();
});

describe("CotPage", () => {
  it("zeigt den bestätigten automatischen Cloud-Abruf und dessen Fehlerstatus", async () => {
    vi.mocked(isPrivateWeb).mockReturnValue(true);
    vi.mocked(api.cotDashboard).mockResolvedValue({
      ...dashboard,
      automaticRefresh: {
        enabled: true,
        calendarAvailable: true,
        nextRefreshAt: "2026-10-02T20:00:00Z",
        lastOutcome: "expired",
      },
    });
    renderPage();
    expect(
      await screen.findByText(/COT wird automatisch eine Stunde/),
    ).toBeTruthy();
    expect(
      screen.getByText(/bisherige geprüfte Stand bleibt sichtbar/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Provider-Aktualisierungen.*nicht verfügbar/),
    ).toBeNull();
  });
  it("opens the private COT snapshot with its provenance", async () => {
    vi.mocked(isPrivateWeb).mockReturnValue(true);
    vi.mocked(api.cotDashboard).mockResolvedValue(dashboard);
    renderPage();
    expect(await screen.findByText("COT-Währungsmatrix")).toBeTruthy();
    expect(screen.getByText(/Privater Cloud-Datenstand/)).toBeTruthy();
  });
  it("beginnt direkt mit der COT-Währungsmatrix", async () => {
    vi.mocked(api.cotDashboard).mockResolvedValue(dashboard);

    renderPage();

    expect(await screen.findByText("COT-Währungsmatrix")).toBeTruthy();
    expect(screen.queryByText("COT-Positionierungs-Kontext")).toBeNull();
    expect(screen.queryByText("COT aktualisieren")).toBeNull();
    expect(screen.queryByLabelText("CFTC-Kontrakt")).toBeNull();
  });
});
