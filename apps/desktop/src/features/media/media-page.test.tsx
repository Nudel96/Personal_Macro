import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaRecord } from "../../types/domain";

const mocks = vi.hoisted(() => ({
  native: false,
  api: {
    media: vi.fn(),
    uploadMedia: vi.fn(),
    importMediaPath: vi.fn(),
    mediaAnnotation: vi.fn(),
    saveMediaAnnotation: vi.fn(),
  },
  open: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset:${path}`),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/commands", () => ({
  api: mocks.api,
  isTauri: () => mocks.native,
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: mocks.convertFileSrc,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Arrow: () => null,
  Circle: () => null,
  Image: () => null,
  Line: () => null,
  Rect: () => null,
  Text: () => null,
}));
import { MediaPage } from "./media-page";

const media: MediaRecord = {
  id: "19c06f17-b6d3-48e4-a946-4c345a7abfb8",
  relativePath: "private/image.png",
  absolutePath: "https://untrusted.invalid/private.png",
  originalFilename: "Chart.png",
  mimeType: "image/png",
  sizeBytes: 12,
  sha256: "a".repeat(64),
  createdAt: "2026-09-24T10:00:00Z",
  tradeCount: 0,
};

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MediaPage />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

describe("private media page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    localStorage.clear();
    mocks.native = false;
    mocks.api.media.mockResolvedValue([]);
    mocks.api.mediaAnnotation.mockResolvedValue(null);
    mocks.api.uploadMedia.mockResolvedValue(media);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("uploads the original privately, stays busy and refreshes the media query", async () => {
    let finish!: (value: MediaRecord) => void;
    mocks.api.uploadMedia.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { client } = mount();
    const input = await screen.findByLabelText("Bilddatei auswählen");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    const original = new File(["original bytes"], "Chart.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [original] } });
    expect(mocks.api.uploadMedia).toHaveBeenCalledWith(original);
    expect(screen.getByRole("button", { name: "Importiert …" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Screenshot importieren" }),
    ).toBeDisabled();
    expect(input).toBeDisabled();
    await act(async () => {
      finish(media);
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Datei importieren" }),
      ).toBeEnabled(),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["media"] });
    expect(mocks.toast.success).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(mocks.api.importMediaPath).not.toHaveBeenCalled();
  });

  it("shows the transport error and does not fall back to local storage", async () => {
    mocks.api.uploadMedia.mockRejectedValueOnce({
      code: "WEB_WRITE_UNCERTAIN",
      message: "Lade die Seite neu und prüfe den gespeicherten Stand.",
    });
    const set = vi.spyOn(Storage.prototype, "setItem");
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
    mount();
    const input = await screen.findByLabelText("Bilddatei auswählen");
    fireEvent.change(input, {
      target: {
        files: [new File(["bytes"], "Chart.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Lade die Seite neu und prüfe den gespeicherten Stand.",
      ),
    );
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.api.uploadMedia).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(input).toBeEnabled();
  });

  it("uses the same private URL for the card and annotation image", async () => {
    mocks.api.media.mockResolvedValue([media]);
    const images: Array<{ src: string; onload: (() => void) | null }> = [];
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        onload = null;
        constructor() {
          images.push(this);
        }
      },
    );
    mount();
    expect(
      await screen.findByRole("img", { name: media.originalFilename }),
    ).toHaveAttribute("src", `/api/media?id=${media.id}`);
    fireEvent.click(
      screen.getByRole("button", { name: "Öffnen & annotieren" }),
    );
    await screen.findByRole("dialog");
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe(`/api/media?id=${media.id}`);
    expect(mocks.convertFileSrc).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain("untrusted.invalid");
  });

  it("does not render a private media URL for a malformed media ID", async () => {
    mocks.api.media.mockResolvedValue([{ ...media, id: "../private.png" }]);
    mount();
    await screen.findByRole("button", { name: "Öffnen & annotieren" });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("untrusted.invalid");
  });

  it("preserves the browser-preview data URL import", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    mount();
    const input = await screen.findByLabelText("Bilddatei auswählen");
    expect(input).toHaveAttribute("accept", "image/*");
    fireEvent.change(input, {
      target: {
        files: [new File(["preview"], "Preview.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(localStorage.getItem("personal-macro:browser-media:v1")).toContain(
        "Preview.png",
      ),
    );
    const rows = JSON.parse(
      localStorage.getItem("personal-macro:browser-media:v1")!,
    );
    expect(rows[0].absolutePath).toMatch(/^data:image\/png;base64,/);
    expect(mocks.api.uploadMedia).not.toHaveBeenCalled();
  });

  it("preserves native file selection and path import", async () => {
    mocks.native = true;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    mocks.open.mockResolvedValue("C:\\screenshots\\Chart.png");
    mocks.api.importMediaPath.mockResolvedValue(media);
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Datei importieren" }),
    );
    await waitFor(() =>
      expect(mocks.api.importMediaPath).toHaveBeenCalledWith(
        "C:\\screenshots\\Chart.png",
      ),
    );
    expect(mocks.api.uploadMedia).not.toHaveBeenCalled();
  });
});
