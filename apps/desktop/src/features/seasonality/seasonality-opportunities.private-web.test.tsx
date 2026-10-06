import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import type {
  SeasonalityOpportunityInput,
  SeasonalityOpportunityResponse,
} from "../../types/domain";
import { SeasonalityOpportunities } from "./seasonality-opportunities";
vi.mock("../../services/commands", () => ({
  api: {
    seasonalityOpportunities: vi.fn(),
    seasonalityOpportunitiesBatch: vi.fn(),
  },
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: () => null,
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));
const generation = "11111111-1111-4111-8111-111111111111";
const clients: QueryClient[] = [];
function result(
  input: SeasonalityOpportunityInput,
): SeasonalityOpportunityResponse {
  return {
    input,
    windows: [],
    divergences: [],
    instrumentCount: 0,
    currencyCount: 0,
    evaluatedWindows: 0,
    evaluatedDivergences: 0,
    excludedSymbols: [],
    unavailableReason:
      input.universe === "fxFutures"
        ? "Keine echte Futures-Historie angebunden."
        : null,
  };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <SeasonalityOpportunities
        dataVersion="snapshot"
        generation={generation}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubEnv("VITE_PRIVATE_WEB", "true");
  vi.mocked(api.seasonalityOpportunitiesBatch).mockImplementation(
    async (args) => ({
      generation: args.generation,
      result: result(args.input),
      nextCursor: null,
      total: 0,
      completed: 0,
    }),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("private seasonal opportunity scans", () => {
  it("requires explicit start and preserves unavailable real futures", async () => {
    const user = userEvent.setup();
    mount();
    expect(api.seasonalityOpportunities).not.toHaveBeenCalled();
    expect(api.seasonalityOpportunitiesBatch).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Fenstersuche berechnen" }),
    );
    await screen.findByText("FX-Futures-Historie fehlt");
    expect(api.seasonalityOpportunitiesBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        generation,
        cursor: 0,
        limit: 5,
        input: expect.objectContaining({ universe: "fxFutures" }),
      }),
    );
  });
  it("invalidates an old result when the selected universe changes without silently starting a scan", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Fenstersuche berechnen" }),
    );
    await screen.findByText("FX-Futures-Historie fehlt");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Datenbasis der Fenstersuche" }),
      "all",
    );
    expect(screen.queryByText("FX-Futures-Historie fehlt")).toBeNull();
    expect(api.seasonalityOpportunitiesBatch).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Fenstersuche berechnen" }),
    );
    expect(api.seasonalityOpportunitiesBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ universe: "all" }),
      }),
    );
  });
});
