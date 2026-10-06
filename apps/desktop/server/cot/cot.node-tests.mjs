import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";
import { handleServiceRequest } from "../gateway/service.mjs";
import { cotBackendRequest, gatewayConfiguration } from "../gateway/index.mjs";
import {
  CotJobError,
  cotRetry,
  handleCotCronRequest,
  processCotMessage,
} from "./index.mjs";
import { COT_TOPIC, MAX_DELIVERIES } from "./queue.mjs";
import { MAX_COT_GZIP_BYTES, storePreparedCot } from "./storage.mjs";
import service from "./service.mjs";

const { Request, Response, ReadableStream, AbortController } = globalThis;
const NOW = Date.parse("2026-09-25T16:20:00Z");
const ENV = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  MACRO_COT_AUTOMATION: "1",
  MACRO_WORKSPACE_ID: "synthetic-cot-workspace",
  MACRO_GATEWAY_SECRET: "42".repeat(32),
  MACRO_WEB_ORIGINS: "https://cot.example.test",
  MACRO_BACKEND_ORIGIN: "https://backend.example.test",
  CRON_SECRET: "synthetic-cot-cron-secret-with-no-cloud-access",
  BLOB_READ_WRITE_TOKEN: "synthetic-cot-blob-token-with-no-cloud-access",
};
const JOB = {
  releaseDate: "2026-09-25",
  reportDate: "2026-09-22",
  dueAt: "2026-09-25T20:00:00+00:00",
};
const RUN_NOW = Date.parse(JOB.dueAt);
const MESSAGE = { version: 1, job: JOB };
const META = {
  topicName: COT_TOPIC,
  region: "fra1",
  deliveryCount: 1,
  expiresAt: new Date(NOW + 86_400_000),
};
function fixture() {
  const bytes = gzipSync(
    Buffer.from("synthetic cot artifact; not a SQLite database"),
  );
  const generation = "08b18b03-0702-4c14-911f-4fb251d137e2";
  const rawHash = "a".repeat(64);
  return {
    bytes,
    value: {
      leaseId: "82c297ba-9f6c-472e-bd4f-e854889fb399",
      generation,
      objectPath: `public-cache/v1/${generation}/${rawHash}.sqlite.gz`,
      transferSha256: createHash("sha256").update(bytes).digest("hex"),
      transferBytes: bytes.length,
      dataBase64: bytes.toString("base64"),
    },
  };
}
function blobStore(f) {
  let stored = null;
  const events = [];
  return {
    events,
    async get(path, options) {
      events.push(["get", path, options]);
      if (!stored) return null;
      return {
        statusCode: 200,
        blob: {
          pathname: path,
          size: stored.length,
          contentType: "application/gzip",
        },
        stream: new ReadableStream({
          start(c) {
            c.enqueue(stored);
            c.close();
          },
        }),
      };
    },
    async put(path, bytes, options) {
      events.push(["put", path, options]);
      assert.deepEqual(bytes, f.bytes);
      stored = Buffer.from(bytes);
      return { pathname: path, contentType: "application/gzip" };
    },
  };
}
function harness(planned = { job: JOB }) {
  const calls = [],
    messages = [];
  return {
    calls,
    messages,
    env: ENV,
    now: () => NOW,
    async fetch(url, options) {
      calls.push({ url, options });
      return Response.json(planned);
    },
    async send(...args) {
      messages.push(args);
      return { messageId: "synthetic-queue-message" };
    },
  };
}
function cron(headers = {}, path = "/api/cron/cot", method = "GET") {
  return new Request(`${ENV.MACRO_WEB_ORIGINS}${path}`, {
    method,
    headers: { Authorization: `Bearer ${ENV.CRON_SECRET}`, ...headers },
  });
}
function signature(call) {
  const h = call.options.headers;
  return createHmac("sha256", Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"))
    .update(
      `v1\n${h["X-Macro-Timestamp"]}\n${h["X-Macro-Nonce"]}\nPOST\n${new globalThis.URL(call.url).pathname}\n${createHash("sha256").update(call.options.body).digest("hex")}`,
    )
    .digest("hex");
}

test("unauthorized cron requests never touch a backend or a queue, including owner-like headers", async () => {
  const subject = harness();
  for (const token of [
    "",
    "Bearer wrong",
    `bearer ${ENV.CRON_SECRET}`,
    `Bearer ${ENV.CRON_SECRET}suffix`,
    "x".repeat(400),
  ]) {
    const response = await handleServiceRequest(
      cron({
        Authorization: token,
        "x-vercel-cron-schedule": "0 16 * * *",
        "user-agent": "vercel-cron/1.0",
      }),
      subject,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  assert.equal(subject.calls.length, 0);
  assert.equal(subject.messages.length, 0);
});

test("cron rejects methods, query strings, malformed secrets and non-production environments", async () => {
  const subject = harness();
  assert.equal(
    (await handleCotCronRequest(cron({}, "/api/cron/cot", "POST"), subject))
      .status,
    405,
  );
  assert.equal(
    (
      await handleCotCronRequest(
        cron({}, "/api/cron/cot?releaseDate=2026-09-25"),
        subject,
      )
    ).status,
    400,
  );
  for (const patch of [
    { CRON_SECRET: undefined },
    { CRON_SECRET: "short" },
    { VERCEL_ENV: "preview" },
    { MACRO_COT_AUTOMATION: "" },
    { VERCEL: "0" },
  ]) {
    assert.notEqual(
      (
        await handleCotCronRequest(cron(), {
          ...subject,
          env: { ...ENV, ...patch },
        })
      ).status,
      200,
    );
  }
  assert.equal(subject.calls.length, 0);
});
test("a deferred queue acceptance is a successful COT schedule", async () => {
  const subject = harness();
  subject.send = async () => ({ messageId: null });
  assert.equal((await handleCotCronRequest(cron(), subject)).status, 200);
  subject.send = async () => ({});
  assert.equal((await handleCotCronRequest(cron(), subject)).status, 503);
});

test("valid native cron signs only its fixed plan request and delays until the backend release time", async () => {
  const subject = harness();
  const request = cron({
    Origin: "https://untrusted.test",
    Cookie: "private-cookie",
    "X-Vercel-Protection-Bypass": "synthetic-untrusted",
  });
  const response = await handleServiceRequest(request, subject);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    scheduled: true,
    releaseDate: JOB.releaseDate,
    dueAt: JOB.dueAt,
  });
  const call = subject.calls[0];
  assert.equal(call.url, `${ENV.MACRO_BACKEND_ORIGIN}/internal/cot/plan`);
  assert.equal(call.options.body.toString(), "{}");
  assert.equal(call.options.headers["X-Macro-Signature"], signature(call));
  assert.deepEqual(
    Object.keys(call.options.headers).sort(),
    [
      "Accept",
      "Content-Type",
      "X-Macro-Nonce",
      "X-Macro-Signature",
      "X-Macro-Timestamp",
    ].sort(),
  );
  assert.equal(call.options.redirect, "manual");
  assert.deepEqual(subject.messages[0], [
    COT_TOPIC,
    MESSAGE,
    {
      delaySeconds: 13_200,
      retentionSeconds: 86_400,
      idempotencyKey: "cot:2026-09-25:2026-09-25",
    },
  ]);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("duplicate daily planning uses the same queue deduplication key and fresh internal nonces", async () => {
  const subject = harness();
  await handleCotCronRequest(cron(), subject);
  await handleCotCronRequest(cron(), subject);
  assert.equal(
    subject.messages[0][2].idempotencyKey,
    subject.messages[1][2].idempotencyKey,
  );
  assert.notEqual(
    subject.calls[0].options.headers["X-Macro-Nonce"],
    subject.calls[1].options.headers["X-Macro-Nonce"],
  );
});

test("no release produces no queue message; late planning catches up immediately", async () => {
  const none = harness({ job: null });
  assert.deepEqual(await (await handleCotCronRequest(cron(), none)).json(), {
    ok: true,
    scheduled: false,
  });
  assert.equal(none.messages.length, 0);
  const late = harness();
  late.now = () => RUN_NOW + 20_000;
  assert.equal((await handleCotCronRequest(cron(), late)).status, 200);
  assert.equal(late.messages[0][2].delaySeconds, 0);
});

test("catch-up job keeps its release identity when the backend schedules a retry on a later day", async () => {
  const retryDue = "2026-09-26T16:20:00Z";
  const subject = harness({ job: { ...JOB, dueAt: retryDue } });
  subject.now = () => Date.parse(retryDue);
  assert.equal((await handleCotCronRequest(cron(), subject)).status, 200);
  assert.equal(subject.messages[0][1].job.releaseDate, JOB.releaseDate);
  assert.equal(subject.messages[0][2].delaySeconds, 0);
  assert.equal(
    subject.messages[0][2].idempotencyKey,
    "cot:2026-09-25:2026-09-26",
  );
  assert.equal(
    (
      await handleCotCronRequest(
        cron(),
        harness({ job: { ...JOB, dueAt: "2026-09-25T24:00:00Z" } }),
      )
    ).status,
    503,
  );
});

test("malformed plans, distant dates, provider failures and redirects never enqueue or leak raw errors", async () => {
  for (const planned of [
    {},
    { job: { ...JOB, releaseDate: "2026-02-30" } },
    { job: { ...JOB, reportDate: "2026-10-20" } },
    { job: { ...JOB, dueAt: "2026-10-05T20:00:00Z" } },
    {
      job: { ...JOB, releaseDate: "2026-09-28", dueAt: "2026-09-28T20:00:00Z" },
    },
    { job: JOB, privateNotes: "must-never-be-forwarded" },
  ]) {
    const subject = harness(planned);
    assert.equal((await handleCotCronRequest(cron(), subject)).status, 503);
    assert.equal(subject.messages.length, 0);
  }
  for (const fetch of [
    async () => {
      throw new Error("private-provider-token");
    },
    async () =>
      new Response("private-token", {
        status: 302,
        headers: { Location: "https://untrusted.test" },
      }),
    async () => new Response("x", { headers: { "Content-Type": "text/html" } }),
    async () =>
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(4 * 1024 * 1024 + 1),
        },
      }),
  ]) {
    const subject = harness();
    subject.fetch = fetch;
    const response = await handleCotCronRequest(cron(), subject);
    assert.equal(response.status, 503);
    assert.doesNotMatch(
      await response.text(),
      /private-provider-token|private-token|untrusted/,
    );
    assert.equal(subject.messages.length, 0);
  }
});

test("deadline covers stalled plans and does not start a queue send afterwards", async () => {
  const subject = harness();
  subject.fetch = () => new Promise(() => {});
  assert.equal(
    (await handleCotCronRequest(cron(), { ...subject, deadlineMs: 5 })).status,
    503,
  );
  assert.equal(subject.messages.length, 0);
});

test("internal COT signer refuses arbitrary backend paths", async () => {
  const subject = harness();
  await assert.rejects(
    cotBackendRequest(
      "../commands",
      {},
      gatewayConfiguration(ENV),
      subject,
      new AbortController().signal,
    ),
  );
  assert.equal(subject.calls.length, 0);
});

test("worker does not refresh before due time and rejects foreign topics or data-bearing messages", async () => {
  const subject = harness();
  await assert.rejects(
    processCotMessage(MESSAGE, META, subject),
    (e) => e.code === "COT_WAIT" && e.retryAt === RUN_NOW,
  );
  for (const [message, meta] of [
    [{ ...MESSAGE, journal: "private" }, META],
    [MESSAGE, { ...META, topicName: "other" }],
    [MESSAGE, { ...META, region: "iad1" }],
  ])
    await assert.rejects(
      processCotMessage(message, meta, subject),
      (e) => e.code === "COT_INVALID_JOB",
    );
  assert.equal(subject.calls.length, 0);
});

test("completed, duplicate and expired releases are acknowledged without storage work", async () => {
  for (const status of ["complete", "already-complete", "expired"]) {
    const subject = harness({ status });
    subject.now = () => RUN_NOW;
    await processCotMessage(MESSAGE, META, subject);
    assert.equal(
      subject.calls[0].url,
      `${ENV.MACRO_BACKEND_ORIGIN}/internal/cot/run`,
    );
    assert.deepEqual(JSON.parse(subject.calls[0].options.body), {
      releaseDate: JOB.releaseDate,
    });
    assert.equal(
      subject.calls[0].options.headers["X-Macro-Signature"],
      signature(subject.calls[0]),
    );
    assert.equal(subject.messages.length, 0);
  }
});

test("worker uploads a prepared immutable private package, verifies readback, then signs completion", async () => {
  const f = fixture(),
    blob = blobStore(f),
    subject = harness();
  subject.now = () => RUN_NOW;
  subject.blob = blob;
  subject.fetch = async (url, options) => {
    subject.calls.push({ url, options });
    if (url.endsWith("/run"))
      return Response.json({ status: "prepared", prepared: f.value });
    assert.deepEqual(JSON.parse(options.body), {
      releaseDate: JOB.releaseDate,
      leaseId: f.value.leaseId,
    });
    assert.deepEqual(
      blob.events.map((v) => v[0]),
      ["get", "put", "get"],
    );
    return Response.json({ status: "complete" });
  };
  await processCotMessage(MESSAGE, META, subject);
  assert.equal(subject.calls.length, 2);
  assert.equal(
    subject.calls[1].options.headers["X-Macro-Signature"],
    signature(subject.calls[1]),
  );
  const upload = blob.events.find((v) => v[0] === "put");
  assert.equal(upload[2].access, "private");
  assert.equal(upload[2].allowOverwrite, false);
  assert.equal(upload[2].addRandomSuffix, false);
  assert.equal(blob.events.at(-1)[2].useCache, false);
});

test("uncertain upload response is resolved by byte-identical readback without overwriting", async () => {
  const f = fixture(),
    blob = blobStore(f),
    original = blob.put;
  blob.put = async (...args) => {
    await original(...args);
    throw new Error("secret-provider-token");
  };
  assert.equal(
    await storePreparedCot(
      f.value,
      { env: ENV, blob },
      new AbortController().signal,
    ),
    f.value.leaseId,
  );
  await storePreparedCot(
    f.value,
    { env: ENV, blob },
    new AbortController().signal,
  );
  assert.equal(blob.events.filter((v) => v[0] === "put").length, 1);
});

test("prepared package rejects path traversal, arbitrary object names, bad hashes and noncanonical base64", async () => {
  const f = fixture();
  for (const patch of [
    { objectPath: "private-media/original.png" },
    { objectPath: f.value.objectPath.replace("/v1/", "/v1/../") },
    { generation: "82c297ba-9f6c-472e-bd4f-e854889fb399" },
    { leaseId: "invalid" },
    { transferSha256: "0".repeat(64) },
    { transferBytes: MAX_COT_GZIP_BYTES + 1 },
    { transferBytes: f.value.transferBytes - 1 },
    { dataBase64: f.value.dataBase64 + "\n" },
    { token: "unexpected" },
  ]) {
    const blob = blobStore(f);
    await assert.rejects(
      storePreparedCot(
        { ...f.value, ...patch },
        { env: ENV, blob },
        new AbortController().signal,
      ),
      /COT_STORAGE_UNAVAILABLE/,
    );
    assert.equal(blob.events.length, 0);
  }
});

test("corrupt remote bytes prevent completion and sanitize storage errors", async () => {
  const f = fixture(),
    subject = harness({ status: "prepared", prepared: f.value });
  subject.now = () => RUN_NOW;
  subject.blob = {
    async get() {
      throw new Error("secret-blob-token");
    },
  };
  await assert.rejects(
    processCotMessage(MESSAGE, META, subject),
    (e) => e.message === "COT_JOB_UNAVAILABLE",
  );
  assert.equal(subject.calls.length, 1);
  const blob = blobStore(f);
  await blob.put(f.value.objectPath, f.bytes, {});
  const get = blob.get;
  blob.get = async (...args) => {
    const response = await get(...args);
    response.stream = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.alloc(f.bytes.length));
        c.close();
      },
    });
    return response;
  };
  await assert.rejects(
    storePreparedCot(f.value, { env: ENV, blob }, new AbortController().signal),
    /COT_STORAGE_UNAVAILABLE/,
  );
});

test("backend wait remains a bounded retry and never causes new queue messages", async () => {
  const retryAt = "2026-09-25T20:15:00Z";
  const subject = harness({ status: "wait", retryAt });
  subject.now = () => RUN_NOW;
  await assert.rejects(processCotMessage(MESSAGE, META, subject), (e) => {
    assert.deepEqual(cotRetry(e, META, RUN_NOW), { afterSeconds: 900 });
    return true;
  });
  assert.equal(subject.messages.length, 0);
  assert.deepEqual(
    cotRetry(new CotJobError("COT_WAIT", RUN_NOW + 10_000_000), META, RUN_NOW),
    { afterSeconds: 3600 },
  );
  assert.deepEqual(cotRetry(new Error("provider failure"), META, RUN_NOW), {
    afterSeconds: 900,
  });
  assert.deepEqual(
    cotRetry(
      new Error("provider failure"),
      { ...META, deliveryCount: MAX_DELIVERIES },
      RUN_NOW,
    ),
    { acknowledge: true },
  );
  assert.deepEqual(
    cotRetry(new CotJobError("COT_INVALID_JOB"), META, RUN_NOW),
    { acknowledge: true },
  );
  assert.deepEqual(
    cotRetry(
      new Error("provider failure"),
      { ...META, expiresAt: new Date(RUN_NOW + 100) },
      RUN_NOW,
    ),
    { acknowledge: true },
  );
});

test("worker function is a separate private trigger; cron stays daily and routes only to gateway", async () => {
  assert.equal(typeof service.fetch, "function");
  const config = JSON.parse(
    await readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    config.crons.filter((cron) => cron.path === "/api/cron/cot"),
    [{ path: "/api/cron/cot", schedule: "0 16 * * *" }],
  );
  const worker = config.services["cot-worker"];
  assert.equal(worker.entrypoint, "server/cot/service.mjs");
  assert.deepEqual(worker.functions[worker.entrypoint].experimentalTriggers, [
    {
      type: "queue/v2beta",
      topic: COT_TOPIC,
      maxDeliveries: MAX_DELIVERIES,
      retryAfterSeconds: 900,
      maxConcurrency: 1,
    },
  ]);
  assert.equal(
    config.services.gateway.functions[config.services.gateway.entrypoint]
      .experimentalTriggers,
    undefined,
  );
  assert.equal(
    config.rewrites.some((v) => v.destination?.service === "cot-worker"),
    false,
  );
});
