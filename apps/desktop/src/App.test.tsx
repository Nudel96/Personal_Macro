import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn() }));

vi.mock("./workspace-app", () => {
  workspace.load();
  return {
    default: () => {
      workspace.render();
      return <main>Bestehender Workspace</main>;
    },
  };
});

function session(capabilities: readonly string[]) {
  return new Response(
    JSON.stringify({
      authenticated: true,
      workspaceId: "private-app-test",
      revision: 0,
      csrfToken: "s".repeat(48),
      capabilities,
      writableCommands: [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

describe("private hosted workspace boundary", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    window.history.replaceState(null, "", "/");
  });

  it.each(["/", "/trades", "/world-atlas", "/settings"])(
    "keeps %s closed without importing workspace or reading browser data when the backend is unavailable",
    async (path) => {
      vi.stubEnv("VITE_PRIVATE_WEB", "true");
      window.history.replaceState(null, "", path);
      fetchMock.mockResolvedValueOnce(
        new Response("unavailable", { status: 503 }),
      );
      const storageRead = vi.spyOn(Storage.prototype, "getItem");
      const { default: App } = await import("./App");
      render(<App />);

      expect(
        await screen.findByRole("heading", {
          name: "Private Browser-Version wird eingerichtet",
        }),
      ).toBeInTheDocument();
      expect(workspace.load).not.toHaveBeenCalled();
      expect(workspace.render).not.toHaveBeenCalled();
      expect(storageRead).not.toHaveBeenCalled();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    },
  );

  it("imports the real workspace only after the complete journal and media handshake", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { PRIVATE_WORKSPACE_COMMANDS } =
      await import("./app/workspace-capabilities");
    const { default: App } = await import("./App");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "erfolgreicher Anmeldung",
    );
    expect(workspace.load).not.toHaveBeenCalled();
    await act(async () => {
      finish(session(PRIVATE_WORKSPACE_COMMANDS));
    });
    expect(
      await screen.findByText("Bestehender Workspace"),
    ).toBeInTheDocument();
    expect(workspace.load).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      }),
    );
  });

  it("keeps a journal-only backend closed when private media upload is missing", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    const { PRIVATE_WORKSPACE_COMMANDS } =
      await import("./app/workspace-capabilities");
    fetchMock.mockResolvedValueOnce(
      session(
        PRIVATE_WORKSPACE_COMMANDS.filter(
          (command) => command !== "upload_private_media",
        ),
      ),
    );
    const { default: App } = await import("./App");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "noch nicht vollständig eingerichtet",
    );
    expect(workspace.load).not.toHaveBeenCalled();
  });

  it("removes the real workspace when authentication expires", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    const { PRIVATE_WORKSPACE_COMMANDS } =
      await import("./app/workspace-capabilities");
    fetchMock.mockResolvedValueOnce(session(PRIVATE_WORKSPACE_COMMANDS));
    const { default: App } = await import("./App");
    render(<App />);
    await screen.findByText("Bestehender Workspace");
    const { privateWebCall } = await import("./services/private-web-client");
    fetchMock.mockResolvedValueOnce(new Response("denied", { status: 401 }));
    await act(async () => {
      await expect(privateWebCall("get_settings")).rejects.toMatchObject({
        code: "WEB_AUTH_REQUIRED",
      });
    });
    expect(
      await screen.findByRole("heading", {
        name: "Private Anmeldung erforderlich",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bestehender Workspace")).not.toBeInTheDocument();
  });

  it("preserves the existing local development workspace", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", undefined);
    const { default: App } = await import("./App");
    render(<App />);
    expect(
      await screen.findByText("Bestehender Workspace"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves Tauri even when the hosted build flag is set", async () => {
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    const { default: App } = await import("./App");
    render(<App />);
    expect(
      await screen.findByText("Bestehender Workspace"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
