import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPrivateWebSession,
  configurePrivateWebSession,
  privateWebCall,
} from "../../services/private-web-client";
import {
  captureDefaults,
  captureDraftKey,
  readCaptureDraft,
} from "./trade-capture";
import {
  readTradeDraft,
  removeTradeDraft,
  writeTradeDraft,
} from "./trade-draft-storage";

const guidedKey = "personal-macro:guided-trade-draft:v1";

function startSession(workspaceId = "test-workspace") {
  configurePrivateWebSession({
    authenticated: true,
    workspaceId,
    revision: 0,
    csrfToken: "a".repeat(32),
    capabilities: ["get_bootstrap_data"],
    writableCommands: [],
  });
}

describe("trade form draft persistence", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    clearPrivateWebSession();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    clearPrivateWebSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("keeps private quick and guided drafts in memory without touching browser storage", () => {
    startSession();
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const quick = JSON.stringify({
      values: { ...captureDefaults(), instrument: "EURUSD", netPnl: "-" },
      hadScreenshot: false,
    });
    writeTradeDraft(captureDraftKey("a"), "a", quick);
    writeTradeDraft(guidedKey, "a", '{"instrument":"XAUUSD"}');

    expect(readCaptureDraft("a")).toMatchObject({
      values: { instrument: "EURUSD", netPnl: "-" },
    });
    expect(readTradeDraft(guidedKey, "a")).toBe('{"instrument":"XAUUSD"}');
    removeTradeDraft(captureDraftKey("a"), "a");
    expect(readCaptureDraft("a")).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("separates private guided drafts by account even though the legacy key is shared", () => {
    startSession();
    writeTradeDraft(guidedKey, "a", "draft a");
    writeTradeDraft(guidedKey, "b", "draft b");
    expect(readTradeDraft(guidedKey, "a")).toBe("draft a");
    expect(readTradeDraft(guidedKey, "b")).toBe("draft b");
    expect(readTradeDraft(guidedKey, "c")).toBeNull();
    removeTradeDraft(guidedKey, "a");
    expect(readTradeDraft(guidedKey, "b")).toBe("draft b");
  });

  it("neither reads nor replaces old preview drafts in private mode", () => {
    localStorage.setItem(guidedKey, "existing preview draft");
    startSession();
    expect(readTradeDraft(guidedKey, "a")).toBeNull();
    writeTradeDraft(guidedKey, "a", "private draft");
    removeTradeDraft(guidedKey, "a");
    expect(localStorage.getItem(guidedKey)).toBe("existing preview draft");
  });

  it("discards drafts when the session ends, including a new login to the same workspace", () => {
    startSession();
    writeTradeDraft(guidedKey, "a", "private draft");
    clearPrivateWebSession();
    expect(readTradeDraft(guidedKey, "a")).toBeNull();
    expect(() => writeTradeDraft(guidedKey, "a", "late draft")).toThrow(
      "Die private Sitzung ist nicht aktiv.",
    );
    startSession();
    expect(readTradeDraft(guidedKey, "a")).toBeNull();
  });

  it("does not carry draft content into another workspace", () => {
    startSession("workspace-one");
    writeTradeDraft(guidedKey, "a", "private draft");
    clearPrivateWebSession();
    startSession("workspace-two");
    expect(readTradeDraft(guidedKey, "a")).toBeNull();
  });

  it.each([401, 403])(
    "clears drafts when the server refuses access with HTTP %s",
    async (status) => {
      startSession();
      writeTradeDraft(guidedKey, "a", "private draft");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      await expect(privateWebCall("get_bootstrap_data")).rejects.toMatchObject({
        code: "WEB_AUTH_REQUIRED",
      });
      startSession();
      expect(readTradeDraft(guidedKey, "a")).toBeNull();
    },
  );

  it("requires an explicit account before keeping private drafts", () => {
    startSession();
    expect(readTradeDraft(guidedKey, "")).toBeNull();
    expect(() => writeTradeDraft(guidedKey, " ", "draft")).toThrow();
  });

  it.each(["preview", "native"])(
    "preserves localStorage drafts in the %s runtime",
    (runtime) => {
      if (runtime === "native") {
        Object.defineProperty(window, "__TAURI_INTERNALS__", {
          value: {},
          configurable: true,
        });
      } else vi.stubEnv("VITE_PRIVATE_WEB", "false");

      localStorage.setItem(guidedKey, "legacy draft");
      expect(readTradeDraft(guidedKey, "a")).toBe("legacy draft");
      writeTradeDraft(guidedKey, "a", "updated draft");
      expect(localStorage.getItem(guidedKey)).toBe("updated draft");
      clearPrivateWebSession();
      expect(readTradeDraft(guidedKey, "a")).toBe("updated draft");
      removeTradeDraft(guidedKey, "a");
      expect(localStorage.getItem(guidedKey)).toBeNull();
    },
  );
});
