import { createHash, timingSafeEqual } from "node:crypto";
import { env as processEnv } from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import {
  cotBackendRequest,
  gatewayConfiguration,
  gatewayJsonResponse,
} from "../gateway/index.mjs";
import { COT_TOPIC, MAX_DELIVERIES, cotQueue } from "./queue.mjs";
import { storePreparedCot } from "./storage.mjs";

const DAY_SECONDS = 24 * 60 * 60;
const PLAN_DEADLINE_MS = 20_000;
const WORKER_DEADLINE_MS = 110_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/;

export class CotJobError extends Error {
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

function date(value) {
  return (
    typeof value === "string" &&
    DATE.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
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
    !object(value, ["releaseDate", "reportDate", "dueAt"]) ||
    !date(value.releaseDate) ||
    !date(value.reportDate) ||
    !timestamp(value.dueAt) ||
    value.reportDate > value.releaseDate ||
    Date.parse(value.dueAt) < Date.parse(value.releaseDate) ||
    Date.parse(value.dueAt) >=
      Date.parse(value.releaseDate) + 7 * DAY_SECONDS * 1000
  )
    throw new CotJobError("COT_INVALID_JOB");
  return {
    releaseDate: value.releaseDate,
    reportDate: value.reportDate,
    dueAt: value.dueAt,
  };
}

function options(dependencies) {
  return {
    env: dependencies.env ?? processEnv,
    fetch: dependencies.fetch ?? globalThis.fetch,
    now: dependencies.now ?? Date.now,
    send: dependencies.send ?? cotQueue.send,
    blob: dependencies.blob,
  };
}

function configuration(env) {
  if (env.VERCEL_ENV !== "production" || env.MACRO_COT_AUTOMATION !== "1")
    throw new CotJobError("COT_NOT_CONFIGURED");
  return gatewayConfiguration(env);
}

function authorized(request, secret) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(secret))
    return false;
  const actual = request.headers.get("authorization") ?? "";
  if (actual.length > 300) return false;
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(`Bearer ${secret}`).digest(),
  );
}

async function bounded(milliseconds, sourceSignal, operation) {
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  sourceSignal?.addEventListener("abort", cancel, { once: true });
  if (sourceSignal?.aborted) controller.abort();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CotJobError("COT_TIMEOUT"));
    }, milliseconds);
  });
  try {
    if (controller.signal.aborted) throw new CotJobError("COT_TIMEOUT");
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    sourceSignal?.removeEventListener("abort", cancel);
  }
}

/** Vercel's native cron crosses deployment protection; the secret scopes this route. */
export async function handleCotCronRequest(request, dependencies = {}) {
  if (request.method !== "GET")
    return gatewayJsonResponse(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED" } },
      405,
      { Allow: "GET" },
    );
  const settings = options(dependencies);
  if (!authorized(request, settings.env.CRON_SECRET))
    return gatewayJsonResponse(
      { ok: false, error: { code: "COT_CRON_UNAUTHORIZED" } },
      401,
    );
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/cot" || url.search || url.hash)
    return gatewayJsonResponse(
      { ok: false, error: { code: "COT_INVALID_REQUEST" } },
      400,
    );
  try {
    const config = configuration(settings.env);
    return await bounded(
      dependencies.deadlineMs ?? PLAN_DEADLINE_MS,
      request.signal,
      async (signal) => {
        const planned = await cotBackendRequest(
          "plan",
          {},
          config,
          settings,
          signal,
        );
        if (!object(planned, ["job"]) || !Object.hasOwn(planned, "job"))
          throw new CotJobError("COT_INVALID_JOB");
        if (planned.job === null)
          return gatewayJsonResponse({ ok: true, scheduled: false });
        const scheduled = job(planned.job);
        const delaySeconds = Math.max(
          0,
          Math.ceil((Date.parse(scheduled.dueAt) - settings.now()) / 1000),
        );
        // The daily planner may catch up an older release, but cannot create distant jobs.
        if (delaySeconds >= DAY_SECONDS || signal.aborted)
          throw new CotJobError("COT_INVALID_JOB");
        const result = await settings.send(
          COT_TOPIC,
          { version: 1, job: scheduled },
          {
            delaySeconds,
            retentionSeconds: DAY_SECONDS,
            idempotencyKey: `cot:${scheduled.releaseDate}:${new Date(settings.now()).toISOString().slice(0, 10)}`,
          },
        );
        // Deferred regional delivery is accepted by the queue with a null ID.
        if (
          signal.aborted ||
          (typeof result?.messageId !== "string" && result?.messageId !== null)
        )
          throw new CotJobError("COT_QUEUE_UNAVAILABLE");
        return gatewayJsonResponse({
          ok: true,
          scheduled: true,
          releaseDate: scheduled.releaseDate,
          dueAt: scheduled.dueAt,
        });
      },
    );
  } catch {
    return gatewayJsonResponse(
      {
        ok: false,
        error: {
          code: "COT_SCHEDULER_UNAVAILABLE",
          message:
            "Die automatische COT-Aktualisierung konnte noch nicht eingeplant werden.",
        },
      },
      503,
    );
  }
}

function result(value, allowPrepared = true) {
  if (
    !object(value, ["status", "retryAt", "prepared"]) ||
    ![
      "complete",
      "already-complete",
      "wait",
      "expired",
      ...(allowPrepared ? ["prepared"] : []),
    ].includes(value.status)
  )
    throw new CotJobError("COT_INVALID_RESPONSE");
  if (value.status === "wait") {
    if (!timestamp(value.retryAt))
      throw new CotJobError("COT_INVALID_RESPONSE");
    throw new CotJobError("COT_WAIT", Date.parse(value.retryAt));
  }
  if (value.status !== "prepared" && value.prepared !== undefined)
    throw new CotJobError("COT_INVALID_RESPONSE");
  return value;
}

export async function processCotMessage(message, metadata, dependencies = {}) {
  const settings = options(dependencies);
  if (
    !object(message, ["version", "job"]) ||
    message.version !== 1 ||
    metadata?.topicName !== COT_TOPIC ||
    metadata?.region !== "fra1"
  )
    throw new CotJobError("COT_INVALID_JOB");
  const scheduled = job(message.job);
  const dueAt = Date.parse(scheduled.dueAt);
  if (dueAt > settings.now()) throw new CotJobError("COT_WAIT", dueAt);
  try {
    const config = configuration(settings.env);
    return await bounded(
      dependencies.deadlineMs ?? WORKER_DEADLINE_MS,
      undefined,
      async (signal) => {
        const outcome = result(
          await cotBackendRequest(
            "run",
            { releaseDate: scheduled.releaseDate },
            config,
            settings,
            signal,
          ),
        );
        if (outcome.status !== "prepared") return;
        const leaseId = await storePreparedCot(
          outcome.prepared,
          settings,
          signal,
        );
        result(
          await cotBackendRequest(
            "complete",
            { releaseDate: scheduled.releaseDate, leaseId },
            config,
            settings,
            signal,
          ),
          false,
        );
      },
    );
  } catch (error) {
    // Never let SDK/provider errors serialize credentials, URLs, or uploaded bytes.
    if (error instanceof CotJobError) throw error;
    throw new CotJobError("COT_JOB_UNAVAILABLE");
  }
}

export function cotRetry(error, metadata, now = Date.now()) {
  const expiresAt =
    metadata?.expiresAt instanceof Date ? metadata.expiresAt.getTime() : NaN;
  if (
    error?.code === "COT_INVALID_JOB" ||
    !Number.isInteger(metadata?.deliveryCount) ||
    metadata.deliveryCount >= MAX_DELIVERIES ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  )
    return { acknowledge: true };
  const afterSeconds =
    error instanceof CotJobError && Number.isFinite(error.retryAt)
      ? Math.min(3600, Math.max(1, Math.ceil((error.retryAt - now) / 1000)))
      : 900;
  return now + afterSeconds * 1000 >= expiresAt
    ? { acknowledge: true }
    : { afterSeconds };
}
