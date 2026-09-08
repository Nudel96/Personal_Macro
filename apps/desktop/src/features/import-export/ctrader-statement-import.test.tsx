import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({ open: vi.fn() }));
const commandMocks = vi.hoisted(() => ({
  previewCTraderStatement: vi.fn(),
  commitCTraderStatement: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: tauriMocks.open }));
vi.mock("../../services/commands", () => ({
  api: commandMocks,
  isTauri: () => true,
}));
vi.mock("../accounts/journal-account-context", () => ({
  useJournalAccount: () => ({
    status: "ready",
    selectedAccountId: "account-a",
  }),
}));

import { CTraderStatementImport } from "./ctrader-statement-import";

function renderImporter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CTraderStatementImport />
    </QueryClientProvider>,
  );
}

describe("CTraderStatementImport", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.open.mockResolvedValue("C:\\Imports\\statement.htm");
    commandMocks.previewCTraderStatement.mockResolvedValue({
      runId: "run-a",
      format: "html",
      maskedSourceAccount: "••••4567",
      baseCurrency: "USD",
      targetAccountCurrency: "EUR",
      currencyMismatch: true,
      sourceTimezone: "UTC+01:00",
      valid: 1,
      invalid: 0,
      duplicate: 0,
      conflict: 0,
      openPositions: 0,
      orders: 0,
      transactions: 2,
      canCommit: true,
      rows: [
        {
          rowNumber: 2,
          status: "valid",
          sourceTradeId: "source-trade-a",
          symbol: "XAUUSD",
          direction: "long",
          openedAt: null,
          closedAt: "2026-08-06T05:42:09.869Z",
          netPnlMinor: 25569,
          errors: [],
        },
      ],
    });
    commandMocks.commitCTraderStatement.mockResolvedValue({
      runId: "run-a",
      inserted: 1,
      duplicate: 0,
    });
  });

  it("selects HTML/XLSX statements and previews them for the active account", async () => {
    const user = userEvent.setup();
    renderImporter();

    await user.click(
      screen.getByRole("button", { name: "cTrader-Datei auswählen" }),
    );

    expect(tauriMocks.open).toHaveBeenCalledWith({
      multiple: false,
      filters: [
        {
          name: "cTrader Statement",
          extensions: ["html", "htm", "xlsx"],
        },
      ],
    });
    await waitFor(() =>
      expect(commandMocks.previewCTraderStatement).toHaveBeenCalledWith({
        path: "C:\\Imports\\statement.htm",
        accountId: "account-a",
        sourceTimezone: "Europe/Berlin",
      }),
    );
    expect(await screen.findByText("XAUUSD")).toBeTruthy();
    expect(
      screen.getByText(/Öffnungszeit sowie Kommission\/Swap fehlen/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Berichtswährung USD weicht von der Kontowährung EUR ab/,
      ),
    ).toBeTruthy();
  });

  it("commits only the verified preview to the same active account", async () => {
    const user = userEvent.setup();
    renderImporter();

    await user.click(
      screen.getByRole("button", { name: "cTrader-Datei auswählen" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Geprüfte cTrader-Trades übernehmen",
      }),
    );

    await waitFor(() =>
      expect(commandMocks.commitCTraderStatement).toHaveBeenCalledWith({
        runId: "run-a",
        accountId: "account-a",
      }),
    );
  });
});
