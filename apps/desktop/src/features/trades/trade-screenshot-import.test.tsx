import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import { useUiStore } from "../../stores/ui-store";
import type {
  Account,
  BootstrapData,
  TradeDetail,
  TradeScreenshotAnalysis,
} from "../../types/domain";
import { QuickTradeDialog } from "./quick-trade-dialog";
import { GuidedTradeDialog } from "./guided-trade-dialog";
import { TradeScreenshotImport } from "./trade-screenshot-import";

const account: Account = {
  id: "account-a",
  name: "Test",
  accountType: "demo",
  baseCurrency: "USD",
  initialBalanceMinor: 1000000,
  currentBalanceMinor: 1000000,
  defaultRiskPercent: 1,
  isArchived: false,
};
vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => ({ status: "ready", selectedAccount: account }),
}));
const ticket = (
  extra = "Lots: 0.25\nRisk: 112.50 USD",
): TradeScreenshotAnalysis => ({
  width: 1000,
  height: 680,
  language: "en-US",
  lines:
    `Symbol: EURUSD\nDirection: Long\nStatus: Open\nEntry price: 1.08450\nStop loss: 1.08000\nTake profit: 1.09350\n${extra}`
      .split("\n")
      .map((text) => ({ text, words: [] })),
});
const file = () =>
  new File(["synthetic test image"], "TradingView.png", { type: "image/png" });
const upload = () => {
  const toggle = screen.queryByRole("button", {
    name: /Screenshot hinzufügen/,
  });
  if (toggle?.getAttribute("aria-expanded") === "false")
    fireEvent.click(toggle);
  fireEvent.change(screen.getByLabelText("Screenshot-Datei"), {
    target: { files: [file()] },
  });
};

describe("screenshot import in trade capture", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    vi.spyOn(api, "analyzeTradeScreenshot").mockResolvedValue(ticket());
    vi.spyOn(api, "bootstrap").mockResolvedValue({
      accounts: [account],
      setups: [],
      strategies: [],
      tags: [],
      emotions: [],
      mistakes: [],
      databasePath: "test",
      appDataPath: "test",
      calculationVersion: "test",
    } as BootstrapData);
    useUiStore.setState({
      quickTradeOpen: true,
      selectedJournalAccountId: account.id,
    });
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("keeps the imported lot/risk values and atomically submits the original screenshot with the trade", async () => {
    const create = vi
      .spyOn(api, "createTradeWithScreenshot")
      .mockRejectedValueOnce({ message: "Test: Speichern fehlgeschlagen" })
      .mockImplementationOnce(
        async (input) => ({ ...input, id: "trade-1" }) as TradeDetail,
      );
    const plainCreate = vi.spyOn(api, "createTrade");
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <QuickTradeDialog />
      </QueryClientProvider>,
    );
    upload();
    await screen.findByLabelText("Erkannt: Positionsgröße");
    fireEvent.click(
      screen.getByRole("button", { name: "Geprüfte Werte übernehmen" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Positionsgröße",
          }) as HTMLInputElement
        ).value,
      ).toBe("0.25"),
    );
    expect(
      (screen.getByLabelText("Geplantes Risiko (USD)") as HTMLInputElement)
        .value,
    ).toBe("112.5");
    expect(
      (screen.getByRole("radio", { name: /Läuft noch/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Entry-Preis" }), {
      target: { value: "1.08500" },
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Positionsgröße",
        }) as HTMLInputElement
      ).value,
    ).toBe("0.25");
    expect(
      screen.getByRole("button", {
        name: "Automatische Berechnung aktivieren",
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trade speichern" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(plainCreate).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0]).toMatchObject({
      accountId: "account-a",
      instrument: "EURUSD",
      status: "open",
      quantity: "0.25",
      plannedRiskMinor: 11250,
      initialStopLoss: "1.08",
      takeProfit: "1.0935",
    });
    expect(create.mock.calls[0][1]).toMatchObject({
      filename: "TradingView.png",
      base64: btoa("synthetic test image"),
    });
    // A failed atomic save leaves the image and values available for retry.
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Trade speichern",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Trade speichern" }));
    await waitFor(() =>
      expect(useUiStore.getState().quickTradeOpen).toBe(false),
    );
    expect(create).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it("also carries reviewed screenshot values and the image through the guided workflow", async () => {
    localStorage.clear();
    useUiStore.setState({ quickTradeOpen: false, guidedTradeOpen: true });
    const create = vi
      .spyOn(api, "createTradeWithScreenshot")
      .mockImplementation(
        async (input) => ({ ...input, id: "guided-1" }) as TradeDetail,
      );
    const context = vi.spyOn(api, "saveTradeContext").mockResolvedValue({
      tags: [],
      legs: [],
      checklistItems: [],
      emotions: [],
      customValues: [],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    render(
      <QueryClientProvider client={client}>
        <GuidedTradeDialog />
      </QueryClientProvider>,
    );
    upload();
    await screen.findByLabelText("Erkannt: Positionsgröße");
    fireEvent.click(
      screen.getByRole("button", { name: "Geprüfte Werte übernehmen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    fireEvent.click(screen.getByRole("button", { name: "Trade speichern" }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toMatchObject({
      accountId: "account-a",
      status: "open",
      quantity: "0.25",
      plannedRiskMinor: 11250,
    });
    await waitFor(() => expect(context).toHaveBeenCalled());
    await waitFor(() =>
      expect(useUiStore.getState().guidedTradeOpen).toBe(false),
    );
    client.clear();
  });

  it("requires a quantity unit and matching risk currency, and converts explicitly chosen FX units to lots", async () => {
    vi.mocked(api.analyzeTradeScreenshot).mockResolvedValue(
      ticket("Qty: 25000\nRisk: $112.50"),
    );
    const onApply = vi.fn();
    render(
      <TradeScreenshotImport
        accountCurrency="USD"
        onApply={onApply}
        onImageChange={vi.fn()}
        onBusyChange={vi.fn()}
      />,
    );
    upload();
    const button = await screen.findByRole("button", {
      name: "Geprüfte Werte übernehmen",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Einheit der gelesenen Menge"), {
      target: { value: "units" },
    });
    fireEvent.change(screen.getByLabelText("Währung des Risikobetrags"), {
      target: { value: "EUR" },
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Währung des Risikobetrags"), {
      target: { value: "USD" },
    });
    fireEvent.click(button);
    expect(onApply.mock.calls[0][0]).toMatchObject({
      quantity: "0.25",
      plannedRisk: "112.5",
    });
    expect(onApply.mock.calls[0][1]).toMatchObject({
      sourceQuantity: "25000",
      quantityUnit: "lots",
      unitsPerLot: 100000,
    });
  });

  it("ignores a stale OCR response after the screenshot is removed", async () => {
    let finish!: (analysis: TradeScreenshotAnalysis) => void;
    vi.mocked(api.analyzeTradeScreenshot).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onApply = vi.fn();
    const onImage = vi.fn();
    render(
      <TradeScreenshotImport
        accountCurrency="USD"
        onApply={onApply}
        onImageChange={onImage}
        onBusyChange={vi.fn()}
      />,
    );
    upload();
    await screen.findByRole("button", { name: "Screenshot entfernen" });
    fireEvent.click(
      screen.getByRole("button", { name: "Screenshot entfernen" }),
    );
    await act(async () => {
      finish(ticket());
    });
    expect(screen.queryByLabelText("Erkannt: Positionsgröße")).toBeNull();
    expect(onImage).toHaveBeenLastCalledWith(null);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("accepts a pasted screenshot and keeps the image available after an OCR failure", async () => {
    vi.mocked(api.analyzeTradeScreenshot).mockRejectedValue({
      message: "Windows-Sprache fehlt",
    });
    const onImage = vi.fn();
    render(
      <TradeScreenshotImport
        accountCurrency="USD"
        onApply={vi.fn()}
        onImageChange={onImage}
        onBusyChange={vi.fn()}
      />,
    );
    fireEvent.paste(
      screen.getByRole("region", { name: "Trade aus Screenshot" }),
      { clipboardData: { files: [file()] } },
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Windows-Sprache fehlt",
    );
    expect(onImage.mock.lastCall?.[0]?.filename).toBe("TradingView.png");
    expect(
      screen.getByAltText("Ausgewählter TradingView-Screenshot zur Prüfung"),
    ).toBeTruthy();
  });
});
