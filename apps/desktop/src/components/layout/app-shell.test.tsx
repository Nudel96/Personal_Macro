import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "../../stores/ui-store";
import { AppShell } from "./app-shell";
import {
  PRIVATE_OPTIONAL_ROUTE_COMMANDS,
  PRIVATE_WORKSPACE_COMMANDS,
} from "../../app/workspace-capabilities";
import {
  clearPrivateWebSession,
  configurePrivateWebSession,
} from "../../services/private-web-client";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { settings: { appearance: { density: "compact" } } },
  }),
}));
vi.mock("../../services/commands", () => ({
  api: { settings: vi.fn() },
  isTauri: () => false,
}));
vi.mock("./command-palette", () => ({ CommandPalette: () => null }));
vi.mock("../../features/trades/quick-trade-dialog", () => ({
  QuickTradeDialog: () => null,
}));
vi.mock("../../features/trades/guided-trade-dialog", () => ({
  GuidedTradeDialog: () => null,
}));
vi.mock("../../features/accounts/journal-account-bar", () => ({
  JournalAccountBar: () => null,
}));

let mobile = true;
let mediaListeners: Set<() => void>;

beforeEach(() => {
  mobile = true;
  mediaListeners = new Set();
  useUiStore.setState({
    sidebarCollapsed: false,
    commandOpen: false,
    quickTradeOpen: false,
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: mobile,
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  }));
  vi.stubGlobal("scrollTo", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  clearPrivateWebSession();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderShell() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<h1>Startseite</h1>} />
          <Route path="/world-atlas" element={<h1>Atlasinhalt</h1>} />
          <Route path="/macro" element={<h1>Macroinhalt</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell mobile navigation", () => {
  it("macht freigegebene Cloudanalysen im Handymenü erreichbar und verbirgt unvollständige Bereiche", async () => {
    const user = userEvent.setup();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "shell-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities: [
        ...PRIVATE_WORKSPACE_COMMANDS,
        ...PRIVATE_OPTIONAL_ROUTE_COMMANDS["/macro"],
      ],
      writableCommands: [],
    });
    renderShell();
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    const navigation = screen.getByRole("navigation", { name: "Marktkontext" });
    expect(
      within(navigation).getByRole("link", { name: /Macro Heatmap/ }),
    ).toBeTruthy();
    expect(
      within(navigation).queryByRole("link", { name: /COT Analyse/ }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole("link", { name: /Weltatlas/ }),
    ).toBeNull();
    await user.click(
      within(navigation).getByRole("link", { name: /Macro Heatmap/ }),
    );
    expect(screen.getByRole("heading", { name: "Macroinhalt" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("shows only connected private journal routes and truthful storage status", () => {
    mobile = false;
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "shell-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities: [...PRIVATE_WORKSPACE_COMMANDS],
      writableCommands: [],
    });
    renderShell();
    expect(screen.getByRole("link", { name: "Trades" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Medien" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learning" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Marktkontext" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Import & Export" })).toBeNull();
    expect(screen.getByText("Privat verbunden")).toBeTruthy();
    expect(screen.getByText("Dauerhafter Cloudspeicher")).toBeTruthy();
    expect(screen.queryByText("Browser-Vorschau")).toBeNull();
  });
  it("öffnet alle Bereiche im Dialog, schließt bei Escape und gibt den Fokus zurück", async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", { name: "Menü öffnen" });
    expect(
      screen.queryByRole("navigation", { name: "Tradingjournal" }),
    ).toBeNull();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(
      within(dialog).getByRole("navigation", { name: "Tradingjournal" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("navigation", { name: "Marktkontext" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("navigation", { name: "Daten & System" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("schließt nach einem Seitenwechsel und lässt das Ziel direkt bedienen", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    await user.click(screen.getByRole("link", { name: /Weltatlas/ }));
    expect(screen.getByRole("heading", { name: "Atlasinhalt" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Menü öffnen" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("bewahrt den Desktopzustand beim Wechsel zur mobilen Navigation", async () => {
    mobile = false;
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(
      screen.getByRole("button", { name: "Sidebar einklappen" }),
    );
    expect(container.querySelector("aside.sidebar.is-collapsed")).toBeTruthy();

    act(() => {
      mobile = true;
      for (const listener of mediaListeners) listener();
    });
    expect(container.querySelector("aside.sidebar")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    expect(screen.getByRole("dialog").classList.contains("is-collapsed")).toBe(
      false,
    );
    await user.click(screen.getByRole("button", { name: "Menü schließen" }));

    act(() => {
      mobile = false;
      for (const listener of mediaListeners) listener();
    });
    expect(container.querySelector("aside.sidebar.is-collapsed")).toBeTruthy();
  });
});
