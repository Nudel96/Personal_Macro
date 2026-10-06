import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, MyfxbookConnection } from "../../types/domain";

const mocks = vi.hoisted(() => ({
  native: true,
  cloud: false,
  cloudAvailable: false,
  api: {
    myfxbookConnections: vi.fn(),
    myfxbookLogin: vi.fn(),
    myfxbookPreview: vi.fn(),
    myfxbookActivate: vi.fn(),
    myfxbookSync: vi.fn(),
    myfxbookSetEnabled: vi.fn(),
    myfxbookDisconnect: vi.fn(),
  },
}));
vi.mock("../../services/commands", () => ({
  api: mocks.api,
  isTauri: () => mocks.native,
}));
vi.mock("../../services/runtime-mode", () => ({
  isPrivateWeb: () => mocks.cloud,
}));
vi.mock("../../services/private-web-client", () => ({
  supportsPrivateWebCommand: () => mocks.cloudAvailable,
}));
import { MyfxbookConnectionPanel } from "./myfxbook-connection-panel";

const account: Account = {
  id: "local-1",
  name: "Test portfolio",
  broker: null,
  accountType: "personal",
  baseCurrency: "USD",
  initialBalanceMinor: 10000,
  currentBalanceMinor: 10500,
  defaultRiskPercent: 1,
  isArchived: false,
};
const summary = {
  newTrades: 1,
  closedTrades: 2,
  matchedTrades: 3,
  newCashflows: 0,
  balanceMinor: 10500,
  profitMinor: 500,
  openTrades: 1,
  historyCount: 4,
  warnings: ["Testhinweis"],
};
const connection: MyfxbookConnection = {
  accountId: account.id,
  externalId: "123456",
  externalName: "Test portfolio",
  currency: "USD",
  brokerTimezone: "UTC",
  pnlMode: "net",
  enabled: true,
  status: "connected",
  message: "Trades abgeglichen.",
  lastAttemptAt: null,
  lastSyncAt: null,
  lastProviderAt: null,
  balanceMinor: 10500,
  updatedAt: "2026-09-17T12:00:00Z",
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MyfxbookConnectionPanel account={account} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
async function logIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText("Myfxbook-E-Mail"),
    "test@example.test",
  );
  await user.type(
    screen.getByLabelText("Myfxbook-Passwort"),
    "test-only-password",
  );
  await user.click(
    screen.getByRole("button", { name: "Bei Myfxbook anmelden" }),
  );
}
describe("Myfxbook account connection", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.native = true;
    mocks.cloud = false;
    mocks.cloudAvailable = false;
    mocks.api.myfxbookConnections.mockResolvedValue([]);
    mocks.api.myfxbookLogin.mockResolvedValue({
      authorizationId: "login-1",
      accounts: [
        { id: "123456", name: account.name, currency: "USD" },
        { id: "other", name: "Euro", currency: "EUR" },
      ],
    });
    mocks.api.myfxbookPreview.mockResolvedValue({
      previewId: "preview-1",
      externalName: account.name,
      brokerTimezone: "UTC",
      summary,
    });
    mocks.api.myfxbookActivate.mockResolvedValue(summary);
  });
  it("offers protected cloud login and the agreed six-hour interval only with server support", async () => {
    mocks.native = false;
    mocks.cloud = true;
    mocks.cloudAvailable = true;
    const user = userEvent.setup();
    mount();
    expect(screen.getByText(/alle sechs Stunden/i)).toBeInTheDocument();
    await logIn(user);
    await user.click(
      screen.getByRole("button", { name: "Anderen Login verwenden" }),
    );
    expect(screen.getByLabelText("Myfxbook-Passwort")).toHaveValue("");
    expect(mocks.api.myfxbookLogin).toHaveBeenCalledWith({
      email: "test@example.test",
      password: "test-only-password",
    });
    expect(
      screen.queryByRole("button", { name: "Jetzt abgleichen" }),
    ).not.toBeInTheDocument();
  });
  it("keeps cloud login closed when encrypted server login is unavailable", () => {
    mocks.native = false;
    mocks.cloud = true;
    mount();
    expect(
      screen.queryByLabelText("Myfxbook-Passwort"),
    ).not.toBeInTheDocument();
    expect(mocks.api.myfxbookConnections).not.toHaveBeenCalled();
  });
  it("requires a timezone and preview before enabling the correct account", async () => {
    const user = userEvent.setup();
    const { client } = mount();
    await logIn(user);
    await screen.findByRole("button", { name: "Verbindung prüfen" });
    expect(
      screen.getByRole("button", { name: "Verbindung prüfen" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("Brokerzeitzone"), "UTC");
    await user.click(screen.getByRole("button", { name: "Verbindung prüfen" }));
    expect(mocks.api.myfxbookPreview).toHaveBeenCalledWith({
      authorizationId: "login-1",
      accountId: "local-1",
      externalId: "123456",
      brokerTimezone: "UTC",
    });
    const activate = await screen.findByRole("button", {
      name: "Übernehmen und Automatik aktivieren",
    });
    expect(mocks.api.myfxbookActivate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("option", { name: "Euro · other · EUR" }),
    ).toBeDisabled();
    await user.click(activate);
    await waitFor(() =>
      expect(mocks.api.myfxbookActivate).toHaveBeenCalledWith("preview-1"),
    );
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("test-only-password");
  });
  it("clears the password immediately even when login fails", async () => {
    let rejectLogin: (error: unknown) => void = () => {};
    mocks.api.myfxbookLogin.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectLogin = reject;
        }),
    );
    const user = userEvent.setup();
    mount();
    await logIn(user);
    expect(screen.getByLabelText("Myfxbook-Passwort")).toHaveValue("");
    rejectLogin({ message: "Bitte erneut anmelden." });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte erneut anmelden.",
    );
    expect(screen.getByLabelText("Myfxbook-Passwort")).toHaveValue("");
  });
  it("invalidates a preview when the timezone changes", async () => {
    const user = userEvent.setup();
    mount();
    await logIn(user);
    await user.type(await screen.findByLabelText("Brokerzeitzone"), "UTC");
    await user.click(screen.getByRole("button", { name: "Verbindung prüfen" }));
    await screen.findByRole("button", {
      name: "Übernehmen und Automatik aktivieren",
    });
    await user.clear(screen.getByLabelText("Brokerzeitzone"));
    expect(
      screen.queryByRole("button", {
        name: "Übernehmen und Automatik aktivieren",
      }),
    ).not.toBeInTheDocument();
  });
  it("pauses the selected connection and requires review after a conflict", async () => {
    mocks.api.myfxbookConnections.mockResolvedValue([connection]);
    mocks.api.myfxbookSetEnabled.mockImplementation(async () => {
      mocks.api.myfxbookConnections.mockResolvedValue([
        {
          ...connection,
          enabled: false,
          status: "action_required",
          message: "Historie prüfen.",
        },
      ]);
    });
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Automatik pausieren" }),
    );
    expect(mocks.api.myfxbookSetEnabled).toHaveBeenCalledWith("local-1", false);
    expect(
      await screen.findByRole("button", { name: "Automatik fortsetzen" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Historie prüfen.");
  });
  it("does not expose a credential form or simulate synchronization in the browser", () => {
    mocks.native = false;
    mount();
    expect(
      screen.queryByLabelText("Myfxbook-Passwort"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Öffne die Desktop-App, um Myfxbook sicher zu verbinden.",
      ),
    ).toBeInTheDocument();
    expect(mocks.api.myfxbookConnections).not.toHaveBeenCalled();
  });
});
