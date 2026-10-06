import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("private workspace UI memory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  async function session() {
    const client = await import("../services/private-web-client");
    client.configurePrivateWebSession({
      authenticated: true,
      workspaceId: "ui-memory-test",
      revision: 2,
      csrfToken: "s".repeat(48),
      capabilities: ["get_bootstrap_data"],
      writableCommands: [],
    });
    return client;
  }

  it("neither reads preview identifiers nor writes private identifiers or dialog state to browser storage", async () => {
    localStorage.setItem(
      "personal-macro:ui",
      JSON.stringify({
        version: 1,
        state: {
          selectedJournalAccountId: "preview-account",
          globalSetupIds: ["preview-setup"],
          quickTradeOpen: true,
        },
      }),
    );
    await session();
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { useUiStore } = await import("./ui-store");
    expect(useUiStore.getState().selectedJournalAccountId).toBeNull();
    expect(useUiStore.getState().quickTradeOpen).toBe(false);
    useUiStore.getState().setSelectedJournalAccountId("cloud-account");
    useUiStore.getState().setGlobalFilters({ globalSetupIds: ["cloud-setup"] });
    useUiStore.getState().setQuickTradeOpen(true);
    expect(useUiStore.getState().selectedJournalAccountId).toBe(
      "cloud-account",
    );
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("discards account, filters and open forms when private authorization ends", async () => {
    const client = await session();
    const { useUiStore } = await import("./ui-store");
    useUiStore.getState().setSelectedJournalAccountId("old-account");
    useUiStore.getState().setGlobalFilters({
      globalSetupIds: ["old-setup"],
      globalDateFrom: "2026-01-01",
    });
    useUiStore.getState().setGuidedTradeOpen(true);
    client.clearPrivateWebSession();
    expect(useUiStore.getState()).toMatchObject({
      selectedJournalAccountId: null,
      globalSetupIds: [],
      guidedTradeOpen: false,
    });
    expect(useUiStore.getState().globalDateFrom).toBeUndefined();
    client.configurePrivateWebSession({
      authenticated: true,
      workspaceId: "new-workspace",
      revision: 0,
      csrfToken: "n".repeat(48),
      capabilities: ["get_bootstrap_data"],
      writableCommands: [],
    });
    expect(useUiStore.getState().selectedJournalAccountId).toBeNull();
    useUiStore.getState().setSelectedJournalAccountId("new-account");
    expect(useUiStore.getState().selectedJournalAccountId).toBe("new-account");
  });

  it("preserves existing local browser preference persistence", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    localStorage.setItem(
      "personal-macro:ui",
      JSON.stringify({
        version: 1,
        state: { selectedJournalAccountId: "local-account" },
      }),
    );
    const { useUiStore } = await import("./ui-store");
    expect(useUiStore.getState().selectedJournalAccountId).toBe(
      "local-account",
    );
    useUiStore.getState().setSelectedJournalAccountId("local-next");
    expect(
      JSON.parse(localStorage.getItem("personal-macro:ui")!).state
        .selectedJournalAccountId,
    ).toBe("local-next");
  });
});
