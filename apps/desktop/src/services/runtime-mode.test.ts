import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateWeb } from "./runtime-mode";

describe("private web runtime selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("selects hosted browser mode only for the explicit build flag", () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    expect(isPrivateWeb()).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1"])(
    "preserves local browser behavior for %s",
    (flag) => {
      vi.stubEnv("VITE_PRIVATE_WEB", flag);
      expect(isPrivateWeb()).toBe(false);
    },
  );

  it("always preserves the native Tauri runtime", () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    expect(isPrivateWeb()).toBe(false);
  });
});
