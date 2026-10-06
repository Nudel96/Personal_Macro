import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateWebSession } from "./private-web-client";
import type { TradeInput } from "../types/domain";

const session = (): PrivateWebSession => ({
  authenticated: true,
  workspaceId: "workspace-test",
  revision: 7,
  csrfToken: "a".repeat(48),
  capabilities: ["create_trade", "upload_private_media"],
  writableCommands: ["create_trade", "upload_private_media"],
});
const file = () =>
  new File([new Uint8Array([137, 80, 78, 71, 0, 255])], "Änderung 東京.png", {
    type: "image/png",
  });
const media = { id: "19c06f17-b6d3-48e4-a946-4c345a7abfb8" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("private media upload transport", () => {
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

  async function configured(value = session()) {
    const client = await import("./private-web-client");
    client.configurePrivateWebSession(value);
    return client;
  }

  it("submits trade and original together as multipart with one operation and revision", async () => {
    const current = session();
    current.capabilities.push("create_trade_with_screenshot");
    current.writableCommands.push("create_trade_with_screenshot");
    const client = await configured(current);
    const original = file();
    const input = {
      accountId: "account-a",
      instrument: "EURUSD",
      direction: "long",
      status: "draft",
    } as TradeInput;
    fetchMock.mockResolvedValueOnce(
      json({ ok: true, data: { id: "new-trade" }, revision: 8 }),
    );
    await expect(
      client.privateWebTradeScreenshotUpload(original, input),
    ).resolves.toEqual({ id: "new-trade" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/media");
    const headers = new Headers(init?.headers);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("X-Macro-CSRF-Token")).toBe(current.csrfToken);
    const metadata = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            headers.get("X-Macro-Media")!.replace(/-/g, "+").replace(/_/g, "/"),
          ),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    expect(metadata).toMatchObject({
      workspaceId: current.workspaceId,
      expectedRevision: 7,
      accountId: "account-a",
      filename: original.name,
    });
    expect(metadata.operationId).toMatch(/^[a-f0-9-]{36}$/);
    const body = init?.body as FormData;
    expect(JSON.parse(String(body.get("trade")))).toEqual(input);
    expect((body.get("image") as File).name).toBe(original.name);
    expect(client.getPrivateWebClientState().revision).toBe(8);
    expect(client.getPrivateWebClientState().writeInFlight).toBe(false);
  });

  it("requires the session and an explicitly writable upload capability", async () => {
    const client = await import("./private-web-client");
    await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
      code: "WEB_AUTH_REQUIRED",
    });
    client.configurePrivateWebSession({
      ...session(),
      writableCommands: ["create_trade"],
    });
    await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
      code: "WEB_CAPABILITY_UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes upload through the command facade only in private web mode", async () => {
    await configured();
    const { api } = await import("./commands");
    const original = file();
    fetchMock.mockResolvedValueOnce(
      json({ ok: true, data: media, revision: 8 }),
    );
    await expect(api.uploadMedia(original)).resolves.toEqual(media);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(original);
    vi.stubEnv("VITE_PRIVATE_WEB", "false");
    await expect(api.uploadMedia(original)).rejects.toMatchObject({
      code: "WEB_CAPABILITY_UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the original File with UTF-8 metadata and advances the shared revision", async () => {
    const client = await configured();
    const original = file();
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    fetchMock.mockResolvedValueOnce(
      json({ ok: true, data: media, revision: 8 }),
    );
    await expect(
      client.privateWebMediaUpload(original, {
        accountId: "account",
        tradeId: "trade",
        slot: "entry",
        caption: "Vor dem Einstieg – 東京",
      }),
    ).resolves.toEqual(media);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/media");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(init?.body).toBe(original);
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("X-Macro-CSRF-Token")).toBe(session().csrfToken);
    const encoded = headers.get("X-Macro-Media")!;
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    const metadata = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
          (character) => character.charCodeAt(0),
        ),
      ),
    );
    expect(metadata).toEqual({
      workspaceId: "workspace-test",
      expectedRevision: 7,
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      filename: original.name,
      accountId: "account",
      tradeId: "trade",
      slot: "entry",
      caption: "Vor dem Einstieg – 東京",
    });
    expect(client.getPrivateWebClientState()).toMatchObject({
      status: "ready",
      revision: 8,
      writeInFlight: false,
    });
    expect(JSON.stringify(client.getPrivateWebClientState())).not.toContain(
      session().csrfToken,
    );
    fetchMock.mockResolvedValueOnce(json({ ok: true, data: {}, revision: 9 }));
    await client.privateWebCall("create_trade");
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).expectedRevision,
    ).toBe(8);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it.each(["upload-first", "command-first"])(
    "shares the write lock in both directions: %s",
    async (order) => {
      const client = await configured();
      let finish!: (response: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const first =
        order === "upload-first"
          ? client.privateWebMediaUpload(file())
          : client.privateWebCall("create_trade");
      const second =
        order === "upload-first"
          ? client.privateWebCall("create_trade")
          : client.privateWebMediaUpload(file());
      await expect(second).rejects.toMatchObject({
        code: "WEB_WRITE_IN_PROGRESS",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      finish(json({ ok: true, data: media, revision: 8 }));
      await first;
      expect(client.getPrivateWebClientState().writeInFlight).toBe(false);
    },
  );

  it("blocks every later mutation after an upload revision conflict", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(json({}, 409));
    await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
      code: "WEB_REVISION_CONFLICT",
    });
    await expect(client.privateWebCall("create_trade")).rejects.toMatchObject({
      code: "WEB_REVISION_CONFLICT",
    });
    expect(client.getPrivateWebClientState().status).toBe("reload-required");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "server", "unchanged-revision"])(
    "does not retry an uncertain upload: %s",
    async (failure) => {
      const client = await configured();
      if (failure === "network")
        fetchMock.mockRejectedValueOnce(new Error("private upstream details"));
      else
        fetchMock.mockResolvedValueOnce(
          failure === "server"
            ? new Response("private details", { status: 503 })
            : json({ ok: true, data: media, revision: 7 }),
        );
      await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
        code: "WEB_WRITE_UNCERTAIN",
      });
      await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
        code: "WEB_WRITE_UNCERTAIN",
      });
      await expect(client.privateWebCall("create_trade")).rejects.toMatchObject(
        { code: "WEB_WRITE_UNCERTAIN" },
      );
      expect(client.getPrivateWebClientState()).toMatchObject({
        status: "reload-required",
        writeInFlight: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("times out an upload under the shared mutation deadline", async () => {
    vi.useFakeTimers();
    const client = await configured();
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    const result = expect(
      client.privateWebMediaUpload(file()),
    ).rejects.toMatchObject({ code: "WEB_WRITE_UNCERTAIN" });
    await vi.advanceTimersByTimeAsync(90_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])(
    "clears the session when upload access is denied: %s",
    async (status) => {
      const client = await configured();
      fetchMock.mockResolvedValueOnce(
        new Response("private details", { status }),
      );
      await expect(client.privateWebMediaUpload(file())).rejects.toMatchObject({
        code: "WEB_AUTH_REQUIRED",
      });
      expect(client.getPrivateWebClientState().status).toBe("unauthenticated");
    },
  );

  it.each([
    ["image/svg+xml", 10, "WEB_MEDIA_TYPE_INVALID"],
    ["image/gif", 10, "WEB_MEDIA_TYPE_INVALID"],
    ["", 10, "WEB_MEDIA_TYPE_INVALID"],
    ["image/png", 0, "WEB_MEDIA_SIZE_INVALID"],
    ["image/png", 3 * 1024 * 1024 + 1, "WEB_MEDIA_SIZE_INVALID"],
  ])(
    "rejects invalid files before acquiring a lock: %s/%s",
    async (type, size, code) => {
      const client = await configured();
      await expect(
        client.privateWebMediaUpload(
          new File([new Uint8Array(Number(size))], "image", {
            type: String(type),
          }),
        ),
      ).rejects.toMatchObject({ code });
      expect(client.getPrivateWebClientState()).toMatchObject({
        status: "ready",
        revision: 7,
        writeInFlight: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "accepts %s unchanged at the upload limit",
    async (type) => {
      const client = await configured();
      fetchMock.mockResolvedValueOnce(
        json({ ok: true, data: media, revision: 8 }),
      );
      const original = new File([new Uint8Array(3 * 1024 * 1024)], "image", {
        type,
      });
      await client.privateWebMediaUpload(original);
      expect(fetchMock.mock.calls[0][1]?.body).toBe(original);
    },
  );

  it.each([
    "../image.png",
    "folder\\image.png",
    "bad\nname.png",
    "ä".repeat(128),
  ])(
    "rejects invalid filenames without sending bytes: %s",
    async (filename) => {
      const client = await configured();
      await expect(
        client.privateWebMediaUpload(
          new File(["bytes"], filename, { type: "image/png" }),
        ),
      ).rejects.toMatchObject({ code: "WEB_MEDIA_NAME_INVALID" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(client.getPrivateWebClientState().writeInFlight).toBe(false);
    },
  );

  it.each([
    { accountId: "a".repeat(129) },
    { tradeId: "a".repeat(129) },
    { slot: "a".repeat(65) },
    { caption: "a".repeat(4001) },
    { slot: "ä".repeat(33) },
    { caption: "ä".repeat(2001) },
  ])(
    "validates optional context before starting the upload",
    async (context) => {
      const client = await configured();
      await expect(
        client.privateWebMediaUpload(file(), context),
      ).rejects.toMatchObject({ code: "WEB_MEDIA_CONTEXT_INVALID" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("preserves confirmed preflight rejection without advancing the revision", async () => {
    const client = await configured();
    fetchMock.mockResolvedValueOnce(
      json(
        {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Die Bilddatei ist ungültig.",
          },
          revision: 7,
        },
        422,
      ),
    );
    await expect(client.privateWebMediaUpload(file())).rejects.toEqual({
      code: "INVALID_INPUT",
      message: "Die Bilddatei ist ungültig.",
    });
    expect(client.getPrivateWebClientState()).toMatchObject({
      status: "ready",
      revision: 7,
      writeInFlight: false,
    });
  });
});
