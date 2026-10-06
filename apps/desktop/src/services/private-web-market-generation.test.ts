import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateWebSession } from "./private-web-client";

const oldGeneration = "11111111-1111-4111-8111-111111111111";
const newGeneration = "22222222-2222-4222-8222-222222222222";
const session = (): PrivateWebSession => ({
  authenticated: true,
  workspaceId: "workspace-test",
  revision: 7,
  csrfToken: "a".repeat(48),
  capabilities: ["get_cot_dashboard", "create_trade"],
  writableCommands: ["create_trade"],
  marketGeneration: oldGeneration,
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("private market generation checks", () => {
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
  async function requestedGeneration(
    client: Awaited<ReturnType<typeof configured>>,
  ) {
    fetchMock.mockResolvedValueOnce(json({ ok: true, data: {}, revision: 7 }));
    await client.privateWebCall("get_cot_dashboard");
    return JSON.parse(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1]?.body)).args
      .generation;
  }

  it("advances only the market pointer, retaining journal revision and credentials", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(
      json({
        ...session(),
        revision: 99,
        csrfToken: "b".repeat(48),
        capabilities: [...session().capabilities, "save_account"],
        writableCommands: [...session().writableCommands, "save_account"],
        marketGeneration: newGeneration,
      }),
    );
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(true);
    expect(client.getPrivateWebClientState().revision).toBe(7);
    expect(client.supportsPrivateWebCommand("save_account")).toBe(false);
    expect(await requestedGeneration(client)).toBe(newGeneration);
    const request = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1];
    expect(new Headers(request?.headers).get("x-macro-csrf-token")).toBe("a".repeat(48));
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/session",
      { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" },
    ]);
  });

  it("does not create a session or request data without an active session", async () => {
    const client = await import("./private-web-client");
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { marketGeneration: oldGeneration },
    { marketGeneration: null },
    { marketGeneration: "invalid" },
    { workspaceId: "another-workspace", marketGeneration: newGeneration },
    { authenticated: false, marketGeneration: newGeneration },
    { csrfToken: "invalid", marketGeneration: newGeneration },
    { capabilities: [], marketGeneration: newGeneration },
  ])("retains the generation for an unchanged or invalid session response %j", async (change) => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(json({ ...session(), ...change }));
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(false);
    expect(await requestedGeneration(client)).toBe(oldGeneration);
  });

  it("cannot reactivate a session cleared while the request was pending", async () => {
    const client = await configured();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = client.refreshPrivateWebMarketGeneration();
    client.clearPrivateWebSession();
    finish(json({ ...session(), marketGeneration: newGeneration }));
    expect(await pending).toBe(false);
    expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
  });

  it("does not clear a replacement session after an old unauthorized response", async () => {
    const client = await configured();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = client.refreshPrivateWebMarketGeneration();
    client.clearPrivateWebSession();
    client.configurePrivateWebSession(session());
    finish(json({}, 401));
    expect(await pending).toBe(false);
    expect(client.getPrivateWebClientState().status).toBe("ready");
  });

  it.each([401, 403])("ends the active workspace on HTTP %s", async (status) => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(json({}, status));
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(false);
    expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
  });

  it("cancels stalled checks and prevents overlapping requests", async () => {
    vi.useFakeTimers();
    const client = await configured();
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = client.refreshPrivateWebMarketGeneration();
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(client.getPrivateWebClientState().status).toBe("ready");
  });

  it("does not apply a response delivered after explicit cancellation", async () => {
    const client = await configured();
    const controller = new AbortController();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = client.refreshPrivateWebMarketGeneration(controller.signal);
    controller.abort();
    expect(await pending).toBe(false);
    finish(json({ ...session(), marketGeneration: newGeneration }));
    expect(await requestedGeneration(client)).toBe(oldGeneration);
  });

  it("retains reload-required state and never blesses a conflicted form", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(json({}, 409));
    await expect(client.privateWebCall("create_trade")).rejects.toMatchObject({ code: "WEB_REVISION_CONFLICT" });
    expect(await client.refreshPrivateWebMarketGeneration()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getPrivateWebClientState().status).toBe("reload-required");
  });
});
