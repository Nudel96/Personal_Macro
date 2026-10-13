import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MacroScoreHistoryResponse,
  ScoreInstrument,
} from "../../types/domain";
import { api } from "../../services/commands";
import { ScoreHistoryPage } from "./score-history-page";

vi.mock("../../services/commands", () => ({
  api: {
    macroScoreCatalog: vi.fn(),
    macroScoreHistory: vi.fn(),
    recordMacroScoreHistory: vi.fn(),
  },
  isTauri: () => true,
}));
vi.mock("../../charts/base-chart", () => ({
  BaseChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div>
      {ariaLabel.startsWith("Daily-Kurs")
        ? "Daily-Vergleichsdiagramm"
        : "Aufzeichnungsdiagramm"}
    </div>
  ),
  axisLabel: {},
  axisLine: {},
  splitLine: {},
  tooltip: {},
}));

const forex: ScoreInstrument = {
  id: "forex:EUR/USD",
  label: "EUR/USD",
  kind: "forex",
  base: "EUR",
  quote: "USD",
  defaultThreshold: 5,
  scoreName: "Fundamentals Score",
  priceSymbol: "EURUSD.FOREX",
  cotSymbol: null,
};
const oil: ScoreInstrument = {
  ...forex,
  id: "commodity:WTI/USD",
  label: "WTI Rohöl",
  kind: "commodity",
  base: "WTI",
  priceSymbol: "WTI.COMMODITY",
};
const currency: ScoreInstrument = {
  ...forex,
  id: "currency:USD",
  label: "USD",
  kind: "currency",
  base: "USD",
  quote: null,
  priceSymbol: null,
  defaultThreshold: 1,
};
const start = Date.UTC(2026, 9, 1) / 1000;
function response(instrument = forex): MacroScoreHistoryResponse {
  return {
    instrument,
    asOf: "2026-10-13T12:00:00Z",
    modelVersion: "v1",
    from: "2026-10-01",
    to: "2026-10-13",
    reasonCodes: [],
    earliestObservationAt: start,
    points: Array.from({ length: 10 }, (_, i) => ({
      observationKey: `capture:${i}`,
      observedAt: start + i * 86400,
      validUntil: start + (i + 1.5) * 86400,
      snapshotId: "stored",
      modelVersion: "v1",
      origin: "captured" as const,
      score: 6,
      availableComponents: 17,
      totalComponents: 17,
    })),
    candles: Array.from({ length: 10 }, (_, i) => ({
      time: start + i * 86400,
      open: 100,
      high: 111,
      low: 99,
      close: 110,
    })),
    priceSource: {
      provider: instrument.kind === "commodity" ? "eodhd" : "mt5",
      symbol: instrument.priceSymbol!,
      label: "Geprüfte Daily-Testdaten",
      inverted: false,
      dataKind: instrument.kind === "commodity" ? "close" : "ohlc",
      unit: instrument.kind === "commodity" ? "USD/Barrel" : "USD je EUR",
    },
    latestContributions: [],
  };
}
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <MemoryRouter initialEntries={["/score-history"]}>
        <ScoreHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.macroScoreCatalog).mockResolvedValue([forex, oil, currency]);
  vi.mocked(api.macroScoreHistory).mockImplementation(async (input) =>
    response(
      input.instrumentId === oil.id
        ? oil
        : input.instrumentId === currency.id
          ? currency
          : forex,
    ),
  );
  vi.mocked(api.recordMacroScoreHistory).mockResolvedValue({
    inserted: 89,
    archiveCompleted: true,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Score History workspace", () => {
  it("compares only available recorded scores and responds to threshold and market changes", async () => {
    mount();
    const user = userEvent.setup();
    expect(
      await screen.findByText(
        "Daily-Vergleichsdiagramm",
        {},
        { timeout: 10000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText("100.0 %")).toBeTruthy();
    await user.clear(
      screen.getByRole("spinbutton", { name: "Bullish-/Bearish-Schwelle" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Bullish-/Bearish-Schwelle" }),
      "9",
    );
    // Controlled numeric input can be replaced reliably with select-all.
    await user.click(
      screen.getByRole("spinbutton", { name: "Bullish-/Bearish-Schwelle" }),
    );
    await user.keyboard("{Control>}a{/Control}9");
    await waitFor(() => expect(screen.queryByText("100.0 %")).toBeNull());
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Score-Markt" }),
      oil.id,
    );
    expect(
      await screen.findByText(
        /Diese Energiereihe liefert einen täglichen Einzelpreis/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("100.0 %")).toBeNull();
    expect(screen.getAllByText(/0 abgeschlossene Stichproben/)).toHaveLength(2);
    expect(
      screen.getByRole("spinbutton", { name: "Bullish-/Bearish-Schwelle" }),
    ).toHaveValue(5);
  });
  it("offers explicit capture and preserves empty states without fabricated prices", async () => {
    vi.mocked(api.macroScoreHistory).mockResolvedValue({
      ...response(),
      points: [],
      candles: [],
      priceSource: null,
    });
    mount();
    expect(
      await screen.findByText(
        /Noch keine gespeicherten Beobachtungen in diesem Zeitraum/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Daily-Vergleichsdiagramm")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Jetzt erfassen" }));
    await waitFor(() =>
      expect(api.recordMacroScoreHistory).toHaveBeenCalledOnce(),
    );
  });
  it("shows backend errors and omits daily chart/statistics for a standalone currency", async () => {
    mount();
    await screen.findByText("Daily-Vergleichsdiagramm", {}, { timeout: 10000 });
    await userEvent
      .setup()
      .selectOptions(
        screen.getByRole("combobox", { name: "Score-Markt" }),
        currency.id,
      );
    await screen.findByText("Score-Historie · USD");
    expect(screen.queryByText("Daily-Chart vs. Score")).toBeNull();
    vi.mocked(api.macroScoreHistory).mockRejectedValue(
      new Error("Lesefehler in der Datenbank"),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Neu laden" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lesefehler in der Datenbank",
    );
  });
});
