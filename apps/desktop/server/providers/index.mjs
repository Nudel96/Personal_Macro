import { createHash, timingSafeEqual } from "node:crypto";
import { env as processEnv } from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import {
  gatewayConfiguration,
  gatewayJsonResponse,
  providerBackendRequest,
} from "../gateway/index.mjs";
import { storePreparedCot as storePreparedPublic } from "../cot/storage.mjs";
import { PROVIDER_TOPIC, providerQueue } from "./queue.mjs";
import { del } from "@vercel/blob";

const DAY = 86400;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const UTC_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/;
export class ProviderJobError extends Error {
  constructor(code, retryAt) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
}
function object(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function options(deps) {
  return {
    env: deps.env ?? processEnv,
    fetch: deps.fetch ?? globalThis.fetch,
    now: deps.now ?? Date.now,
    send: deps.send ?? providerQueue.send,
    blob: deps.blob,
  };
}
function configured(env) {
  if (
    env.VERCEL_ENV !== "production" ||
    ![
      env.MACRO_ECONOMIC_AUTOMATION,
      env.MACRO_MYFXBOOK_AUTOMATION,
      env.MACRO_REPORT_AUTOMATION,
    ].includes("1")
  )
    throw new ProviderJobError("PROVIDERS_NOT_CONFIGURED");
  return gatewayConfiguration(env);
}
function timestamp(value) {
  return (
    typeof value === "string" &&
    UTC_TIME.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
function job(value) {
  if (
    !object(value, ["jobId", "dueAt"]) ||
    !UUID.test(value.jobId) ||
    !timestamp(value.dueAt)
  )
    throw new ProviderJobError("PROVIDERS_INVALID_JOB");
  return { jobId: value.jobId, dueAt: value.dueAt };
}
async function bounded(ms, source, work) {
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  source?.addEventListener("abort", cancel, { once: true });
  if (source?.aborted) controller.abort();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderJobError("PROVIDERS_TIMEOUT"));
    }, ms);
  });
  try {
    if (controller.signal.aborted)
      throw new ProviderJobError("PROVIDERS_TIMEOUT");
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    source?.removeEventListener("abort", cancel);
  }
}
export async function scheduleProviderJobs(dependencies = {}, signal) {
  const settings = options(dependencies),
    config = configured(settings.env);
  const planned = await providerBackendRequest(
    "plan",
    {},
    config,
    settings,
    signal,
  );
  if (
    !object(planned, ["jobs"]) ||
    !Array.isArray(planned.jobs) ||
    planned.jobs.length > 256
  )
    throw new ProviderJobError("PROVIDERS_INVALID_JOB");
  const scheduled = planned.jobs.map(job);
  for (const entry of scheduled) {
    const delaySeconds = Math.max(
      0,
      Math.ceil((Date.parse(entry.dueAt) - settings.now()) / 1000),
    );
    if (delaySeconds >= DAY || signal?.aborted)
      throw new ProviderJobError("PROVIDERS_INVALID_JOB");
    const sent = await settings.send(
      PROVIDER_TOPIC,
      { version: 1, job: entry },
      {
        delaySeconds,
        retentionSeconds: DAY,
        idempotencyKey: `provider:${entry.jobId}:${new Date(settings.now()).toISOString().slice(0, 10)}`,
      },
    );
    // The SDK returns null for a successful 202 deferred acceptance.
    if (
      (typeof sent?.messageId !== "string" && sent?.messageId !== null) ||
      signal?.aborted
    )
      throw new ProviderJobError("PROVIDERS_QUEUE_UNAVAILABLE");
  }
  return scheduled.length;
}
async function deferProviderJob(scheduled, retryAt, metadata, settings) {
  const expires =
    metadata?.expiresAt instanceof Date ? metadata.expiresAt.getTime() : NaN;
  const remaining = Math.floor((expires - settings.now()) / 1000);
  const delaySeconds = Math.max(
    1,
    Math.ceil((retryAt - settings.now()) / 1000),
  );
  if (
    !Number.isFinite(retryAt) ||
    !Number.isInteger(remaining) ||
    remaining < 60 ||
    remaining > DAY ||
    delaySeconds >= remaining
  )
    throw new ProviderJobError("PROVIDERS_WAIT", retryAt);
  // A business wait is a future task, not a failed in-flight delivery. Acknowledge
  // this message only after its replacement is durably accepted by the queue.
  try {
    await bounded(15000, undefined, async (signal) => {
      const dueAt = new Date(retryAt).toISOString();
      const sent = await settings.send(
        PROVIDER_TOPIC,
        { version: 1, job: { jobId: scheduled.jobId, dueAt } },
        {
          delaySeconds,
          retentionSeconds: remaining,
          idempotencyKey: `provider-wait:${scheduled.jobId}:${dueAt}`,
        },
      );
      if (
        (typeof sent?.messageId !== "string" && sent?.messageId !== null) ||
        signal.aborted
      )
        throw new ProviderJobError("PROVIDERS_QUEUE_UNAVAILABLE");
    });
  } catch {
    throw new ProviderJobError("PROVIDERS_QUEUE_UNAVAILABLE");
  }
}
export async function nudgeProviderJobs(dependencies = {}) {
  return bounded(15000, undefined, (signal) =>
    scheduleProviderJobs(dependencies, signal),
  );
}
export async function retireProviderObjects(settings, signal) {
  const config = configured(settings.env);
  const result = await providerBackendRequest(
    "retire",
    {},
    config,
    settings,
    signal,
  );
  const path =
    /^public-cache\/v1\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/[a-f0-9]{64}\.sqlite\.gz$/;
  if (
    !object(result, ["paths"]) ||
    !Array.isArray(result.paths) ||
    result.paths.length > 128 ||
    result.paths.some((p) => typeof p !== "string" || !path.test(p))
  )
    throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
  if (!result.paths.length) return;
  await (settings.blob?.del ?? del)(result.paths, {
    token: settings.env.BLOB_READ_WRITE_TOKEN,
    abortSignal: signal,
  });
  for (let start = 0; start < result.paths.length; start += 24) {
    const receipt = await providerBackendRequest(
      "retired",
      { paths: result.paths.slice(start, start + 24) },
      config,
      settings,
      signal,
    );
    if (!object(receipt, ["ok"]) || receipt.ok !== true)
      throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
  }
}
export async function handleProviderCronRequest(request, dependencies = {}) {
  if (request.method !== "GET")
    return gatewayJsonResponse(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED" } },
      405,
      { Allow: "GET" },
    );
  const settings = options(dependencies),
    secret = settings.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  if (
    typeof secret !== "string" ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(secret) ||
    actual.length > 300 ||
    !timingSafeEqual(
      createHash("sha256").update(actual).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest(),
    )
  )
    return gatewayJsonResponse(
      { ok: false, error: { code: "PROVIDERS_CRON_UNAUTHORIZED" } },
      401,
    );
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/providers" || url.search || url.hash)
    return gatewayJsonResponse(
      { ok: false, error: { code: "INVALID_REQUEST" } },
      400,
    );
  try {
    return await bounded(
      dependencies.deadlineMs ?? 30000,
      request.signal,
      async (signal) => {
        const scheduled = await scheduleProviderJobs(settings, signal);
        await retireProviderObjects(settings, signal);
        return gatewayJsonResponse({ ok: true, scheduled });
      },
    );
  } catch {
    return gatewayJsonResponse(
      {
        ok: false,
        error: {
          code: "PROVIDERS_SCHEDULER_UNAVAILABLE",
          message:
            "Die automatischen Aktualisierungen konnten noch nicht eingeplant werden.",
        },
      },
      503,
    );
  }
}
function result(value, allowPrepared = true) {
  if (
    !object(value, ["status", "retryAt", "prepared", "leaseId"]) ||
    ![
      "complete",
      "already-complete",
      "cancelled",
      "expired",
      "wait",
      ...(allowPrepared ? ["prepared", "uploaded"] : []),
    ].includes(value.status)
  )
    throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
  if (value.status === "uploaded" && !UUID.test(value.leaseId))
    throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
  if (value.status === "wait") {
    if (!timestamp(value.retryAt))
      throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
    throw new ProviderJobError("PROVIDERS_WAIT", Date.parse(value.retryAt));
  }
  if (value.status !== "prepared" && value.prepared !== undefined)
    throw new ProviderJobError("PROVIDERS_INVALID_RESPONSE");
  return value;
}
export async function processProviderMessage(
  message,
  metadata,
  dependencies = {},
) {
  if (
    !object(message, ["version", "job"]) ||
    message.version !== 1 ||
    metadata?.topicName !== PROVIDER_TOPIC ||
    metadata?.region !== "fra1"
  )
    throw new ProviderJobError("PROVIDERS_INVALID_JOB");
  const settings = options(dependencies),
    scheduled = job(message.job);
  if (Date.parse(scheduled.dueAt) > settings.now())
    throw new ProviderJobError("PROVIDERS_WAIT", Date.parse(scheduled.dueAt));
  try {
    const config = configured(settings.env);
    return await bounded(
      dependencies.deadlineMs ?? 110000,
      undefined,
      async (signal) => {
        const outcome = result(
          await providerBackendRequest(
            "run",
            { jobId: scheduled.jobId },
            config,
            settings,
            signal,
          ),
        );
        if (outcome.status === "prepared") {
          const leaseId = await storePreparedPublic(
            outcome.prepared,
            settings,
            signal,
          );
          result(
            await providerBackendRequest(
              "complete",
              { jobId: scheduled.jobId, leaseId },
              config,
              settings,
              signal,
            ),
            false,
          );
        }
        if (outcome.status === "uploaded") {
          result(
            await providerBackendRequest(
              "complete",
              { jobId: scheduled.jobId, leaseId: outcome.leaseId },
              config,
              settings,
              signal,
            ),
            false,
          );
        }
        // A weekly planner can discover releases due before the next daily tick.
        // Queue idempotency and DB receipts make repeated dispatch harmless.
        await scheduleProviderJobs(settings, signal);
      },
    );
  } catch (error) {
    if (error instanceof ProviderJobError && error.code === "PROVIDERS_WAIT")
      return deferProviderJob(scheduled, error.retryAt, metadata, settings);
    if (error instanceof ProviderJobError) throw error;
    throw new ProviderJobError("PROVIDERS_JOB_UNAVAILABLE");
  }
}
export function providerRetry(error, metadata, now = Date.now()) {
  const expires =
    metadata?.expiresAt instanceof Date ? metadata.expiresAt.getTime() : NaN;
  if (
    error?.code === "PROVIDERS_INVALID_JOB" ||
    !Number.isInteger(metadata?.deliveryCount) ||
    metadata.deliveryCount >= 8 ||
    !Number.isFinite(expires) ||
    expires <= now
  )
    return { acknowledge: true };
  const afterSeconds = Number.isFinite(error?.retryAt)
    ? Math.min(3600, Math.max(1, Math.ceil((error.retryAt - now) / 1000)))
    : 900;
  return now + afterSeconds * 1000 >= expires
    ? { acknowledge: true }
    : { afterSeconds };
}
