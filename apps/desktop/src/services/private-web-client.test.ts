import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateWebSession } from "./private-web-client";

const session = (): PrivateWebSession => ({
  authenticated: true,
  workspaceId: "workspace-test",
  revision: 7,
  csrfToken: "a".repeat(48),
  capabilities: ["get_trade", "create_trade", "save_account"],
  writableCommands: ["create_trade", "save_account"],
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("private web command transport", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_PRIVATE_WEB", "true");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function configured() {
    const client = await import("./private-web-client");
    client.configurePrivateWebSession(session());
    return client;
  }

  it("times out a session with stalled response headers without importing a session", async () => {
    vi.useFakeTimers();
    const client = await import("./private-web-client");
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    const check = expect(
      client.connectPrivateWebSession(["get_trade"]),
    ).rejects.toMatchObject({ code: "WEB_READ_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(30_000);
    await check;
    expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("times out a session whose response body never completes", async () => {
    vi.useFakeTimers();
    const client = await import("./private-web-client");
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const check = expect(
      client.connectPrivateWebSession(["get_trade"]),
    ).rejects.toMatchObject({ code: "WEB_READ_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(30_000);
    await check;
    stream.close();
    expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
  });

  it.each(["pageshow", "visibilitychange"])(
    "expires a suspended session on %s without waiting for a paused timer",
    async (event) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      const client = await import("./private-web-client");
      fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
      const check = expect(
        client.connectPrivateWebSession(["get_trade"]),
      ).rejects.toMatchObject({ code: "WEB_READ_TIMEOUT" });
      vi.setSystemTime(new Date("2026-09-25T12:02:00Z"));
      (event === "pageshow" ? window : document).dispatchEvent(
        new Event(event),
      );
      await check;
      expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects a late session body even when no resume event or timer ran", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-09-25T12:00:00Z");
    vi.setSystemTime(startedAt);
    const client = await import("./private-web-client");
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller;
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const check = expect(
      client.connectPrivateWebSession(["get_trade"]),
    ).rejects.toMatchObject({ code: "WEB_READ_TIMEOUT" });
    // Let the headers arrive while the request is still within its deadline.
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(new Date(startedAt.getTime() + 30_001));
    stream.enqueue(new TextEncoder().encode(JSON.stringify(session())));
    stream.close();
    await check;
    expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
  });

  it.each([false, true])(
    "removes session lifecycle listeners after completion (cancelled: %s)",
    async (cancelled) => {
      const addWindow = vi.spyOn(window, "addEventListener");
      const removeWindow = vi.spyOn(window, "removeEventListener");
      const addDocument = vi.spyOn(document, "addEventListener");
      const removeDocument = vi.spyOn(document, "removeEventListener");
      const client = await import("./private-web-client");
      const controller = new AbortController();
      fetchMock.mockImplementationOnce(() =>
        cancelled
          ? new Promise(() => undefined)
          : Promise.resolve(json(session())),
      );
      const pending = client.connectPrivateWebSession(
        ["get_trade"],
        controller.signal,
      );
      if (cancelled) {
        controller.abort();
        await expect(pending).rejects.toMatchObject({
          code: "WEB_SESSION_CANCELLED",
        });
      } else await pending;
      const pageshow = addWindow.mock.calls.find(
        ([event]) => event === "pageshow",
      )?.[1];
      const visibility = addDocument.mock.calls.find(
        ([event]) => event === "visibilitychange",
      )?.[1];
      expect(pageshow).toBeTypeOf("function");
      expect(visibility).toBeTypeOf("function");
      expect(removeWindow).toHaveBeenCalledWith("pageshow", pageshow);
      expect(removeDocument).toHaveBeenCalledWith(
        "visibilitychange",
        visibility,
      );
    },
  );

  it("requires a validated in-memory session before sending anything", async () => {
    const client = await import("./private-web-client");
    await expect(client.privateWebCall("get_trade")).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    expect(() =>
      client.configurePrivateWebSession({
        ...session(),
        writableCommands: ["unknown_write"],
      }),
    ).toThrow();
    expect(() =>
      client.configurePrivateWebSession({ ...session(), csrfToken: "short" }),
    ).toThrow();
    expect(() =>
      client.configurePrivateWebSession({ ...session(), revision: -1 }),
    ).toThrow();
    expect(() =>
      client.configurePrivateWebSession({ ...session(), authenticated: false }),
    ).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins market requests to the session generation and bounds parallel reads", async () => {
    const client = await import("./private-web-client");
    const generation = "11111111-1111-4111-8111-111111111111";
    client.configurePrivateWebSession({
      ...session(),
      capabilities: ["get_atlas_catalog"],
      writableCommands: [],
      marketGeneration: generation,
    });
    const completions: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => completions.push(resolve)),
    );
    const calls = [0, 1, 2].map(() =>
      client.privateWebCall("get_atlas_catalog"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).args).toEqual({
      generation,
    });
    completions[0](json({ ok: true, data: { catalog: 1 }, revision: 7 }));
    await calls[0];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    completions[1](json({ ok: true, data: {}, revision: 7 }));
    completions[2](json({ ok: true, data: {}, revision: 7 }));
    await Promise.all(calls);
  });

  it("never sends a queued market request after its session has ended", async () => {
    const client = await import("./private-web-client");
    client.configurePrivateWebSession({
      ...session(),
      capabilities: ["get_atlas_catalog"],
      writableCommands: [],
    });
    const completions: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => completions.push(resolve)),
    );
    const calls = [0, 1, 2].map(() =>
      client.privateWebCall("get_atlas_catalog"),
    );
    const outcomes = Promise.allSettled(calls);
    client.clearPrivateWebSession();
    completions.forEach((complete) =>
      complete(json({ ok: true, data: {}, revision: 7 })),
    );
    expect(
      (await outcomes).every((outcome) => outcome.status === "rejected"),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses only the same-origin endpoint and never persists the session", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const client = await configured();
    fetchMock.mockResolvedValue(
      json({ ok: true, data: { id: "trade" }, revision: 7 }),
    );
    await expect(
      client.privateWebCall("get_trade", { accountId: "account", id: "trade" }),
    ).resolves.toEqual({ id: "trade" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commands",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Macro-CSRF-Token": session().csrfToken,
        },
      }),
    );
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent).toEqual({
      workspaceId: "workspace-test",
      command: "get_trade",
      args: { accountId: "account", id: "trade" },
    });
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects unsupported and native path commands even if wrongly advertised", async () => {
    const client = await import("./private-web-client");
    const value = session();
    value.capabilities.push("import_media_file", "preview_backup");
    client.configurePrivateWebSession(value);
    for (const command of [
      "import_media_file",
      "preview_backup",
      "unknown_command",
    ]) {
      await expect(
        client.privateWebCall(command, { path: "C:\\private" }),
      ).rejects.toMatchObject({ code: "WEB_CAPABILITY_UNAVAILABLE" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the mutation base unchanged when reads observe another device's revision", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(json({ ok: true, data: {}, revision: 8 }));
    await client.privateWebCall("get_trade");
    expect(client.getPrivateWebClientState().revision).toBe(7);
    fetchMock.mockResolvedValueOnce(
      json(
        {
          ok: false,
          error: { code: "CONFLICT", message: "Konflikt" },
          revision: 8,
        },
        409,
      ),
    );
    await expect(
      client.privateWebCall("create_trade", { input: {} }),
    ).rejects.toMatchObject({ code: "WEB_REVISION_CONFLICT" });
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(sent.expectedRevision).toBe(7);
    expect(sent.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.getPrivateWebClientState().status).toBe("reload-required");
    await expect(client.privateWebCall("save_account")).rejects.toMatchObject({
      code: "WEB_REVISION_CONFLICT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    client.clearPrivateWebSession();
    expect(() =>
      client.configurePrivateWebSession({ ...session(), revision: 8 }),
    ).toThrow();
  });

  it("advances only after its own confirmed write and does not allow session refresh to bypass conflicts", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(
      json({ ok: true, data: { id: "new" }, revision: 8 }),
    );
    await client.privateWebCall("create_trade", { input: {} });
    expect(client.getPrivateWebClientState().revision).toBe(8);
    expect(() =>
      client.configurePrivateWebSession({ ...session(), revision: 10 }),
    ).toThrow();
    fetchMock.mockResolvedValueOnce(json({ ok: true, data: {}, revision: 9 }));
    await client.privateWebCall("save_account", { input: {} });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).expectedRevision,
    ).toBe(8);
  });

  it("blocks overlapping writes instead of queuing stale form values", async () => {
    const client = await configured();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = client.privateWebCall("create_trade");
    expect(client.getPrivateWebClientState().writeInFlight).toBe(true);
    await expect(client.privateWebCall("save_account")).rejects.toMatchObject({
      code: "WEB_WRITE_IN_PROGRESS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json({ ok: true, data: {}, revision: 8 }));
    await first;
    expect(client.getPrivateWebClientState().writeInFlight).toBe(false);
  });

  it.each([401, 403])(
    "invalidates the session on HTTP %s without exposing the response body",
    async (status) => {
      const client = await configured();
      fetchMock.mockResolvedValueOnce(
        new Response("private provider details", { status }),
      );
      await expect(client.privateWebCall("get_trade")).rejects.toMatchObject({
        code: "WEB_AUTH_REQUIRED",
      });
      expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
      await expect(client.privateWebCall("get_trade")).rejects.toMatchObject({
        code: "WEB_AUTH_REQUIRED",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("discards responses from a logged-out session", async () => {
    const client = await configured();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = client.privateWebCall("get_trade");
    client.clearPrivateWebSession();
    finish(json({ ok: true, data: { private: "old session" }, revision: 7 }));
    await expect(pending).rejects.toMatchObject({ code: "WEB_AUTH_REQUIRED" });
  });

  it("treats a lost write response as uncertain and never retries", async () => {
    const client = await configured();
    fetchMock.mockRejectedValueOnce(new Error("provider secret"));
    await expect(client.privateWebCall("create_trade")).rejects.toMatchObject({
      code: "WEB_WRITE_UNCERTAIN",
    });
    await expect(client.privateWebCall("create_trade")).rejects.toMatchObject({
      code: "WEB_WRITE_UNCERTAIN",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getPrivateWebClientState().writeInFlight).toBe(false);
  });

  it("retains safe server validation messages without advancing revision", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(
      json(
        {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Ein aktives Konto ist erforderlich.",
            details: "discard",
          },
          revision: 7,
        },
        422,
      ),
    );
    await expect(client.privateWebCall("create_trade")).rejects.toEqual({
      code: "INVALID_INPUT",
      message: "Ein aktives Konto ist erforderlich.",
    });
    expect(client.getPrivateWebClientState()).toMatchObject({
      status: "ready",
      revision: 7,
      writeInFlight: false,
    });
  });

  it.each([
    () =>
      new Response("<html>internal login page and secrets</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      json(
        {
          ok: false,
          error: {
            code: "ERROR",
            message: "<html>unsafe upstream error</html>",
          },
        },
        400,
      ),
    () => json({ ok: true, data: {}, revision: -1 }),
  ])("never exposes malformed or HTML error bodies", async (response) => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(response());
    await expect(client.privateWebCall("get_trade")).rejects.toEqual({
      code: "WEB_CONNECTION_FAILED",
      message:
        "Die privaten Daten konnten nicht geladen werden. Prüfe deine Verbindung.",
    });
  });

  it.each([
    () =>
      json(
        { ok: false, error: { code: "SERVER_ERROR", message: "Fehler" } },
        500,
      ),
    () => json({ ok: true, data: {}, revision: 7 }),
    () => json({ ok: true, data: {} }),
    () =>
      json(
        {
          ok: false,
          error: { code: "INVALID_INPUT", message: "Abgelehnt" },
          revision: 8,
        },
        422,
      ),
    () =>
      json(
        { ok: false, error: { code: "INVALID_INPUT", message: "Abgelehnt" } },
        422,
      ),
  ])(
    "requires reloading after an unconfirmed write response",
    async (response) => {
      const client = await configured();
      fetchMock.mockResolvedValueOnce(response());
      await expect(client.privateWebCall("create_trade")).rejects.toMatchObject(
        { code: "WEB_WRITE_UNCERTAIN" },
      );
      expect(client.getPrivateWebClientState().status).toBe("reload-required");
    },
  );

  it.each([
    ["get_trade", 30_000, "WEB_READ_TIMEOUT", "ready"],
    ["create_trade", 90_000, "WEB_WRITE_UNCERTAIN", "reload-required"],
  ])(
    "bounds %s request time without retrying",
    async (command, timeout, code, status) => {
      vi.useFakeTimers();
      const client = await configured();
      fetchMock.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );
      const check = expect(
        client.privateWebCall(String(command)),
      ).rejects.toMatchObject({ code });
      await vi.advanceTimersByTimeAsync(Number(timeout));
      await check;
      expect(client.getPrivateWebClientState().status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("times out while a response body is stalled, not only while awaiting headers", async () => {
    vi.useFakeTimers();
    const client = await configured();
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(body, { headers: { "Content-Type": "application/json" } }),
    );
    const check = expect(
      client.privateWebCall("get_trade"),
    ).rejects.toMatchObject({
      code: "WEB_READ_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await check;
    bodyController.close();
    expect(client.getPrivateWebClientState().status).toBe("ready");
  });
});
