import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/commands";
import * as runtime from "../../services/runtime-mode";
import type { BootstrapData } from "../../types/domain";
import { SettingsPage } from "./settings-page";

const bootstrap: BootstrapData = {
  accounts: [],
  strategies: [],
  setups: [],
  tags: [],
  emotions: [],
  mistakes: [],
  databasePath: "desktop-only-database-path",
  appDataPath: "desktop-only-app-data-path",
  calculationVersion: "test",
};
const clients: QueryClient[] = [];

function mount(section: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/settings?section=${section}`]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("private web settings", () => {
  beforeEach(() => {
    vi.spyOn(runtime, "isPrivateWeb").mockReturnValue(true);
    vi.spyOn(api, "bootstrap").mockResolvedValue(bootstrap);
    vi.spyOn(api, "settings").mockResolvedValue({
      settings: { backup: { automatic: true, retention: 10 } },
    });
    vi.spyOn(api, "updateSetting").mockResolvedValue();
    vi.spyOn(api, "createBackup").mockRejectedValue(new Error("Native only"));
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.restoreAllMocks();
  });

  it("never exposes desktop backup controls or local paths in cloud settings", async () => {
    mount("data");
    expect(await screen.findByText("Privater Webspeicher")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Jetzt erstellen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Speichern" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(bootstrap.databasePath)).not.toBeInTheDocument();
    expect(screen.queryByText(bootstrap.appDataPath)).not.toBeInTheDocument();
    expect(screen.queryByText(/SQLite/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Privatsphäre" }));
    expect(screen.getByText("Geschützte Anmeldung")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/kein externer Speicher/),
    ).not.toBeInTheDocument();
    expect(api.createBackup).not.toHaveBeenCalled();
    expect(api.updateSetting).not.toHaveBeenCalled();
  });

  it("still saves appearance and analytics through the real command facade", async () => {
    mount("appearance");
    const density = await screen.findByRole("combobox", {
      name: "Informationsdichte",
    });
    fireEvent.change(density, { target: { value: "comfortable" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.updateSetting).toHaveBeenCalledWith("appearance", {
        theme: "dark",
        density: "comfortable",
        sidebarCollapsed: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    fireEvent.change(screen.getAllByRole("spinbutton")[0], {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.updateSetting).toHaveBeenCalledWith("analytics", {
        minimumRankingSample: 15,
        minimumCorrelationSample: 20,
        rollingWindow: 20,
      }),
    );
    expect(api.createBackup).not.toHaveBeenCalled();
  });

  it("does not allow saving fallback defaults when settings could not be read", async () => {
    vi.mocked(api.settings).mockRejectedValue(new Error("Unavailable"));
    mount("appearance");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Einstellungen konnten nicht geladen werden",
    );
    expect(
      screen.queryByRole("button", { name: "Speichern" }),
    ).not.toBeInTheDocument();
    expect(api.updateSetting).not.toHaveBeenCalled();
  });
});
