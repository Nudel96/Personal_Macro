import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("command runtime boundary", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    invoke.mockReset();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("imports and calls private commands without ever reading preview storage", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { api, isTauri, usesCommandBackend } = await import("./commands");
    expect(isTauri()).toBe(false);
    expect(usesCommandBackend()).toBe(true);
    await expect(api.bootstrap()).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    await expect(api.createTag({ name: "Private" })).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    await expect(api.tradeMedia("account", "trade")).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    await expect(api.exportTrades("account", "json")).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the HTTP command shape and fails closed after a network error", async () => {
    const { configurePrivateWebSession } = await import("./private-web-client");
    configurePrivateWebSession({
      authenticated: true,
      workspaceId: "test",
      revision: 1,
      csrfToken: "a".repeat(48),
      capabilities: ["get_trade"],
      writableCommands: [],
    });
    const { api } = await import("./commands");
    fetchMock.mockRejectedValue(new Error("network"));
    const get = vi.spyOn(Storage.prototype, "getItem");
    await expect(api.getTrade("account", "trade")).rejects.toMatchObject({
      code: "WEB_CONNECTION_FAILED",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      workspaceId: "test",
      command: "get_trade",
      args: { accountId: "account", id: "trade" },
    });
    expect(get).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the native runtime and Myfxbook arguments unchanged even with a hosted build flag", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    invoke.mockResolvedValue({ id: "native" });
    const get = vi.spyOn(Storage.prototype, "getItem");
    const { api, isTauri } = await import("./commands");
    expect(isTauri()).toBe(true);
    await expect(api.getTrade("account", "native")).resolves.toEqual({
      id: "native",
    });
    expect(invoke).toHaveBeenLastCalledWith("get_trade", {
      accountId: "account",
      id: "native",
    });
    await api.myfxbookSetEnabled("account", true);
    expect(invoke).toHaveBeenLastCalledWith("myfxbook_set_enabled", {
      accountId: "account",
      enabled: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps the explicit local preview available lazily", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const { api, usesCommandBackend } = await import("./commands");
    expect(usesCommandBackend()).toBe(false);
    expect(get).not.toHaveBeenCalled();
    await expect(api.bootstrap()).resolves.toMatchObject({
      databasePath: "Browser-Vorschau (localStorage)",
    });
    expect(get).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
