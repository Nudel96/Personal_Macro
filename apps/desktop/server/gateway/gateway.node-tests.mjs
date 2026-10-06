import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import {
  handleGatewayRequest,
  MAX_BODY_BYTES,
  MAX_RESPONSE_BYTES,
} from "./index.mjs";
import sessionEndpoint from "../../api/session.mjs";
import commandsEndpoint from "../../api/commands.mjs";

const ORIGIN = "https://workspace.example.test";
const OTHER_ORIGIN = "https://other.example.test";
const NOW = 1_800_000_000_000;
const ENV = {
  VERCEL: "1",
  MACRO_BACKEND_ORIGIN: "https://backend.example.test",
  MACRO_WORKSPACE_ID: "synthetic-workspace",
  MACRO_GATEWAY_SECRET: "11".repeat(32),
  MACRO_WEB_ORIGINS: ORIGIN,
};
const SESSION = {
  authenticated: true,
  workspaceId: ENV.MACRO_WORKSPACE_ID,
  revision: 7,
  capabilities: ["get_bootstrap", "create_trade"],
  writableCommands: ["create_trade"],
};

function json(value, init = {}) {
  return new globalThis.Response(JSON.stringify(value), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function harness(overrides = {}) {
  const calls = [];
  const dependencies = {
    env: { ...ENV },
    now: () => NOW,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith("/session")
        ? json(SESSION)
        : json({ ok: true, revision: 8, data: { id: "synthetic-trade" } });
    },
    ...overrides,
  };
  const run = (request, route) =>
    handleGatewayRequest(request, route, dependencies);
  return { calls, dependencies, run };
}

function sessionRequest(headers = {}, origin = ORIGIN) {
  return new globalThis.Request(`${origin}/api/session`, { headers });
}

async function openSession(subject) {
  const response = await subject.run(sessionRequest(), "session");
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  const value = await response.json();
  return {
    cookie: setCookie?.split(";")[0],
    csrfToken: value.csrfToken,
    value,
    response,
  };
}

function commandRequest(session, options = {}) {
  const {
    headers = {},
    origin = ORIGIN,
    body = JSON.stringify({
      workspaceId: ENV.MACRO_WORKSPACE_ID,
      command: "create_trade",
      args: { symbol: "TEST" },
      expectedRevision: 7,
      requestId: "synthetic-request",
    }),
    ...rest
  } = options;
  return new globalThis.Request(`${origin}/api/commands`, {
    method: "POST",
    body,
    ...rest,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: session.cookie ?? "",
      "X-Macro-CSRF-Token": session.csrfToken ?? "",
      ...headers,
    },
  });
}

async function expectFailure(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual((await response.json()).error.code, code);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("set-cookie"), null);
}

test("Vercel API entries export web-standard fetch handlers", () => {
  assert.equal(typeof sessionEndpoint.fetch, "function");
  assert.equal(typeof commandsEndpoint.fetch, "function");
});

test("session response binds workspace and a secure non-readable host-only cookie", async () => {
  const subject = harness();
  const session = await openSession(subject);
  assert.deepEqual(session.value, { ...SESSION, csrfToken: session.csrfToken });
  assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
  const cookie = session.response.headers.get("set-cookie");
  assert.match(cookie, /^__Host-macro-session=v1\./);
  for (const attribute of [
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=28800",
  ])
    assert.ok(cookie.includes(attribute));
  assert.ok(!cookie.includes("Domain="));
  assert.equal(
    session.response.headers.get("cache-control"),
    "private, no-store",
  );
  assert.equal(
    session.response.headers.get("vercel-cdn-cache-control"),
    "no-store",
  );
  assert.equal(
    session.response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.equal(subject.calls[0].url, `${ENV.MACRO_BACKEND_ORIGIN}/session`);
});

test("session reload keeps a valid cookie and CSRF token stable for concurrent tabs", async () => {
  const subject = harness();
  const session = await openSession(subject);
  const response = await subject.run(
    sessionRequest({ Cookie: session.cookie }),
    "session",
  );
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.json()).csrfToken, session.csrfToken);
});

test("POST preserves exact command bytes and signs method, path and SHA256 using the decoded key", async () => {
  const subject = harness();
  const session = await openSession(subject);
  const body =
    '{ "workspaceId": "synthetic-workspace", "command": "create_trade", "args": { "note": "Grüße" }, "expectedRevision": 7 }';
  const response = await subject.run(
    commandRequest(session, { body }),
    "commands",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    revision: 8,
    data: { id: "synthetic-trade" },
  });
  const { url, init } = subject.calls.at(-1);
  assert.equal(url, `${ENV.MACRO_BACKEND_ORIGIN}/commands`);
  assert.equal(init.body.toString("utf8"), body);
  const timestamp = init.headers["X-Macro-Timestamp"];
  const nonce = init.headers["X-Macro-Nonce"];
  assert.equal(timestamp, String(NOW / 1000));
  assert.match(nonce, /^[a-f0-9-]{36}$/);
  const message = `v1\n${timestamp}\n${nonce}\nPOST\n/commands\n${createHash("sha256").update(Buffer.from(body)).digest("hex")}`;
  assert.equal(
    init.headers["X-Macro-Signature"],
    createHmac("sha256", Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"))
      .update(message)
      .digest("hex"),
  );
  assert.equal(init.redirect, "manual");
  assert.equal(init.cache, "no-store");
});

test("each upstream call has its own nonce, including repeated browser requests", async () => {
  const subject = harness();
  const session = await openSession(subject);
  await subject.run(commandRequest(session), "commands");
  await subject.run(commandRequest(session), "commands");
  const nonces = subject.calls.map(({ init }) => init.headers["X-Macro-Nonce"]);
  assert.equal(new Set(nonces).size, 3);
});

test("no incoming credentials or forwarding headers cross the backend boundary", async () => {
  const subject = harness();
  const session = await openSession(subject);
  await subject.run(
    commandRequest(session, {
      headers: {
        Authorization: "Bearer synthetic-inbound-token",
        "X-Vercel-Protection-Bypass": "synthetic-bypass",
        "X-Forwarded-Host": "attacker.example.test",
        "X-Macro-Signature": "synthetic-forged-signature",
      },
    }),
    "commands",
  );
  const headers = subject.calls.at(-1).init.headers;
  assert.deepEqual(
    Object.keys(headers).sort(),
    [
      "Accept",
      "Content-Type",
      "X-Macro-Nonce",
      "X-Macro-Signature",
      "X-Macro-Timestamp",
    ].sort(),
  );
  assert.ok(!JSON.stringify(headers).includes("synthetic-inbound-token"));
});

test("missing, malformed, insecure, wildcard or non-Vercel config stays closed", async () => {
  const variants = [
    { MACRO_GATEWAY_SECRET: "" },
    { MACRO_GATEWAY_SECRET: "11" },
    { MACRO_BACKEND_ORIGIN: "http://localhost:3000" },
    { MACRO_BACKEND_ORIGIN: "https://user:password@example.test" },
    { MACRO_BACKEND_ORIGIN: "https://backend.example.test/path" },
    { MACRO_BACKEND_ORIGIN: "https://backend.example.test?token=secret" },
    { MACRO_WEB_ORIGINS: "*" },
    { MACRO_WEB_ORIGINS: "" },
    { MACRO_WEB_ORIGINS: `${ORIGIN},` },
    { MACRO_WORKSPACE_ID: "" },
    { VERCEL: "0" },
  ];
  for (const variant of variants) {
    const subject = harness({ env: { ...ENV, ...variant } });
    await expectFailure(
      await subject.run(sessionRequest(), "session"),
      503,
      "PRIVATE_WEB_NOT_CONFIGURED",
    );
    assert.equal(subject.calls.length, 0);
  }
});

test("only GET session and POST commands are accepted, with no preflight CORS permission", async () => {
  const subject = harness();
  for (const method of ["HEAD", "OPTIONS", "PUT", "DELETE"]) {
    const response = await subject.run(
      new globalThis.Request(`${ORIGIN}/api/session`, { method }),
      "session",
    );
    assert.equal(response.headers.get("allow"), "GET");
    await expectFailure(response, 405, "METHOD_NOT_ALLOWED");
  }
  await expectFailure(
    await subject.run(sessionRequest(), "commands"),
    405,
    "METHOD_NOT_ALLOWED",
  );
  assert.equal(subject.calls.length, 0);
});

test("host allowlist, exact Origin and fetch metadata reject cross-site requests before upstream", async () => {
  const subject = harness();
  const session = await openSession(subject);
  const requests = [
    commandRequest(session, { headers: { Origin: OTHER_ORIGIN } }),
    commandRequest(session, { headers: { Origin: "null" } }),
    commandRequest(session, { headers: { Origin: "" } }),
    commandRequest(session, { headers: { "Sec-Fetch-Site": "cross-site" } }),
    commandRequest(session, { headers: { "Sec-Fetch-Site": "same-site" } }),
    commandRequest(session, { origin: OTHER_ORIGIN }),
  ];
  for (const request of requests)
    await expectFailure(
      await subject.run(request, "commands"),
      403,
      "ORIGIN_NOT_ALLOWED",
    );
  await expectFailure(
    await subject.run(
      sessionRequest({ "Sec-Fetch-Site": "cross-site" }),
      "session",
    ),
    403,
    "ORIGIN_NOT_ALLOWED",
  );
  await expectFailure(
    await subject.run(
      new globalThis.Request(
        `${ORIGIN}/api/session?backend=https://attacker.test`,
      ),
      "session",
    ),
    403,
    "ORIGIN_NOT_ALLOWED",
  );
  assert.equal(subject.calls.length, 1);
});

test("commands require a signed session cookie and a matching csrf token", async () => {
  const subject = harness();
  const session = await openSession(subject);
  for (const cookie of [
    "",
    session.cookie + "tampered",
    `${session.cookie}; ${session.cookie}`,
  ]) {
    await expectFailure(
      await subject.run(
        commandRequest(session, { headers: { Cookie: cookie } }),
        "commands",
      ),
      401,
      "SESSION_REQUIRED",
    );
  }
  for (const csrfToken of [
    "",
    "f".repeat(64),
    session.csrfToken.toUpperCase(),
  ]) {
    await expectFailure(
      await subject.run(
        commandRequest(session, {
          headers: { "X-Macro-CSRF-Token": csrfToken },
        }),
        "commands",
      ),
      403,
      "CSRF_INVALID",
    );
  }
  assert.equal(subject.calls.length, 1);
});

test("csrf token cannot move between browser sessions or between allowed origins", async () => {
  const subject = harness({
    env: { ...ENV, MACRO_WEB_ORIGINS: `${ORIGIN},${OTHER_ORIGIN}` },
  });
  const first = await openSession(subject);
  const second = await openSession(subject);
  await expectFailure(
    await subject.run(
      commandRequest({ cookie: first.cookie, csrfToken: second.csrfToken }),
      "commands",
    ),
    403,
    "CSRF_INVALID",
  );
  await expectFailure(
    await subject.run(
      commandRequest(first, { origin: OTHER_ORIGIN }),
      "commands",
    ),
    401,
    "SESSION_REQUIRED",
  );
});

test("expired and future session cookies fail; rotating key invalidates old cookies", async () => {
  const subject = harness();
  const session = await openSession(subject);
  subject.dependencies.now = () => NOW + 8 * 60 * 60 * 1000;
  await expectFailure(
    await subject.run(commandRequest(session), "commands"),
    401,
    "SESSION_REQUIRED",
  );
  subject.dependencies.now = () => NOW - 61_000;
  await expectFailure(
    await subject.run(commandRequest(session), "commands"),
    401,
    "SESSION_REQUIRED",
  );
  subject.dependencies.now = () => NOW;
  subject.dependencies.env.MACRO_GATEWAY_SECRET = "22".repeat(32);
  await expectFailure(
    await subject.run(commandRequest(session), "commands"),
    401,
    "SESSION_REQUIRED",
  );
});

test("unsupported content types, invalid JSON and invalid envelopes do not reach the backend", async () => {
  const subject = harness();
  const session = await openSession(subject);
  await expectFailure(
    await subject.run(
      commandRequest(session, { headers: { "Content-Type": "text/plain" } }),
      "commands",
    ),
    415,
    "UNSUPPORTED_CONTENT_TYPE",
  );
  for (const body of [
    "{",
    "null",
    "[]",
    "1",
    JSON.stringify({
      workspaceId: ENV.MACRO_WORKSPACE_ID,
      command: "../session",
    }),
    JSON.stringify({
      workspaceId: ENV.MACRO_WORKSPACE_ID,
      command: "create_trade",
      args: [],
    }),
    JSON.stringify({
      workspaceId: ENV.MACRO_WORKSPACE_ID,
      command: "get_bootstrap",
      args: null,
    }),
  ]) {
    await expectFailure(
      await subject.run(commandRequest(session, { body }), "commands"),
      400,
      "INVALID_REQUEST",
    );
  }
  await expectFailure(
    await subject.run(
      commandRequest(session, { body: new Uint8Array([0xff]) }),
      "commands",
    ),
    400,
    "INVALID_REQUEST",
  );
  assert.equal(subject.calls.length, 1);
});

test("commands cannot use a missing or different workspace identity", async () => {
  const subject = harness();
  const session = await openSession(subject);
  for (const workspaceId of [undefined, "other-workspace"]) {
    await expectFailure(
      await subject.run(
        commandRequest(session, {
          body: JSON.stringify({
            command: "create_trade",
            workspaceId,
            args: {},
          }),
        }),
        "commands",
      ),
      400,
      "INVALID_REQUEST",
    );
  }
  assert.equal(subject.calls.length, 1);
});

test("confirmed business errors retain revision but discard free-form messages and details", async () => {
  const subject = harness();
  const session = await openSession(subject);
  subject.dependencies.fetch = async () =>
    json({
      ok: false,
      revision: 8,
      error: {
        code: "VALIDATION_ERROR",
        message: "synthetic-secret https://private.example.test",
        details: "synthetic-secret",
      },
    });
  const response = await subject.run(commandRequest(session), "commands");
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.revision, 8);
  assert.equal(value.error.code, "VALIDATION_ERROR");
  assert.equal(value.error.details, undefined);
  assert.ok(!JSON.stringify(value).includes("synthetic-secret"));
});

test("command responses require a valid revision and a defined result envelope", async () => {
  const subject = harness();
  const session = await openSession(subject);
  for (const value of [
    null,
    {},
    { ok: true, data: {}, revision: -1 },
    { ok: true, revision: 7 },
    { ok: false, revision: 7 },
  ]) {
    subject.dependencies.fetch = async () => json(value);
    await expectFailure(
      await subject.run(commandRequest(session), "commands"),
      502,
      "BACKEND_INVALID_RESPONSE",
    );
  }
});

test("both declared and streamed request limits are enforced without trusting Content-Length", async () => {
  assert.equal(MAX_BODY_BYTES, 2 * 1024 * 1024);
  const subject = harness();
  const session = await openSession(subject);
  await expectFailure(
    await subject.run(
      commandRequest(session, {
        headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
      }),
      "commands",
    ),
    413,
    "PAYLOAD_TOO_LARGE",
  );
  await expectFailure(
    await subject.run(
      commandRequest(session, {
        body: "x".repeat(MAX_BODY_BYTES + 1),
        headers: { "Content-Length": "1" },
      }),
      "commands",
    ),
    413,
    "PAYLOAD_TOO_LARGE",
  );
  assert.equal(subject.calls.length, 1);
});

test("response limit also bounds an upstream response without Content-Length", async () => {
  const subject = harness({
    fetch: async () =>
      new globalThis.Response("x".repeat(MAX_RESPONSE_BYTES + 1), {
        headers: { "Content-Type": "application/json" },
      }),
  });
  await expectFailure(
    await subject.run(sessionRequest(), "session"),
    502,
    "BACKEND_INVALID_RESPONSE",
  );
});

test("analysis responses above 2 MiB and through exactly 4 MiB remain complete", async () => {
  assert.equal(MAX_RESPONSE_BYTES, 4 * 1024 * 1024);
  const subject = harness();
  const session = await openSession(subject);
  const prefix = '{"ok":true,"revision":7,"data":{"text":"';
  const suffix = '"}}';
  for (const size of [MAX_BODY_BYTES + 16_384, MAX_RESPONSE_BYTES]) {
    const body =
      prefix + "ä".repeat((size - prefix.length - suffix.length) / 2) + suffix;
    // Account for a possible odd byte in the requested exact boundary.
    const exactBody = body.replace(
      '"}}',
      "x".repeat(size - Buffer.byteLength(body)) + '"}}',
    );
    assert.equal(Buffer.byteLength(exactBody), size);
    subject.dependencies.fetch = async () =>
      new globalThis.Response(exactBody, {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(size),
        },
      });
    const response = await subject.run(commandRequest(session), "commands");
    assert.equal(response.status, 200);
    const returned = await response.json();
    assert.equal(returned.ok, true);
    assert.equal(returned.revision, 7);
    assert.deepEqual(returned.data, JSON.parse(exactBody).data);
  }
});

test("response limit rejects declared overflow before reading its body", async () => {
  const subject = harness();
  const session = await openSession(subject);
  let readerCalls = 0;
  subject.dependencies.fetch = async () => ({
    status: 200,
    ok: true,
    headers: new globalThis.Headers({
      "Content-Type": "application/json",
      "Content-Length": String(MAX_RESPONSE_BYTES + 1),
    }),
    body: {
      getReader() {
        readerCalls++;
        throw new Error("must not read");
      },
    },
  });
  await expectFailure(
    await subject.run(commandRequest(session), "commands"),
    502,
    "BACKEND_INVALID_RESPONSE",
  );
  assert.equal(readerCalls, 0);
});

test("response overflow cancels the stream and never returns its valid JSON prefix", async () => {
  const subject = harness();
  const session = await openSession(subject);
  const prefix = Buffer.from(
    '{"ok":true,"revision":7,"data":{"accepted":true}}',
  );
  for (const declared of [null, "1"]) {
    let reads = 0;
    let cancelled = false;
    subject.dependencies.fetch = async () =>
      new globalThis.Response(
        new globalThis.ReadableStream(
          {
            pull(controller) {
              reads++;
              if (reads === 1) controller.enqueue(prefix);
              else if (reads === 2)
                controller.enqueue(
                  Buffer.alloc(MAX_RESPONSE_BYTES - prefix.length, 32),
                );
              else if (reads === 3) controller.enqueue(Buffer.from(" "));
              else throw new Error("response overflow must stop reading");
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        {
          headers: {
            "Content-Type": "application/json",
            ...(declared ? { "Content-Length": declared } : {}),
          },
        },
      );
    await expectFailure(
      await subject.run(commandRequest(session), "commands"),
      502,
      "BACKEND_INVALID_RESPONSE",
    );
    assert.equal(reads, 3);
    assert.equal(cancelled, true);
  }
});

test("backend errors never expose upstream URLs, credentials or raw bodies", async () => {
  for (const [status, expectedStatus, code] of [
    [401, 502, "BACKEND_UNAUTHORIZED"],
    [403, 502, "BACKEND_UNAUTHORIZED"],
    [409, 409, "REVISION_CONFLICT"],
    [422, 422, "COMMAND_NOT_AVAILABLE"],
    [400, 400, "COMMAND_REJECTED"],
    [500, 502, "BACKEND_UNAVAILABLE"],
  ]) {
    const subject = harness({
      fetch: async () =>
        json(
          {
            code: "secret",
            message: "https://user:password@private.example.test?token=secret",
          },
          { status },
        ),
    });
    const response = await subject.run(sessionRequest(), "session");
    const text = await response.clone().text();
    assert.ok(!text.includes("password"));
    assert.ok(!text.includes("private.example"));
    await expectFailure(response, expectedStatus, code);
  }
});

test("redirects are not followed and Location is never exposed", async () => {
  let calls = 0;
  const subject = harness({
    fetch: async (_url, init) => {
      calls++;
      assert.equal(init.redirect, "manual");
      return new globalThis.Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example.test" },
      });
    },
  });
  const response = await subject.run(sessionRequest(), "session");
  assert.equal(response.headers.get("location"), null);
  await expectFailure(response, 502, "BACKEND_INVALID_RESPONSE");
  assert.equal(calls, 1);
});

test("malformed upstream JSON, HTML and wrong-workspace sessions cannot initialize the app", async () => {
  const responses = [
    () =>
      new globalThis.Response("<html>upstream</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      new globalThis.Response("{", {
        headers: { "Content-Type": "application/json" },
      }),
    () => json({ ...SESSION, workspaceId: "unexpected-workspace" }),
    () => json({ ...SESSION, authenticated: false }),
    () => json({ ...SESSION, revision: -1 }),
    () => json({ ...SESSION, capabilities: { commands: [] } }),
    () => json({ ...SESSION, writableCommands: ["../escape"] }),
  ];
  for (const response of responses) {
    const subject = harness({ fetch: async () => response() });
    await expectFailure(
      await subject.run(sessionRequest(), "session"),
      502,
      "BACKEND_INVALID_RESPONSE",
    );
  }
});

test("session strips unexpected upstream fields and headers", async () => {
  const subject = harness({
    fetch: async () =>
      json(
        {
          ...SESSION,
          internalOrigin: "https://backend.example.test",
          token: "synthetic-secret",
        },
        {
          headers: {
            "Set-Cookie": "unsafe=value",
            "Access-Control-Allow-Origin": "*",
          },
        },
      ),
  });
  const session = await openSession(subject);
  assert.deepEqual(
    Object.keys(session.value).sort(),
    [...Object.keys(SESSION), "csrfToken"].sort(),
  );
  assert.ok(!session.response.headers.get("set-cookie").includes("unsafe"));
  assert.equal(
    session.response.headers.get("access-control-allow-origin"),
    null,
  );
});

test("deadline bounds even a stalled fetch that ignores cancellation", async () => {
  let signal;
  const subject = harness({
    deadlineMs: 10,
    fetch: async (_url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    },
  });
  await expectFailure(
    await subject.run(sessionRequest(), "session"),
    504,
    "BACKEND_TIMEOUT",
  );
  assert.equal(signal.aborted, true);
});

test("deadline covers streamed upstream bodies and cancels them", async () => {
  let cancelled = false;
  const subject = harness({
    deadlineMs: 10,
    fetch: async () =>
      new globalThis.Response(
        new globalThis.ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  });
  await expectFailure(
    await subject.run(sessionRequest(), "session"),
    504,
    "BACKEND_TIMEOUT",
  );
  assert.equal(cancelled, true);
});

test("deadline covers a stalled inbound body without making an upstream request", async () => {
  const subject = harness({ deadlineMs: 10 });
  const session = await openSession(subject);
  let cancelled = false;
  const body = new globalThis.ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  await expectFailure(
    await subject.run(
      commandRequest(session, { body, duplex: "half" }),
      "commands",
    ),
    504,
    "BACKEND_TIMEOUT",
  );
  assert.equal(cancelled, true);
  assert.equal(subject.calls.length, 1);
});

test("unexpected network failures become a generic error with no exception details", async () => {
  const subject = harness({
    fetch: async () => {
      throw new Error(
        "secret backend credential at https://private.example.test",
      );
    },
  });
  const response = await subject.run(sessionRequest(), "session");
  assert.ok(!(await response.clone().text()).includes("private.example"));
  await expectFailure(response, 502, "BACKEND_UNAVAILABLE");
});
