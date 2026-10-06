import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { createHash, createHmac } from "node:crypto";
import {
  handleProviderCronRequest,
  processProviderMessage,
  providerRetry,
  scheduleProviderJobs,
  retireProviderObjects,
} from "./index.mjs";
import { PROVIDER_TOPIC } from "./queue.mjs";
const { Request, Response, AbortController } = globalThis;
const NOW = Date.parse("2026-09-27T00:00:00Z");
const ENV = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  MACRO_ECONOMIC_AUTOMATION: "1",
  MACRO_MYFXBOOK_AUTOMATION: "1",
  MACRO_WORKSPACE_ID: "synthetic-provider-test",
  MACRO_GATEWAY_SECRET: "42".repeat(32),
  MACRO_WEB_ORIGINS: "https://provider.example.test",
  MACRO_BACKEND_ORIGIN: "https://backend.example.test",
  CRON_SECRET: "synthetic-cron-secret-with-no-cloud-access",
};
const JOB = {
  jobId: "968f3824-e402-42e1-8f5c-7cbd5587e5b0",
  dueAt: "2026-09-27T06:00:00+00:00",
};
const META = {
  topicName: PROVIDER_TOPIC,
  region: "fra1",
  deliveryCount: 1,
  expiresAt: new Date(NOW + 86400000),
};
function harness(jobs = [JOB]) {
  const calls = [],
    sent = [];
  return {
    calls,
    sent,
    env: ENV,
    now: () => NOW,
    async fetch(url, options) {
      calls.push({ url, options });
      return Response.json(url.endsWith("/retire") ? { paths: [] } : { jobs });
    },
    async send(...args) {
      sent.push(args);
      return { messageId: "synthetic-message" };
    },
  };
}
function request(token = ENV.CRON_SECRET) {
  return new Request(`${ENV.MACRO_WEB_ORIGINS}/api/cron/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
test("cron authentication fails before any provider or queue call", async () => {
  const h = harness();
  for (const token of ["", "wrong", "x".repeat(500)]) {
    assert.equal(
      (await handleProviderCronRequest(request(token), h)).status,
      401,
    );
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.sent.length, 0);
});
test("daily dispatch sends a signed internal request and delayed idempotent messages", async () => {
  const h = harness();
  const response = await handleProviderCronRequest(request(), h);
  assert.equal(response.status, 200);
  const { url, options } = h.calls[0],
    headers = options.headers;
  assert.equal(new URL(url).pathname, "/internal/providers/plan");
  const signature = createHmac(
    "sha256",
    Buffer.from(ENV.MACRO_GATEWAY_SECRET, "hex"),
  )
    .update(
      `v1\n${headers["X-Macro-Timestamp"]}\n${headers["X-Macro-Nonce"]}\nPOST\n/internal/providers/plan\n${createHash("sha256").update(options.body).digest("hex")}`,
    )
    .digest("hex");
  assert.equal(headers["X-Macro-Signature"], signature);
  assert.deepEqual(h.sent[0], [
    PROVIDER_TOPIC,
    { version: 1, job: JOB },
    {
      delaySeconds: 21600,
      retentionSeconds: 86400,
      idempotencyKey: `provider:${JOB.jobId}:2026-09-27`,
    },
  ]);
  assert.equal(
    JSON.stringify(h.sent).includes(ENV.MACRO_GATEWAY_SECRET),
    false,
  );
});
test("preview deployments and unconfigured production never run jobs", async () => {
  for (const env of [
    { ...ENV, VERCEL_ENV: "preview" },
    { ...ENV, MACRO_ECONOMIC_AUTOMATION: "0", MACRO_MYFXBOOK_AUTOMATION: "0" },
  ]) {
    const h = { ...harness(), env };
    assert.equal((await handleProviderCronRequest(request(), h)).status, 503);
    assert.equal(h.calls.length, 0);
  }
});
test("report-only production schedules through the existing protected provider worker", async () => {
  const h = {
    ...harness(),
    env: {
      ...ENV,
      MACRO_ECONOMIC_AUTOMATION: "0",
      MACRO_MYFXBOOK_AUTOMATION: "0",
      MACRO_REPORT_AUTOMATION: "1",
    },
  };
  assert.equal((await handleProviderCronRequest(request(), h)).status, 200);
  assert.equal(h.sent.length, 1);
  assert.ok(
    h.calls.some(({ url }) => url.endsWith("/internal/providers/plan")),
  );
  const disabled = {
    ...harness(),
    env: { ...h.env, MACRO_REPORT_AUTOMATION: "0" },
  };
  assert.equal(
    (await handleProviderCronRequest(request(), disabled)).status,
    503,
  );
  assert.equal(disabled.calls.length, 0);
});
test("deferred queue acceptance does not interrupt the remaining weekly jobs", async () => {
  const h = harness([
    JOB,
    { ...JOB, jobId: "b0149af0-3620-4b7c-8d5d-ab84f91fd897" },
  ]);
  h.send = async (...args) => {
    h.sent.push(args);
    return { messageId: null };
  };
  assert.equal((await handleProviderCronRequest(request(), h)).status, 200);
  assert.equal(h.sent.length, 2);
  h.send = async () => ({});
  await assert.rejects(scheduleProviderJobs(h, new AbortController().signal), {
    code: "PROVIDERS_QUEUE_UNAVAILABLE",
  });
});
test("invalid jobs, impossible dates, non-UUID IDs and schedules past queue retention fail closed", async () => {
  for (const job of [
    { ...JOB, jobId: "../../secret" },
    { ...JOB, dueAt: "2026-02-30T06:00:00Z" },
    { ...JOB, dueAt: "2026-09-28T06:00:00Z" },
    { ...JOB, url: "https://evil.invalid" },
  ]) {
    const h = harness([job]);
    await assert.rejects(
      scheduleProviderJobs(h, new AbortController().signal),
      { code: "PROVIDERS_INVALID_JOB" },
    );
    assert.equal(h.sent.length, 0);
  }
});
test("an early delivery cannot fetch a release before its one-hour due time", async () => {
  const h = harness();
  await assert.rejects(
    processProviderMessage({ version: 1, job: JOB }, META, h),
    { code: "PROVIDERS_WAIT" },
  );
  assert.equal(h.calls.length, 0);
});
test("a completed account job queues newly discovered work without repeating a data import", async () => {
  const h = harness([]);
  h.now = () => Date.parse(JOB.dueAt);
  h.fetch = async (url, options) => {
    h.calls.push({ url, options });
    return Response.json(
      url.endsWith("/run") ? { status: "complete" } : { jobs: [] },
    );
  };
  await processProviderMessage({ version: 1, job: JOB }, META, h);
  assert.deepEqual(
    h.calls.map((c) => new URL(c.url).pathname),
    ["/internal/providers/run", "/internal/providers/plan"],
  );
});
test("retry respects durable lease delays and stops after bounded deliveries or expiry", () => {
  assert.deepEqual(providerRetry({ retryAt: NOW + 1800000 }, META, NOW), {
    afterSeconds: 1800,
  });
  assert.deepEqual(providerRetry(new Error("temporary"), META, NOW), {
    afterSeconds: 900,
  });
  assert.deepEqual(
    providerRetry(new Error("temporary"), { ...META, deliveryCount: 8 }, NOW),
    { acknowledge: true },
  );
  assert.deepEqual(
    providerRetry({ code: "PROVIDERS_INVALID_JOB" }, META, NOW),
    { acknowledge: true },
  );
  assert.deepEqual(
    providerRetry(
      new Error("temporary"),
      { ...META, expiresAt: new Date(NOW + 500) },
      NOW,
    ),
    { acknowledge: true },
  );
});
test("an incomplete release is rescheduled durably before acknowledging its current delivery", async () => {
  const h = harness([]);
  h.now = () => Date.parse(JOB.dueAt);
  const retryAt = "2026-09-27T06:30:00Z";
  h.fetch = async (url, options) => {
    h.calls.push({ url, options });
    return Response.json({ status: "wait", retryAt });
  };
  await processProviderMessage({ version: 1, job: JOB }, META, h);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.sent, [
    [
      PROVIDER_TOPIC,
      {
        version: 1,
        job: { ...JOB, dueAt: "2026-09-27T06:30:00.000Z" },
      },
      {
        delaySeconds: 1800,
        retentionSeconds: 64800,
        idempotencyKey: `provider-wait:${JOB.jobId}:2026-09-27T06:30:00.000Z`,
      },
    ],
  ]);
  h.send = async () => ({ messageId: null });
  await processProviderMessage({ version: 1, job: JOB }, META, h);
  h.send = async () => {
    throw new Error("private provider diagnostics");
  };
  await assert.rejects(
    processProviderMessage({ version: 1, job: JOB }, META, h),
    {
      code: "PROVIDERS_QUEUE_UNAVAILABLE",
      message: "PROVIDERS_QUEUE_UNAVAILABLE",
    },
  );
});
test("business retries cannot outlive the original message retention", async () => {
  const h = harness([]);
  h.now = () => Date.parse(JOB.dueAt);
  h.fetch = async () =>
    Response.json({ status: "wait", retryAt: "2026-09-28T00:00:00Z" });
  await assert.rejects(
    processProviderMessage({ version: 1, job: JOB }, META, h),
    { code: "PROVIDERS_WAIT" },
  );
  assert.equal(h.sent.length, 0);
});
test("deadline cancels a stalled request and hides internal errors", async () => {
  const h = {
    ...harness(),
    deadlineMs: 20,
    fetch: (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(Error("synthetic-secret")),
          { once: true },
        ),
      ),
  };
  const response = await handleProviderCronRequest(request(), h);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("synthetic-secret"), false);
});
test("retention refuses media paths or URLs even in a signed backend response", async () => {
  for (const path of [
    "media/original.png",
    "https://evil.invalid/object",
    "public-cache/v1/../../journal.sqlite",
  ]) {
    const h = harness();
    let deleted = false;
    h.fetch = async () => Response.json({ paths: [path] });
    h.blob = {
      del: async () => {
        deleted = true;
      },
    };
    await assert.rejects(
      retireProviderObjects(h, new AbortController().signal),
    );
    assert.equal(deleted, false);
  }
});
test("uploaded economic shards are independently completed without carrying file bytes through JSON", async () => {
  const h = harness([]);
  h.now = () => Date.parse(JOB.dueAt);
  const leaseId = "c37c8478-3d2e-428c-80b2-ae5211d80be2";
  h.fetch = async (url, options) => {
    h.calls.push({ url, options });
    return Response.json(
      url.endsWith("/run")
        ? { status: "uploaded", leaseId }
        : url.endsWith("/complete")
          ? { status: "complete" }
          : { jobs: [] },
    );
  };
  await processProviderMessage({ version: 1, job: JOB }, META, h);
  assert.equal(JSON.parse(h.calls[1].options.body).leaseId, leaseId);
  assert.deepEqual(
    h.calls.map((c) => new URL(c.url).pathname),
    [
      "/internal/providers/run",
      "/internal/providers/complete",
      "/internal/providers/plan",
    ],
  );
});
