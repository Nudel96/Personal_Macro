import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type { CotDashboard } from "../../types/domain";
import { CotPage } from "./cot-page";

vi.mock("../../services/commands", () => ({
  api: {
    cotDashboard: vi.fn(),
  },
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
  vi.clearAllMocks();
});

describe("CotPage", () => {
  it("beginnt direkt mit der COT-Währungsmatrix", async () => {
    vi.mocked(api.cotDashboard).mockResolvedValue(dashboard);

    renderPage();

    expect(await screen.findByText("COT-Währungsmatrix")).toBeTruthy();
    expect(screen.queryByText("COT-Positionierungs-Kontext")).toBeNull();
    expect(screen.queryByText("COT aktualisieren")).toBeNull();
    expect(screen.queryByLabelText("CFTC-Kontrakt")).toBeNull();
  });
});
