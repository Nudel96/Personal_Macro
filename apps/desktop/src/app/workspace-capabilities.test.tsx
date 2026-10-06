import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

describe("private route capabilities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  async function configure(capabilities: readonly string[]) {
    const { clearPrivateWebSession, configurePrivateWebSession } =
      await import("../services/private-web-client");
    clearPrivateWebSession();
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "route-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities,
      writableCommands: [],
    });
  }

  it("requires the journal and upload while keeping personal analysis commands optional", async () => {
    const { PRIVATE_WORKSPACE_COMMANDS, PRIVATE_OPTIONAL_ROUTE_COMMANDS } =
      await import("./workspace-capabilities");
    const rust = readFileSync("src-tauri/src/cloud_postgres/mod.rs", "utf8");
    const registered = rust.split("pub const COMMANDS:")[1].split("];", 1)[0];
    const commands = [
      ...registered.matchAll(/\("([a-z_]+)", (?:true|false)\)/g),
    ].map((match) => match[1]);
    const optionalPersonalCommands = [
      "list_atlas_notebook",
      "get_atlas_notebook_entry",
      "create_atlas_notebook_entry",
      "update_atlas_notebook_entry",
      "trash_atlas_notebook_entry",
      "get_atlas_last_context",
      "save_atlas_last_context",
      "list_central_bank_report_reads",
      "mark_central_bank_report_read",
    ];
    expect(PRIVATE_WORKSPACE_COMMANDS).toHaveLength(46);
    for (const command of optionalPersonalCommands) {
      expect(PRIVATE_WORKSPACE_COMMANDS).not.toContain(command);
      expect(Object.values(PRIVATE_OPTIONAL_ROUTE_COMMANDS).flat()).toContain(
        command,
      );
    }
    expect(
      new Set([
        ...PRIVATE_WORKSPACE_COMMANDS,
        ...optionalPersonalCommands,
        "myfxbook_connections",
        "myfxbook_login",
        "myfxbook_preview",
        "myfxbook_activate",
        "myfxbook_set_enabled",
        "myfxbook_disconnect",
        "import_trades_batch",
        "list_cloud_backups",
        "create_cloud_backup",
        "get_cloud_backup",
        "restore_cloud_backup",
        "get_learning_progress",
        "save_learning_progress",
      ]),
    ).toEqual(new Set([...commands, "upload_private_media"]));
  });

  it("checks the full route workflow and never enables native/provider pages from unrelated capabilities", async () => {
    const { canUseWorkspaceRoute } = await import("./workspace-capabilities");
    expect(canUseWorkspaceRoute("/trades")).toBe(false);
    await configure([
      "calculate_dashboard",
      "get_macro_snapshot",
      "create_backup",
    ]);
    expect(canUseWorkspaceRoute("/analytics")).toBe(true);
    expect(canUseWorkspaceRoute("/calendar")).toBe(false);
    expect(canUseWorkspaceRoute("/macro")).toBe(false);
    expect(canUseWorkspaceRoute("/import-export")).toBe(false);
    expect(canUseWorkspaceRoute("/unknown")).toBe(false);
  });

  it("keeps market snapshots optional and requires the complete seasonality read workflow", async () => {
    const { PRIVATE_WORKSPACE_COMMANDS, canUseWorkspaceRoute } =
      await import("./workspace-capabilities");
    expect(PRIVATE_WORKSPACE_COMMANDS).toHaveLength(46);
    await configure(PRIVATE_WORKSPACE_COMMANDS);
    expect(canUseWorkspaceRoute("/trades")).toBe(true);
    expect(canUseWorkspaceRoute("/learning")).toBe(true);
    expect(canUseWorkspaceRoute("/rates")).toBe(false);
    expect(canUseWorkspaceRoute("/seasonality")).toBe(false);
    await configure([
      ...PRIVATE_WORKSPACE_COMMANDS,
      "get_policy_rates",
      "get_seasonality",
      "analyze_seasonality",
    ]);
    expect(canUseWorkspaceRoute("/trades")).toBe(true);
    expect(canUseWorkspaceRoute("/rates")).toBe(true);
    expect(canUseWorkspaceRoute("/seasonality")).toBe(false);
    await configure([
      ...PRIVATE_WORKSPACE_COMMANDS,
      "get_seasonality",
      "get_seasonality_asset_detail",
      "analyze_seasonality",
    ]);
    expect(canUseWorkspaceRoute("/seasonality")).toBe(true);
    expect(canUseWorkspaceRoute("/rates")).toBe(false);
  });

  it("enables public weather only with its own capability and keeps the journal independent", async () => {
    const { PRIVATE_WORKSPACE_COMMANDS, canUseWorkspaceRoute } =
      await import("./workspace-capabilities");
    expect(PRIVATE_WORKSPACE_COMMANDS).not.toContain("get_weather_forecast");
    await configure(PRIVATE_WORKSPACE_COMMANDS);
    expect(canUseWorkspaceRoute("/trades")).toBe(true);
    expect(canUseWorkspaceRoute("/weather")).toBe(false);
    await configure([...PRIVATE_WORKSPACE_COMMANDS, "get_weather_forecast"]);
    expect(canUseWorkspaceRoute("/weather")).toBe(true);
    expect(canUseWorkspaceRoute("/trades")).toBe(true);
  });

  it.each([
    "/world-atlas",
    "/import-export",
    "/trades",
    "/rates",
    "/seasonality",
    "/weather",
  ])("does not mount an unavailable deep-linked page at %s", async (path) => {
    await configure(["get_bootstrap_data"]);
    const page = vi.fn();
    function SensitivePage() {
      page();
      return <p>Should not mount</p>;
    }
    const { WorkspaceRouteBoundary } =
      await import("./workspace-route-boundary");
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<WorkspaceRouteBoundary />}>
            <Route path={path} element={<SensitivePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", {
        name: "Dieser Bereich ist hier noch nicht verfügbar",
      }),
    ).toBeTruthy();
    expect(page).not.toHaveBeenCalled();
    expect(screen.queryByText("Should not mount")).toBeNull();
  });

  it("mounts supported journal pages and preserves desktop-only routes outside the private runtime", async () => {
    const { PRIVATE_WORKSPACE_COMMANDS, canUseWorkspaceRoute } =
      await import("./workspace-capabilities");
    await configure(PRIVATE_WORKSPACE_COMMANDS);
    expect(canUseWorkspaceRoute("/trades")).toBe(true);
    const { WorkspaceRouteBoundary } =
      await import("./workspace-route-boundary");
    render(
      <MemoryRouter initialEntries={["/trades"]}>
        <Routes>
          <Route element={<WorkspaceRouteBoundary />}>
            <Route path="trades" element={<p>Echte Journalansicht</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Echte Journalansicht")).toBeTruthy();
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    expect(canUseWorkspaceRoute("/world-atlas")).toBe(true);
    expect(canUseWorkspaceRoute("/import-export")).toBe(true);
  });
});
