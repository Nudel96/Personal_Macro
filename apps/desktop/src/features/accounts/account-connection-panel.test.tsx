import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openerMocks = vi.hoisted(() => ({ openUrl: vi.fn() }));
const commandMocks = vi.hoisted(() => ({
  brokerConnections: vi.fn(),
  detectMt5Account: vi.fn(),
  createAccountFromMt5: vi.fn(),
  cTraderAuthorization: vi.fn(),
  exchangeCTraderCode: vi.fn(),
  createAccountFromCTrader: vi.fn(),
  refreshBrokerConnection: vi.fn(),
  disconnectBrokerConnection: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openerMocks.openUrl,
}));
vi.mock("../../services/commands", () => ({
  api: commandMocks,
  isTauri: () => true,
}));

import { AccountConnectionPanel } from "./account-connection-panel";

function renderPanel(onAccountCreated = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onAccountCreated,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AccountConnectionPanel onAccountCreated={onAccountCreated} />
      </QueryClientProvider>,
    ),
  };
}

describe("AccountConnectionPanel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    commandMocks.brokerConnections.mockResolvedValue([]);
    commandMocks.cTraderAuthorization.mockResolvedValue({
      configured: true,
      authorizationUrl: "https://id.ctrader.com/authorize",
      redirectUri: "https://localhost/ctrader",
      message: "Bereit",
    });
    commandMocks.detectMt5Account.mockResolvedValue({
      login: "123456",
      server: "ICMarketsSC-Live",
      name: "Trader",
      company: "IC Markets",
      currency: "EUR",
      balance: 10_000,
      equity: 10_050,
      leverage: 500,
      observedAt: "2026-08-26T12:00:00Z",
    });
    commandMocks.createAccountFromMt5.mockResolvedValue({
      accountId: "account-icm",
      connection: {},
    });
    commandMocks.exchangeCTraderCode.mockResolvedValue({
      sessionId: "session-a",
      accounts: [
        {
          externalAccountId: "991122",
          accountLogin: "445566",
          brokerName: "IC Markets",
          environment: "live",
        },
      ],
    });
    commandMocks.createAccountFromCTrader.mockResolvedValue({
      accountId: "account-ctrader",
      connection: {},
    });
  });

  it("detects the active MT5 identity before creating a connected account", async () => {
    const user = userEvent.setup();
    const { onAccountCreated } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Aktives Konto erkennen" }),
    );
    expect(await screen.findByText(/Login 123456/)).toBeTruthy();
    expect(screen.getByText(/ICMarketsSC-Live/)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "MT5-Konto verbinden" }),
    );

    await waitFor(() =>
      expect(commandMocks.createAccountFromMt5).toHaveBeenCalledWith({
        terminalPath: undefined,
        name: "IC Markets MT5 123456",
        defaultRiskPercent: 1,
      }),
    );
    expect(onAccountCreated).toHaveBeenCalledWith("account-icm");
  });

  it("uses the cTrader accounts-only OAuth flow and creates the selected account", async () => {
    const user = userEvent.setup();
    const { onAccountCreated } = renderPanel();

    await user.click(screen.getByRole("button", { name: "cTrader" }));
    await user.click(
      await screen.findByRole("button", { name: "Bei cTrader anmelden" }),
    );
    expect(openerMocks.openUrl).toHaveBeenCalledWith(
      "https://id.ctrader.com/authorize",
    );

    await user.type(
      screen.getByLabelText("Autorisierungscode oder Weiterleitungsadresse"),
      "oauth-code",
    );
    await user.click(
      screen.getByRole("button", { name: "Freigegebene Konten laden" }),
    );
    expect(await screen.findByText(/IC Markets · 445566 · Live/)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "cTrader-Konto verbinden" }),
    );
    await waitFor(() =>
      expect(commandMocks.createAccountFromCTrader).toHaveBeenCalledWith({
        sessionId: "session-a",
        externalAccountId: "991122",
        name: "IC Markets cTrader 445566",
        defaultRiskPercent: 1,
      }),
    );
    expect(onAccountCreated).toHaveBeenCalledWith("account-ctrader");
  });
});
