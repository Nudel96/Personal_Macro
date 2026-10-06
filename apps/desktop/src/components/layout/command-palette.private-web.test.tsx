import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_WORKSPACE_COMMANDS } from "../../app/workspace-capabilities";
import {
  clearPrivateWebSession,
  configurePrivateWebSession,
} from "../../services/private-web-client";
import { useUiStore } from "../../stores/ui-store";
import { CommandPalette } from "./command-palette";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("../../services/commands", () => ({ api: { listTrades: vi.fn() } }));
vi.mock("../../features/accounts/journal-account-context", () => ({
  useJournalAccount: () => ({
    status: "ready",
    selectedAccountId: "test-account",
  }),
}));

function Workspace() {
  const location = useLocation();
  return (
    <>
      <CommandPalette />
      <p data-testid="path">{location.pathname}</p>
    </>
  );
}

describe("private command palette", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    useUiStore.setState({ commandOpen: true, quickTradeOpen: false });
  });
  afterEach(() => {
    cleanup();
    clearPrivateWebSession();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("omits unavailable routes while opening a supported journal route", () => {
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "palette-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities: [...PRIVATE_WORKSPACE_COMMANDS],
      writableCommands: [],
    });
    render(
      <MemoryRouter>
        <Workspace />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("option", { name: "Weltatlas öffnen" }),
    ).toBeNull();
    expect(
      screen.queryByRole("option", { name: "Import & Export öffnen" }),
    ).toBeNull();
    expect(
      screen.getByRole("option", { name: "Neues Setup anlegen" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Medien öffnen" }));
    expect(screen.getByTestId("path").textContent).toBe("/media");
    expect(useUiStore.getState().commandOpen).toBe(false);
  });

  it("keeps all existing navigation choices in the local runtime", () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    render(
      <MemoryRouter>
        <Workspace />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("option", { name: "Weltatlas öffnen" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Import & Export öffnen" }),
    ).toBeTruthy();
  });
});
