import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as commands from "../../services/commands";
import * as runtime from "../../services/runtime-mode";
import { useUiStore } from "../../stores/ui-store";
import type { Account } from "../../types/domain";
import { AccountSettings } from "./account-settings";

const account: Account = {
  id: "test-cloud-account",
  name: "Webjournal",
  accountType: "personal",
  baseCurrency: "EUR",
  initialBalanceMinor: 100000,
  currentBalanceMinor: 100000,
  defaultRiskPercent: 1,
  isArchived: false,
};
const clients: QueryClient[] = [];

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AccountSettings accounts={[]} />
    </QueryClientProvider>,
  );
}

describe("private web account settings", () => {
  beforeEach(() => {
    vi.spyOn(runtime, "isPrivateWeb").mockReturnValue(true);
    vi.spyOn(commands.api, "brokerConnections").mockResolvedValue([]);
    vi.spyOn(commands.api, "cTraderAuthorization").mockRejectedValue(
      new Error("Native only"),
    );
    vi.spyOn(commands.api, "detectMt5Account").mockRejectedValue(
      new Error("Native only"),
    );
    vi.spyOn(commands.api, "saveAccount").mockResolvedValue(account);
    useUiStore.setState({ selectedJournalAccountId: null });
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.restoreAllMocks();
  });

  it("keeps manual account creation working without mounting broker commands", async () => {
    mount();
    expect(
      screen.queryByRole("button", { name: "MT5 / cTrader verbinden" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Aktives Konto erkennen" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kontoname"), {
      target: { value: "Webjournal" },
    });
    fireEvent.change(screen.getByLabelText("Startkapital (EUR)"), {
      target: { value: "1000,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto anlegen" }));
    await waitFor(() =>
      expect(commands.api.saveAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Webjournal",
          initialBalanceMinor: 100000,
          baseCurrency: "EUR",
        }),
      ),
    );
    expect(commands.api.brokerConnections).not.toHaveBeenCalled();
    expect(commands.api.cTraderAuthorization).not.toHaveBeenCalled();
    expect(commands.api.detectMt5Account).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "preserves the broker tab outside private web (native: %s)",
    async (native) => {
      vi.mocked(runtime.isPrivateWeb).mockReturnValue(false);
      vi.spyOn(commands, "isTauri").mockReturnValue(native);
      mount();
      fireEvent.click(
        screen.getByRole("button", { name: "MT5 / cTrader verbinden" }),
      );
      await waitFor(() =>
        expect(commands.api.brokerConnections).toHaveBeenCalledOnce(),
      );
      expect(
        screen.getByText("Bestehendes Broker-Konto verbinden"),
      ).toBeInTheDocument();
      expect(
        screen
          .getByRole("button", { name: "Aktives Konto erkennen" })
          .hasAttribute("disabled"),
      ).toBe(!native);
    },
  );
});
