import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaUrl } from "./media-url";

const convertFileSrc = vi.hoisted(() =>
  vi.fn((path: string) => `asset:${path}`),
);
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc }));
const id = "19c06f17-b6d3-48e4-a946-4c345a7abfb8";

describe("media image URLs", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it.each([
    "https://external.invalid/private.png",
    "data:image/png;base64,cHJpdmF0ZQ==",
    "blob:https://external.invalid/private",
    "C:\\private\\image.png",
    "//external.invalid/private.png",
  ])("ignores a stored path in private mode: %s", (absolutePath) => {
    expect(mediaUrl({ id, absolutePath })).toBe(`/api/media?id=${id}`);
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("does not even read the path when creating a private URL", () => {
    expect(
      mediaUrl({
        id,
        get absolutePath(): string {
          throw new Error("Private paths must not be read");
        },
      }),
    ).toBe(`/api/media?id=${id}`);
  });

  it.each([
    "",
    id.toUpperCase(),
    `${id}\n`,
    `${id}\r\n`,
    `${id}&url=x`,
    `../${id}`,
    "javascript:alert(1)",
  ])("rejects a noncanonical ID without a path fallback: %s", (invalidId) => {
    expect(
      mediaUrl({ id: invalidId, absolutePath: "data:image/png;base64,AA" }),
    ).toBe("");
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("keeps browser-preview data URLs unchanged", () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    const absolutePath = "data:image/png;base64,AA";
    expect(mediaUrl({ id: "preview", absolutePath })).toBe(absolutePath);
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("keeps native asset conversion even if the web build flag is set", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    const absolutePath = "C:\\private\\image.png";
    expect(mediaUrl({ id, absolutePath })).toBe(`asset:${absolutePath}`);
    expect(convertFileSrc).toHaveBeenCalledWith(absolutePath);
  });
});
