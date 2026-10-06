import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { handleGatewayRequest } from "../gateway/index.mjs";
import { handleMediaRequest } from "./index.mjs";
import {
  inspectImage,
  MAX_MEDIA_BYTES,
  uploadIdentity,
  objectPath,
} from "./image.mjs";
import { readOriginal } from "./storage.mjs";
import { uploadExistingMedia } from "./migrate.mjs";
import api from "../../api/media.mjs";

const { Request, Response } = globalThis;

const ORIGIN = "https://private.example.test",
  BACKEND = "https://backend.example.test";
const ENV = {
  VERCEL: "1",
  MACRO_GATEWAY_SECRET: "ab".repeat(32),
  MACRO_WORKSPACE_ID: "fixture-workspace",
  MACRO_WEB_ORIGINS: ORIGIN,
  MACRO_BACKEND_ORIGIN: BACKEND,
  BLOB_READ_WRITE_TOKEN: "synthetic-token-no-cloud-access",
};
const NOW = Date.UTC(2026, 8, 24),
  OP = "c395b6c8-2d41-4dba-8301-063ae4bd1f6c";
function pngChunk(type, data) {
  const value = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const prefix = Buffer.alloc(4),
    suffix = Buffer.alloc(4);
  prefix.writeUInt32BE(data.length);
  suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, value, suffix]);
}
const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", header),
  pngChunk("IDAT", deflateSync(Buffer.from([0, 100, 120, 140, 255]))),
  pngChunk("IEND", Buffer.alloc(0)),
]);
const IMAGE = inspectImage(PNG, "image/png");
test("multipart screenshot commits a single signed trade-and-original operation", async () => {
  const session = await login();
  const headers = upload(session, { meta: { accountId: "account-a" } }).headers;
  headers.delete("content-type");
  const form = new globalThis.FormData();
  form.set(
    "image",
    new globalThis.File([PNG], "Chart.png", { type: "image/png" }),
  );
  form.set(
    "trade",
    JSON.stringify({
      accountId: "account-a",
      instrument: "EURUSD",
      direction: "long",
      status: "draft",
    }),
  );
  const blob = memoryBlob();
  let calls = 0;
  const response = await handleMediaRequest(
    new Request(`${ORIGIN}/api/media`, { method: "POST", headers, body: form }),
    {
      env: ENV,
      now: () => NOW,
      blob,
      fetch: async (_url, init) => {
        calls++;
        const operation = JSON.parse(Buffer.from(init.body).toString());
        assert.equal(operation.command, "register_private_trade_media");
        assert.equal(operation.expectedRevision, 7);
        assert.equal(operation.operationId, OP);
        assert.equal(operation.args.input.sha256, IMAGE.sha256);
        assert.equal(operation.args.trade.accountId, "account-a");
        return json({ ok: true, data: { id: "trade-a" }, revision: 8 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal((await response.json()).data.id, "trade-a");
  assert.equal(blob.files.size, 1);
});
test("multipart screenshot rejects account substitution before upload or persistence", async () => {
  const session = await login();
  const headers = upload(session, { meta: { accountId: "account-a" } }).headers;
  headers.delete("content-type");
  const form = new globalThis.FormData();
  form.set(
    "image",
    new globalThis.File([PNG], "Chart.png", { type: "image/png" }),
  );
  form.set(
    "trade",
    JSON.stringify({ accountId: "account-b", instrument: "EURUSD" }),
  );
  const blob = memoryBlob();
  const response = await handleMediaRequest(
    new Request(`${ORIGIN}/api/media`, { method: "POST", headers, body: form }),
    {
      env: ENV,
      now: () => NOW,
      blob,
      fetch: async () => {
        throw Error("MUST_NOT_CALL_BACKEND");
      },
    },
  );
  assert.equal(response.status, 400);
  assert.equal(blob.files.size, 0);
});
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==",
  "base64",
);
const WEBP = Buffer.from(
  "UklGRjAAAABXRUJQVlA4ICQAAABQAQCdASoBAAEAAUAmJQBOgCgAAP7i4LkdhDdhy64ubIbwAAA=",
  "base64",
);
const IDENTITY = uploadIdentity(
  Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"),
  ENV.MACRO_WORKSPACE_ID,
  OP,
  IMAGE,
);
const RECORD = {
  id: IDENTITY.id,
  relativePath: `/api/media?id=${IDENTITY.id}`,
  absolutePath: `/api/media?id=${IDENTITY.id}`,
  originalFilename: "Chart.png",
  ...IMAGE,
  createdAt: "2026-09-24T00:00:00Z",
  tradeCount: 0,
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function login() {
  const response = await handleGatewayRequest(
    new Request(`${ORIGIN}/api/session`),
    "session",
    {
      env: ENV,
      now: () => NOW,
      fetch: async () =>
        json({
          authenticated: true,
          workspaceId: ENV.MACRO_WORKSPACE_ID,
          revision: 7,
          capabilities: ["upload_private_media"],
          writableCommands: ["upload_private_media"],
        }),
    },
  );
  const result = await response.json();
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    csrf: result.csrfToken,
  };
}
function upload(
  session,
  {
    bytes = PNG,
    mime = "image/png",
    meta = {},
    headers = {},
    url = `${ORIGIN}/api/media`,
    method = "POST",
  } = {},
) {
  return new Request(url, {
    method,
    headers: {
      Origin: ORIGIN,
      Cookie: session.cookie,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": mime,
      "X-Macro-CSRF-Token": session.csrf,
      "X-Macro-Media": Buffer.from(
        JSON.stringify({
          workspaceId: ENV.MACRO_WORKSPACE_ID,
          operationId: OP,
          expectedRevision: 7,
          filename: "Chart.png",
          ...meta,
        }),
      ).toString("base64url"),
      ...headers,
    },
    body: bytes,
  });
}
function memoryBlob() {
  const files = new Map(),
    calls = [];
  return {
    files,
    calls,
    async get(path, options) {
      calls.push(["get", path]);
      assert.equal(options.access, "private");
      assert.equal(options.useCache, false);
      assert.equal(options.token, ENV.BLOB_READ_WRITE_TOKEN);
      const entry = files.get(path);
      if (!entry) return null;
      return {
        statusCode: 200,
        blob: {
          pathname: path,
          size: entry.bytes.length,
          contentType: entry.mime,
        },
        stream: new Response(entry.bytes).body,
      };
    },
    async put(path, bytes, options) {
      calls.push(["put", path]);
      assert.equal(options.access, "private");
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.allowOverwrite, false);
      assert.equal(files.has(path), false);
      files.set(path, { bytes: Buffer.from(bytes), mime: options.contentType });
      return {
        pathname: path,
        contentType: options.contentType,
        url: "https://must-never-reach-browser.invalid/private",
      };
    },
    async del() {
      assert.fail(
        "The HTTP route must not delete potentially committed originals",
      );
    },
  };
}
function backend(calls, handler) {
  return async (url, options) => {
    assert.equal(url, `${BACKEND}/media/commands`);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    const hash = createHash("sha256").update(options.body).digest("hex");
    const canonical = `v1\n${options.headers["X-Macro-Timestamp"]}\n${options.headers["X-Macro-Nonce"]}\nPOST\n/media/commands\n${hash}`;
    assert.equal(
      options.headers["X-Macro-Signature"],
      createHmac("sha256", Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"))
        .update(canonical)
        .digest("hex"),
    );
    const request = JSON.parse(options.body);
    calls.push(request);
    return handler?.(request) ?? json({ ok: true, data: RECORD, revision: 8 });
  };
}
const run = (request, blob, fetch, extra = {}) =>
  handleMediaRequest(request, {
    env: ENV,
    now: () => NOW,
    blob,
    fetch,
    ...extra,
  });

test("entry exports a Web-standard fetch handler", () =>
  assert.equal(typeof api.fetch, "function"));
test("JPEG and WebP signatures, dimensions, exact bounds and original hashes are checked", () => {
  for (const [bytes, mime] of [
    [JPEG, "image/jpeg"],
    [WEBP, "image/webp"],
  ]) {
    const image = inspectImage(bytes, mime);
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
    assert.equal(
      image.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.throws(() =>
      inspectImage(bytes.subarray(0, bytes.length - 1), mime),
    );
    assert.throws(() =>
      inspectImage(Buffer.concat([bytes, Buffer.from("x")]), mime),
    );
  }
});
test("PNG CRC and pixel bounds are enforced", () => {
  const corrupt = Buffer.from(PNG);
  corrupt[45] ^= 1;
  assert.throws(() => inspectImage(corrupt, "image/png"));
  const huge = Buffer.from(header);
  huge.writeUInt32BE(32768, 0);
  huge.writeUInt32BE(32768, 4);
  const image = Buffer.concat([
    PNG.subarray(0, 8),
    pngChunk("IHDR", huge),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  assert.throws(() => inspectImage(image, "image/png"));
});
test("WebP canvas cannot hide oversized, mismatched or repeated image chunks", () => {
  const chunk = (type, bytes) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32LE(bytes.length, 4);
    return Buffer.concat([
      header,
      bytes,
      ...(bytes.length % 2 ? [Buffer.alloc(1)] : []),
    ]);
  };
  const webp = (chunks) => {
    const payload = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
    const header = Buffer.alloc(8);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(payload.length, 4);
    return Buffer.concat([header, payload]);
  };
  const canvas = chunk("VP8X", Buffer.alloc(10));
  const image = (width, height) => {
    const bytes = Buffer.alloc(5);
    bytes[0] = 0x2f;
    bytes.writeUInt32LE((width - 1) | ((height - 1) << 14), 1);
    return chunk("VP8L", bytes);
  };
  for (const chunks of [
    [canvas, image(16384, 16384)],
    [canvas, image(2, 1)],
    [canvas, canvas, image(1, 1)],
    [image(1, 1), image(1, 1)],
    [image(1, 1), canvas],
  ]) {
    assert.throws(() => inspectImage(webp(chunks), "image/webp"));
  }
});
test("upload preserves exact original bytes and only sends validated metadata to signed internal route", async () => {
  const session = await login(),
    blob = memoryBlob(),
    calls = [];
  const response = await run(upload(session), blob, backend(calls));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.data, RECORD);
  assert.equal(result.revision, 8);
  assert.deepEqual(blob.files.get(IDENTITY.blobPathname).bytes, PNG);
  assert.equal(calls[0].command, "register_private_media");
  assert.equal(calls[0].operationId, OP);
  assert.equal(calls[0].expectedRevision, 7);
  assert.equal(
    calls[0].args.input.sha256,
    createHash("sha256").update(PNG).digest("hex"),
  );
  assert.equal(calls[0].args.input.blobPathname, IDENTITY.blobPathname);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(JSON.stringify(result).includes("blobPathname"), false);
});
test("same upload operation has stable internal registration body and no duplicate Blob put", async () => {
  const session = await login(),
    blob = memoryBlob(),
    calls = [];
  for (let n = 0; n < 2; n++)
    assert.equal(
      (await run(upload(session), blob, backend(calls))).status,
      200,
    );
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(blob.calls.filter(([name]) => name === "put").length, 1);
  assert.notEqual(
    uploadIdentity(
      Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"),
      ENV.MACRO_WORKSPACE_ID,
      "17b3c6a9-2490-464d-9817-23eb1731c491",
      IMAGE,
    ).id,
    IDENTITY.id,
  );
});
test("GET requires signed browser session before DB or Blob access", async () => {
  const blob = memoryBlob();
  let calls = 0;
  const response = await run(
    new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`),
    blob,
    async () => {
      calls++;
      throw Error();
    },
  );
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.equal(blob.calls.length, 0);
});
test("GET returns hash-verified original with private security headers and no Blob metadata", async () => {
  const session = await login(),
    blob = memoryBlob(),
    calls = [];
  blob.files.set(IDENTITY.blobPathname, { bytes: PNG, mime: "image/png" });
  const response = await run(
    new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`, {
      headers: { Cookie: session.cookie },
    }),
    blob,
    backend(calls, () =>
      json({ ok: true, data: { ...IDENTITY, ...IMAGE }, revision: 7 }),
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  for (const [key, value] of Object.entries({
    "content-type": "image/png",
    "cache-control": "private, no-store",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  }))
    assert.equal(response.headers.get(key), value);
  assert.equal(calls[0].command, "get_private_media_object");
  assert.deepEqual(calls[0].args, { id: IDENTITY.id });
  assert.equal(response.headers.get("location"), null);
});
test("GET rejects tampered, expired, duplicate and other-origin cookies", async () => {
  const session = await login();
  for (const cookie of [
    session.cookie + "0",
    session.cookie + `; ${session.cookie}`,
    "",
  ]) {
    const response = await run(
      new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`, {
        headers: { Cookie: cookie },
      }),
      memoryBlob(),
      () => assert.fail(),
    );
    assert.equal(response.status, 401);
  }
  const expired = await run(
    new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`, {
      headers: { Cookie: session.cookie },
    }),
    memoryBlob(),
    () => assert.fail(),
    { now: () => NOW + 8 * 60 * 60 * 1000 },
  );
  assert.equal(expired.status, 401);
  const cross = await run(
    new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`, {
      headers: { Cookie: session.cookie, Origin: "https://attacker.invalid" },
    }),
    memoryBlob(),
    () => assert.fail(),
  );
  assert.equal(cross.status, 403);
});
test("GET rejects arbitrary paths, duplicate IDs and unknown query fields", async () => {
  const session = await login();
  for (const search of [
    "?path=../../secret",
    `?id=${IDENTITY.id}&id=${IDENTITY.id}`,
    `?id=${IDENTITY.id}&url=https://evil.invalid`,
    "?id=../../secret",
  ]) {
    const response = await run(
      new Request(`${ORIGIN}/api/media${search}`, {
        headers: { Cookie: session.cookie },
      }),
      memoryBlob(),
      () => assert.fail(),
    );
    assert.equal(response.status, 400);
  }
});
test("POST rejects missing/wrong exact origin, cross-site mode and CSRF before processing bytes", async () => {
  const session = await login();
  for (const headers of [
    { Origin: "" },
    { Origin: "https://other.invalid" },
    { "Sec-Fetch-Site": "cross-site" },
    { "X-Macro-CSRF-Token": "" },
    { "X-Macro-CSRF-Token": "b".repeat(64) },
  ]) {
    const blob = memoryBlob(),
      response = await run(upload(session, { headers }), blob, () =>
        assert.fail(),
      );
    assert.equal(response.status, 403);
    assert.equal(blob.calls.length, 0);
  }
});
test("POST rejects absent authentication even with matching-looking CSRF", async () => {
  const session = await login(),
    response = await run(
      upload(session, { headers: { Cookie: "" } }),
      memoryBlob(),
      () => assert.fail(),
    );
  assert.equal(response.status, 401);
});
test("file type, magic, empty bytes and full structure are checked before storage", async () => {
  const session = await login();
  for (const options of [
    { mime: "image/svg+xml", bytes: Buffer.from("<svg/>") },
    { mime: "image/jpeg" },
    { bytes: Buffer.alloc(0) },
    { bytes: Buffer.from("<script>private</script>") },
    { bytes: PNG.subarray(0, PNG.length - 1) },
    { bytes: Buffer.concat([PNG, Buffer.from("trailing")]) },
  ]) {
    const blob = memoryBlob(),
      response = await run(upload(session, options), blob, () => assert.fail());
    assert.equal(response.status, 415);
    assert.equal(blob.calls.length, 0);
  }
});
test("oversized bytes and oversized declared Content-Length are rejected", async () => {
  const session = await login();
  for (const options of [
    { bytes: Buffer.alloc(MAX_MEDIA_BYTES + 1) },
    { headers: { "Content-Length": String(MAX_MEDIA_BYTES + 1) } },
  ]) {
    const blob = memoryBlob(),
      response = await run(upload(session, options), blob, () => assert.fail());
    assert.equal(response.status, 413);
    assert.equal(blob.calls.length, 0);
  }
});
test("metadata cannot select an object URL, file path, foreign workspace, invalid revision or filename", async () => {
  const session = await login();
  for (const meta of [
    { blobPathname: "https://evil.invalid" },
    { workspaceId: "foreign" },
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { filename: "../chart.png" },
    { filename: "bad\nname.png" },
    { operationId: "bad" },
    { tradeId: "trade-without-account" },
    { slot: "x".repeat(65) },
    { slot: "ä".repeat(33) },
    { caption: "ä".repeat(2001) },
  ]) {
    const blob = memoryBlob(),
      response = await run(upload(session, { meta }), blob, () =>
        assert.fail(),
      );
    assert.equal(response.status, 400);
    assert.equal(blob.calls.length, 0);
  }
});
test("DB error after upload reports pending and retains potentially referenced bytes", async () => {
  const session = await login();
  for (const handler of [
    () => {
      throw Error("SECRET-DB-ERROR");
    },
    () =>
      json({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "SECRET-PERSONAL-VALUE" },
        revision: 7,
      }),
    () => json({}, 409),
  ]) {
    const blob = memoryBlob(),
      response = await run(upload(session), blob, backend([], handler));
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.error.code, "MEDIA_UPLOAD_PENDING");
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
    assert.equal(blob.files.size, 1);
  }
});
test("uncertain Blob put also reports pending without issuing a registration", async () => {
  const session = await login(),
    blob = memoryBlob();
  blob.put = async () => {
    throw Error("secret provider body");
  };
  const response = await run(upload(session), blob, () => assert.fail());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MEDIA_UPLOAD_PENDING");
});
test("hash mismatch prevents any image bytes reaching the browser", async () => {
  const session = await login(),
    blob = memoryBlob(),
    changed = Buffer.from(PNG);
  changed[40] ^= 1;
  blob.files.set(IDENTITY.blobPathname, { bytes: changed, mime: "image/png" });
  const response = await run(
    new Request(`${ORIGIN}/api/media?id=${IDENTITY.id}`, {
      headers: { Cookie: session.cookie },
    }),
    blob,
    backend([], () =>
      json({ ok: true, data: { ...IDENTITY, ...IMAGE }, revision: 7 }),
    ),
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "MEDIA_INTEGRITY_ERROR");
});
test("stored arbitrary URL is rejected before any Blob request", async () => {
  const blob = memoryBlob();
  await assert.rejects(() =>
    readOriginal(
      { ...IMAGE, blobPathname: "https://attacker.invalid" },
      ENV,
      undefined,
      blob,
    ),
  );
  assert.equal(blob.calls.length, 0);
});
test("explicit migration verifies hash/size, preserves existing UUID and returns only a registration descriptor", async () => {
  const blob = memoryBlob(),
    record = { ...RECORD, id: "ed4335b1-1c63-40c5-b76f-bb9b873ba55f" };
  const result = await uploadExistingMedia({
    bytes: PNG,
    record,
    env: ENV,
    blob,
  });
  assert.equal(result.input.id, record.id);
  assert.equal(result.input.blobPathname, objectPath(record.id, IMAGE));
  assert.deepEqual(blob.files.get(result.input.blobPathname).bytes, PNG);
  const before = blob.calls.length;
  await assert.rejects(() =>
    uploadExistingMedia({
      bytes: PNG,
      record: { ...record, sha256: "0".repeat(64) },
      env: ENV,
      blob,
    }),
  );
  assert.equal(blob.calls.length, before);
});
test("initial migration never issues a descriptor when private readback differs after put", async () => {
  const blob = memoryBlob();
  const put = blob.put;
  blob.put = async (path, bytes, options) => {
    const result = await put(path, bytes, options);
    const stored = blob.files.get(path);
    stored.bytes[40] ^= 1;
    return result;
  };
  await assert.rejects(
    () => uploadExistingMedia({ bytes: PNG, record: RECORD, env: ENV, blob }),
    { code: "MEDIA_INTEGRITY_ERROR" },
  );
  assert.equal(blob.files.size, 1);
  assert.equal(blob.calls.filter(([method]) => method === "get").length, 2);
});
test("initial migration bypasses a cached pre-upload miss for immediate readback and retry", async () => {
  const blob = memoryBlob();
  const get = blob.get;
  let cachedMiss = false;
  blob.get = async (path, options) => {
    if (cachedMiss && options.useCache !== false) return null;
    const result = await get(path, options);
    if (!result) cachedMiss = true;
    return result;
  };
  const initial = await uploadExistingMedia({
    bytes: PNG,
    record: RECORD,
    env: ENV,
    blob,
  });
  assert.equal(cachedMiss, true);
  assert.equal(initial.created, true);
  const retried = await uploadExistingMedia({
    bytes: PNG,
    record: RECORD,
    env: ENV,
    blob,
  });
  assert.equal(retried.created, false);
  assert.deepEqual(retried.input, initial.input);
  assert.equal(blob.calls.filter(([method]) => method === "put").length, 1);
  assert.equal(blob.calls.filter(([method]) => method === "get").length, 4);
});
test("unconfigured deployment and wrong HTTP methods fail closed", async () => {
  const session = await login();
  const noConfig = await run(
    upload(session),
    memoryBlob(),
    () => assert.fail(),
    { env: { ...ENV, VERCEL: "0" } },
  );
  assert.equal(noConfig.status, 503);
  const wrong = await run(
    new Request(`${ORIGIN}/api/media`, { method: "DELETE" }),
    memoryBlob(),
    () => assert.fail(),
  );
  assert.equal(wrong.status, 405);
});
