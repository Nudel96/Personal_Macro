import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import service, { handleServiceRequest } from "./service.mjs";

const { Request, Response } = globalThis;
const ORIGIN = "https://workspace.service.test";
const BACKEND = "https://backend.service.test";
const WORKSPACE = "synthetic-service-workspace";
const SECRET = "42".repeat(32);
const SESSION = {
  authenticated: true,
  workspaceId: WORKSPACE,
  revision: 5,
  capabilities: ["get_bootstrap_data", "create_tag", "upload_private_media"],
  writableCommands: ["create_tag", "upload_private_media"],
};
const ENV = {
  VERCEL: "1",
  MACRO_WORKSPACE_ID: WORKSPACE,
  MACRO_GATEWAY_SECRET: SECRET,
  MACRO_WEB_ORIGINS: ORIGIN,
  MACRO_BACKEND_ORIGIN: BACKEND,
  BLOB_READ_WRITE_TOKEN: "synthetic-service-token-no-cloud-access",
};
const json = (value) => Response.json(value);

function harness() {
  const calls = [];
  const dependencies = {
    env: ENV,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === `${BACKEND}/session`) return json(SESSION);
      if (url === `${BACKEND}/commands`)
        return json({ ok: true, data: { id: "synthetic-tag" }, revision: 6 });
      if (url === `${BACKEND}/media/commands`)
        return json({
          ok: false,
          error: { code: "NOT_FOUND", message: "Synthetic missing media" },
          revision: 5,
        });
      throw new Error("Unrecognized synthetic upstream request");
    },
  };
  const request = (path, init) => new Request(`${ORIGIN}${path}`, init);
  const run = (path, init) =>
    handleServiceRequest(request(path, init), dependencies);
  return { dependencies, calls, run, request };
}

async function session(subject) {
  const response = await subject.run("/api/session");
  assert.equal(response.status, 200);
  const value = await response.json();
  return {
    value,
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}

function commandOptions(current, headers = {}) {
  return {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Cookie: current.cookie,
      "Content-Type": "application/json",
      "X-Macro-CSRF-Token": current.value.csrfToken,
      ...headers,
    },
    body: JSON.stringify({
      workspaceId: WORKSPACE,
      command: "create_tag",
      args: { input: { name: "Synthetic service tag" } },
      expectedRevision: 5,
      operationId: "9859bb44-7fdf-4286-b093-184fd8575896",
    }),
  };
}

test("explicit service exports a Web-standard fetch entrypoint", () => {
  assert.equal(typeof service.fetch, "function");
});

test("service reaches the existing signed session handler without an Origin on GET", async () => {
  const subject = harness();
  const current = await session(subject);
  assert.equal(current.value.authenticated, true);
  assert.equal(current.value.workspaceId, WORKSPACE);
  assert.deepEqual(current.value.capabilities, SESSION.capabilities);
  assert.match(current.cookie, /^__Host-macro-session=/);
  assert.equal(subject.calls.length, 1);
  assert.equal(subject.calls[0].url, `${BACKEND}/session`);
});

test("service forwards exact command bytes with the same HMAC and no caller auth headers", async () => {
  const subject = harness();
  const current = await session(subject);
  const options = commandOptions(current, {
    Authorization: "Bearer synthetic-browser-token",
    "X-Vercel-Protection-Bypass": "synthetic-bypass",
    "X-Forwarded-Host": "untrusted.service.test",
  });
  const response = await subject.run("/api/commands", options);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { id: "synthetic-tag" },
    revision: 6,
  });
  const { url, options: forwarded } = subject.calls.at(-1);
  assert.equal(url, `${BACKEND}/commands`);
  assert.equal(forwarded.body.toString("utf8"), options.body);
  const headers = forwarded.headers;
  const signed = `v1\n${headers["X-Macro-Timestamp"]}\n${headers["X-Macro-Nonce"]}\nPOST\n/commands\n${createHash("sha256").update(forwarded.body).digest("hex")}`;
  assert.equal(
    headers["X-Macro-Signature"],
    createHmac("sha256", Buffer.from(SECRET, "hex"))
      .update(signed)
      .digest("hex"),
  );
  assert.deepEqual(
    Object.keys(headers).sort(),
    [
      "Accept",
      "Content-Type",
      "X-Macro-Timestamp",
      "X-Macro-Nonce",
      "X-Macro-Signature",
    ].sort(),
  );
  assert.equal(forwarded.redirect, "manual");
});

test("service preserves origin, session and CSRF checks for commands", async () => {
  const subject = harness();
  const current = await session(subject);
  for (const [headers, status, code] of [
    [{ Origin: "https://untrusted.service.test" }, 403, "ORIGIN_NOT_ALLOWED"],
    [{ Cookie: "" }, 401, "SESSION_REQUIRED"],
    [{ "X-Macro-CSRF-Token": "" }, 403, "CSRF_INVALID"],
  ]) {
    const response = await subject.run(
      "/api/commands",
      commandOptions(current, headers),
    );
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
  assert.equal(subject.calls.length, 1);
});

test("media GET keeps its query and reaches only the internal media command through a session", async () => {
  const subject = harness();
  const current = await session(subject);
  const id = "f4346ce5-2266-42f7-a827-f85da9605cde";
  const response = await subject.run(`/api/media?id=${id}`, {
    headers: { Cookie: current.cookie },
  });
  // The mocked existing media handler finds no image, proving dispatch reached it.
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "MEDIA_NOT_FOUND");
  const { url, options } = subject.calls.at(-1);
  assert.equal(url, `${BACKEND}/media/commands`);
  assert.deepEqual(JSON.parse(options.body), {
    workspaceId: WORKSPACE,
    command: "get_private_media_object",
    args: { id },
  });
});

test("media requests retain session, query validation and upload CSRF protections", async () => {
  const subject = harness();
  const current = await session(subject);
  const anonymous = await subject.run(
    "/api/media?id=f4346ce5-2266-42f7-a827-f85da9605cde",
  );
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "SESSION_REQUIRED");
  const query = await subject.run("/api/media?id=bad", {
    headers: { Cookie: current.cookie },
  });
  assert.equal(query.status, 400);
  assert.equal((await query.json()).error.code, "MEDIA_INVALID_REQUEST");
  const upload = await subject.run("/api/media", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Cookie: current.cookie,
      "Content-Type": "image/png",
    },
    body: new Uint8Array([1]),
  });
  assert.equal(upload.status, 403);
  assert.equal((await upload.json()).error.code, "CSRF_INVALID");
  assert.equal(subject.calls.length, 1);
});

test("all endpoint methods remain explicitly restricted with no permissive CORS", async () => {
  const subject = harness();
  for (const [path, method, allow] of [
    ["/api/session", "POST", "GET"],
    ["/api/commands", "GET", "POST"],
    ["/api/media", "OPTIONS", "GET, POST"],
  ]) {
    const response = await subject.run(path, { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), allow);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  assert.equal(subject.calls.length, 0);
});

test("unknown, internal and trailing-slash paths return uncached JSON404 without backend calls", async () => {
  const subject = harness();
  for (const path of [
    "/",
    "/api/unknown",
    "/session",
    "/commands",
    "/media/commands",
    "/api/session/",
    "/api/media/anything",
    "/api%2Fsession",
  ]) {
    const response = await subject.run(path);
    assert.equal(response.status, 404);
    assert.equal(
      response.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).error.code, "ROUTE_NOT_FOUND");
  }
  assert.equal(subject.calls.length, 0);
});

test("missing configuration fails closed through the service entrypoint", async () => {
  const subject = harness();
  const response = await handleServiceRequest(subject.request("/api/session"), {
    ...subject.dependencies,
    env: {},
  });
  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error.code,
    "PRIVATE_WEB_NOT_CONFIGURED",
  );
  assert.equal(subject.calls.length, 0);
});
