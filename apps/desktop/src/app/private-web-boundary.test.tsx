import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { lazy } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function session(capabilities = ["get_bootstrap_data", "get_settings"]) {
  return {
    authenticated: true,
    workspaceId: "private-test",
    revision: 1,
    csrfToken: "s".repeat(48),
    capabilities,
    writableCommands: [],
  };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("prepared private workspace handshake", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const load = vi.fn();
  const unmount = vi.fn();
  const requiredCommands = ["get_bootstrap_data", "get_settings"];

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    load.mockReset();
    unmount.mockReset();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mount() {
    const { PrivateWebBoundary } = await import("./private-web-boundary");
    const { Suspense } = await import("react");
    const Workspace = lazy(async () => {
      load();
      return { default: () => <main>Private Journalinhalte</main> };
    });
    render(
      <PrivateWebBoundary
        requiredCommands={requiredCommands}
        onSessionEnd={unmount}
      >
        <Suspense fallback="Lädt …">
          <Workspace />
        </Suspense>
      </PrivateWebBoundary>,
    );
  }

  it("does not import workspace children or browser storage before a complete validated session", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    expect(screen.getByRole("status")).toHaveTextContent(
      "erst nach erfolgreicher Anmeldung",
    );
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      finish(response(session()));
    });
    expect(
      await screen.findByText("Private Journalinhalte"),
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      }),
    );
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("offers an explicit retry after eight seconds and ignores the superseded response", async () => {
    vi.useFakeTimers();
    const completions: Array<(value: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => completions.push(resolve)),
    );
    await mount();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(8_000));
    expect(screen.getByRole("status")).toHaveTextContent(
      "wird weiterhin geprüft",
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Verbindung erneut prüfen" }),
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => {
      completions[0](response(session()));
    });
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "erst nach erfolgreicher Anmeldung",
    );
    await act(async () => {
      completions[1](response(session()));
    });
    expect(screen.getByText("Private Journalinhalte")).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it("leaves the loading screen at thirty seconds even if fetch never rejects on abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    await mount();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "hat zu lange gedauert",
    );
    expect(
      screen.getByRole("button", { name: "Verbindung erneut prüfen" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("shows delayed loading help when returning before the deadline with paused timers", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-09-25T12:00:00Z");
    vi.setSystemTime(startedAt);
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    await mount();
    await act(async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 12_000));
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "wird weiterhin geprüft",
    );
    expect(
      screen.getByRole("button", { name: "Verbindung erneut prüfen" }),
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    [401, "Private Anmeldung erforderlich"],
    [503, "Private Browser-Version wird eingerichtet"],
  ])(
    "keeps HTTP %s closed without trusting the response body",
    async (status, title) => {
      fetchMock.mockResolvedValueOnce(
        new Response("<html>secret provider error</html>", {
          status: Number(status),
        }),
      );
      await mount();
      expect(
        await screen.findByRole("heading", { name: String(title) }),
      ).toBeInTheDocument();
      expect(load).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", {
          name: status === 401 ? "Seite neu laden" : "Verbindung erneut prüfen",
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/secret provider error/),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps missing capabilities closed even after authentication", async () => {
    fetchMock.mockResolvedValueOnce(response(session(["get_bootstrap_data"])));
    await mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "noch nicht vollständig eingerichtet",
    );
    expect(load).not.toHaveBeenCalled();
    const { getPrivateWebClientState } =
      await import("../services/private-web-client");
    expect(getPrivateWebClientState().status).toBe("unauthenticated");
  });

  it("does not open the workspace for an invalid CSRF/session contract", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ ...session(), csrfToken: "invalid" }),
    );
    await mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "konnte nicht bestätigt werden",
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("unmounts personal contents and calls the cache-clear hook when authorization expires", async () => {
    fetchMock.mockResolvedValueOnce(response(session()));
    await mount();
    await screen.findByText("Private Journalinhalte");
    const { privateWebCall } = await import("../services/private-web-client");
    fetchMock.mockResolvedValueOnce(
      new Response("access denied", { status: 401 }),
    );
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
    expect(
      screen.queryByText("Private Journalinhalte"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(unmount).toHaveBeenCalledOnce());
  });

  it("unmounts forms after a revision conflict and offers a full page reload", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        ...session([...requiredCommands, "create_trade"]),
        writableCommands: ["create_trade"],
      }),
    );
    await mount();
    await screen.findByText("Private Journalinhalte");
    const { privateWebCall } = await import("../services/private-web-client");
    fetchMock.mockResolvedValueOnce(response({}, 409));
    await act(async () => {
      await expect(privateWebCall("create_trade")).rejects.toMatchObject({
        code: "WEB_REVISION_CONFLICT",
      });
    });
    expect(
      await screen.findByRole("button", { name: "Seite neu laden" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Private Journalinhalte"),
    ).not.toBeInTheDocument();
    expect(unmount).toHaveBeenCalledOnce();
  });
});
