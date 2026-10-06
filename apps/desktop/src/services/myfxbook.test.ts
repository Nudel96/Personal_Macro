import { afterEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { api } from "./commands";

describe("Myfxbook command boundary", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });
  it("rejects browser mutations without making provider requests", async () => {
    await expect(
      api.myfxbookLogin({ email: "test@example.test", password: "test-only" }),
    ).rejects.toMatchObject({ code: "DESKTOP_REQUIRED" });
    await expect(api.myfxbookActivate("preview")).rejects.toMatchObject({
      code: "DESKTOP_REQUIRED",
    });
    await expect(api.myfxbookSync("account")).rejects.toMatchObject({
      code: "DESKTOP_REQUIRED",
    });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("passes account scope and preview handles to native commands", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    invoke.mockResolvedValue(undefined);
    await api.myfxbookPreview({
      authorizationId: "auth",
      accountId: "local",
      externalId: "remote",
      brokerTimezone: "UTC",
    });
    expect(invoke).toHaveBeenLastCalledWith("myfxbook_preview", {
      input: {
        authorizationId: "auth",
        accountId: "local",
        externalId: "remote",
        brokerTimezone: "UTC",
      },
    });
    await api.myfxbookSetEnabled("local", false);
    expect(invoke).toHaveBeenLastCalledWith("myfxbook_set_enabled", {
      accountId: "local",
      enabled: false,
    });
    await api.myfxbookActivate("preview");
    expect(invoke).toHaveBeenLastCalledWith("myfxbook_activate", {
      previewId: "preview",
    });
  });
});
