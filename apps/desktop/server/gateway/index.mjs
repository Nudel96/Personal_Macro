import { Buffer } from "node:buffer";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { env as processEnv } from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Response headroom for complete analysis payloads; request limits stay fixed.
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const DEADLINE_MS = 90_000;
const COOKIE_NAME = "__Host-macro-session";
const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE_VERSION = "v1";
const COMMAND_NAME = /^[a-z][a-z0-9_]{0,127}$/;
const BUSINESS_ERRORS = {
  MYFXBOOK_AUTH: "Die Myfxbook-Anmeldung fehlt oder ist abgelaufen. Bitte erneut anmelden.",
  MYFXBOOK_GAP: "Myfxbook liefert höchstens 50 Transaktionen. Die Historie hat eine Lücke; bitte fehlende Trades ergänzen und die Verbindung erneut prüfen.",
  MYFXBOOK_NETWORK: "Myfxbook ist vorübergehend nicht erreichbar. Dein Journal bleibt unverändert.",
  MYFXBOOK_PROVIDER: "Myfxbook hat den Abruf abgelehnt. Bitte später erneut versuchen.",
  MYFXBOOK_CHANGED: "Myfxbook wurde während des Abrufs geändert. Bitte erneut prüfen.",
  MYFXBOOK_TIMEOUT: "Myfxbook hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.",
  MYFXBOOK_CURRENCY: "Die Kontowährung stimmt nicht mit Myfxbook überein.",
  MYFXBOOK_PNL: "Die Ergebnisberechnung ist nicht eindeutig. Bitte den Brokerbericht prüfen.",
  MYFXBOOK_BALANCE: "Die Kontosummen stimmen nicht überein. Bitte die Vorschau prüfen.",
  MYFXBOOK_CONCURRENT: "Das Konto wurde während des Abgleichs geändert. Bitte erneut prüfen.",
  MYFXBOOK_AMBIGUOUS: "Die Myfxbook-Transaktionen sind nicht eindeutig zuzuordnen. Bitte den Brokerbericht prüfen.",
  VALIDATION_ERROR:
    "Die Eingaben sind unvollständig oder ungültig. Bitte prüfe sie erneut.",
  CONFLICT:
    "Die Daten konnten wegen eines Konflikts nicht gespeichert werden. Bitte lade die Seite neu.",
  NOT_FOUND: "Der gewünschte Eintrag ist nicht mehr verfügbar.",
  COMMAND_UNAVAILABLE:
    "Diese Funktion ist in der privaten Browser-Version noch nicht verfügbar.",
  COMMAND_FAILED:
    "Die Aktion konnte nicht abgeschlossen werden. Bitte lade die Seite neu und prüfe den Datenstand.",
  RESPONSE_TOO_LARGE:
    "Die Datenmenge ist für diese Ansicht zu groß. Bitte schränke die Auswahl ein.",
};

const PUBLIC_ERRORS = {
  PRIVATE_WEB_NOT_CONFIGURED: [
    503,
    "Die private Datenanbindung ist noch nicht eingerichtet.",
  ],
  METHOD_NOT_ALLOWED: [405, "Diese Anfrageart wird nicht unterstützt."],
  ORIGIN_NOT_ALLOWED: [
    403,
    "Diese Anfrage stammt nicht aus deinem privaten Workspace.",
  ],
  SESSION_REQUIRED: [
    401,
    "Bitte lade den privaten Workspace neu, um die Sitzung zu erneuern.",
  ],
  CSRF_INVALID: [
    403,
    "Die Sitzung konnte nicht bestätigt werden. Bitte lade die Seite neu.",
  ],
  INVALID_REQUEST: [400, "Die Anfrage ist ungültig."],
  PAYLOAD_TOO_LARGE: [413, "Die Anfrage ist zu groß."],
  UNSUPPORTED_CONTENT_TYPE: [415, "Die Anfrage muss als JSON gesendet werden."],
  BACKEND_UNAVAILABLE: [
    502,
    "Die private Datenanbindung ist vorübergehend nicht erreichbar.",
  ],
  BACKEND_UNAUTHORIZED: [
    502,
    "Die private Datenanbindung konnte nicht bestätigt werden.",
  ],
  BACKEND_INVALID_RESPONSE: [
    502,
    "Die private Datenanbindung hat eine ungültige Antwort geliefert.",
  ],
  BACKEND_TIMEOUT: [
    504,
    "Die private Datenanbindung hat nicht rechtzeitig geantwortet.",
  ],
  REVISION_CONFLICT: [
    409,
    "Die Daten wurden inzwischen geändert. Bitte lade den aktuellen Stand neu.",
  ],
  COMMAND_NOT_AVAILABLE: [
    422,
    "Diese Funktion ist in der privaten Browser-Version noch nicht verfügbar.",
  ],
  COMMAND_REJECTED: [
    400,
    "Die Eingaben konnten nicht gespeichert werden. Bitte prüfe sie erneut.",
  ],
};

class GatewayError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The media route shares exactly the signed browser cookie and CSRF mechanism.
// These exports are server-only; none creates an authentication bypass.
export {
  GatewayError,
  configuration as gatewayConfiguration,
  jsonResponse as gatewayJsonResponse,
  failure as gatewayFailure,
};

export function authorizeMediaRequest(request, config, now = Date.now()) {
  const url = new URL(request.url);
  const write = request.method === "POST";
  if (
    !config.origins.has(url.origin) ||
    url.pathname !== "/api/media" ||
    url.hash ||
    (write && url.search)
  )
    throw new GatewayError("ORIGIN_NOT_ALLOWED");
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    (write && origin !== url.origin) ||
    (origin && origin !== url.origin) ||
    (site && site !== "same-origin" && !(site === "none" && !write))
  ) {
    throw new GatewayError("ORIGIN_NOT_ALLOWED");
  }
  const cookie = readSession(
    request,
    url.origin,
    config,
    Math.floor(now / 1000),
  );
  if (!cookie) throw new GatewayError("SESSION_REQUIRED");
  if (
    write &&
    !equalHex(
      request.headers.get("x-macro-csrf-token"),
      csrfToken(cookie, url.origin, config),
    )
  ) {
    throw new GatewayError("CSRF_INVALID");
  }
  return url.origin;
}

/** Internal media commands never travel through the public commands endpoint. */
export async function mediaBackendCommand(
  envelope,
  config,
  dependencies,
  signal,
) {
  const body = Buffer.from(JSON.stringify(envelope));
  if (body.length > MAX_BODY_BYTES) throw new GatewayError("PAYLOAD_TOO_LARGE");
  const nonce = randomUUID();
  const timestamp = String(Math.floor(dependencies.now() / 1000));
  const path = "/media/commands";
  const signature = mac(
    config.secret,
    `v1\n${timestamp}\n${nonce}\nPOST\n${path}\n${createHash("sha256").update(body).digest("hex")}`,
  );
  const response = await dependencies.fetch(`${config.backendOrigin}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Macro-Timestamp": timestamp,
      "X-Macro-Nonce": nonce,
      "X-Macro-Signature": signature,
    },
    body,
    redirect: "manual",
    cache: "no-store",
    signal,
  });
  if (response.status === 401 || response.status === 403)
    throw new GatewayError("BACKEND_UNAUTHORIZED");
  if (response.status === 409) throw new GatewayError("REVISION_CONFLICT");
  if (!response.ok) throw new GatewayError("BACKEND_UNAVAILABLE");
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new GatewayError("BACKEND_INVALID_RESPONSE");
  }
  return commandResponse(
    parseJson(
      await readLimited(
        response,
        signal,
        "BACKEND_INVALID_RESPONSE",
        MAX_RESPONSE_BYTES,
      ),
      "BACKEND_INVALID_RESPONSE",
    ),
  );
}

/** Server-only COT jobs use the same nonce-bound HMAC, never browser commands. */
export async function cotBackendRequest(
  action,
  value,
  config,
  dependencies,
  signal,
) {
  return scheduledBackendRequest("cot", action, value, config, dependencies, signal);
}

export async function providerBackendRequest(action, value, config, dependencies, signal) {
  return scheduledBackendRequest("providers", action, value, config, dependencies, signal);
}

async function scheduledBackendRequest(family, action, value, config, dependencies, signal) {
  if (!["plan", "run", "complete", ...(family === "providers" ? ["retire", "retired"] : [])].includes(action))
    throw new GatewayError("INVALID_REQUEST");
  const path = `/internal/${family}/${action}`;
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 4096) throw new GatewayError("PAYLOAD_TOO_LARGE");
  const nonce = randomUUID();
  const timestamp = String(Math.floor(dependencies.now() / 1000));
  const signature = mac(
    config.secret,
    `v1\n${timestamp}\n${nonce}\nPOST\n${path}\n${createHash("sha256").update(body).digest("hex")}`,
  );
  const response = await dependencies.fetch(`${config.backendOrigin}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Macro-Timestamp": timestamp,
      "X-Macro-Nonce": nonce,
      "X-Macro-Signature": signature,
    },
    body,
    redirect: "manual",
    cache: "no-store",
    signal,
  });
  if (response.status === 401 || response.status === 403)
    throw new GatewayError("BACKEND_UNAUTHORIZED");
  if (!response.ok) throw new GatewayError("BACKEND_UNAVAILABLE");
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    throw new GatewayError("BACKEND_INVALID_RESPONSE");
  return parseJson(
    await readLimited(
      response,
      signal,
      "BACKEND_INVALID_RESPONSE",
      MAX_RESPONSE_BYTES,
    ),
    "BACKEND_INVALID_RESPONSE",
  );
}

function failure(code, extraHeaders = {}) {
  const [status, message] = PUBLIC_ERRORS[code];
  return jsonResponse(
    { ok: false, error: { code, message } },
    status,
    extraHeaders,
  );
}

function jsonResponse(value, status = 200, extraHeaders = {}) {
  return new globalThis.Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...extraHeaders,
    },
  });
}

function parseOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.origin !== value.replace(/\/$/, "")
  ) {
    throw new GatewayError("PRIVATE_WEB_NOT_CONFIGURED");
  }
  return url.origin;
}

function configuration(env) {
  try {
    // Vercel's all-deployments owner-only protection is the identity boundary.
    // Neither this cookie nor the HMAC creates a second user authentication.
    if (env.VERCEL !== "1") throw new Error();
    if (!/^[a-fA-F0-9]{64}$/.test(env.MACRO_GATEWAY_SECRET ?? ""))
      throw new Error();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(env.MACRO_WORKSPACE_ID ?? ""))
      throw new Error();
    const origins = (env.MACRO_WEB_ORIGINS ?? "")
      .split(",")
      .map((part) => part.trim());
    if (!origins.length || origins.length > 20 || origins.some((part) => !part))
      throw new Error();
    return {
      backendOrigin: parseOrigin(env.MACRO_BACKEND_ORIGIN),
      origins: new Set(origins.map(parseOrigin)),
      secret: Buffer.from(env.MACRO_GATEWAY_SECRET, "hex"),
      workspaceId: env.MACRO_WORKSPACE_ID,
    };
  } catch {
    throw new GatewayError("PRIVATE_WEB_NOT_CONFIGURED");
  }
}

function validateOrigin(request, config, route) {
  const mutation = route === "commands";
  const url = new URL(request.url);
  if (
    !config.origins.has(url.origin) ||
    url.pathname !== `/api/${route}` ||
    url.search ||
    url.hash
  ) {
    throw new GatewayError("ORIGIN_NOT_ALLOWED");
  }
  const origin = request.headers.get("origin");
  if (
    (mutation && origin !== url.origin) ||
    (origin && origin !== url.origin)
  ) {
    throw new GatewayError("ORIGIN_NOT_ALLOWED");
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && !(site === "none" && !mutation)) {
    throw new GatewayError("ORIGIN_NOT_ALLOWED");
  }
  return url.origin;
}

function mac(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function equalHex(actual, expected) {
  return (
    typeof actual === "string" &&
    /^[a-f0-9]{64}$/.test(actual) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
  );
}

function sessionMac(value, origin, config) {
  return mac(
    config.secret,
    `macro-browser-session-v1\n${config.workspaceId}\n${origin}\n${value}`,
  );
}

function csrfToken(cookie, origin, config) {
  return mac(
    config.secret,
    `macro-browser-csrf-v1\n${config.workspaceId}\n${origin}\n${cookie}`,
  );
}

function readSession(request, origin, config, now) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (cookieHeader.length > 16_384) return null;
  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const cookie = matches[0].slice(COOKIE_NAME.length + 1);
  const parsed =
    /^(v1)\.([0-9]{10})\.([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.([a-f0-9]{64})$/.exec(
      cookie,
    );
  if (!parsed) return null;
  const issuedAt = Number(parsed[2]);
  if (issuedAt > now + 60 || now - issuedAt >= SESSION_SECONDS) return null;
  const signedValue = `${parsed[1]}.${parsed[2]}.${parsed[3]}`;
  return equalHex(parsed[4], sessionMac(signedValue, origin, config))
    ? cookie
    : null;
}

async function readLimited(message, signal, errorCode, maximumBytes) {
  const declared = message.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/.test(declared) || Number(declared) > maximumBytes)
  ) {
    throw new GatewayError(errorCode);
  }
  if (!message.body) return Buffer.alloc(0);
  const reader = message.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new GatewayError("BACKEND_TIMEOUT");
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) {
        cancel();
        throw new GatewayError(errorCode);
      }
      chunks.push(Buffer.from(next.value));
    }
    if (signal.aborted) throw new GatewayError("BACKEND_TIMEOUT");
    return Buffer.concat(chunks, bytes);
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(
      new globalThis.TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new GatewayError(code);
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validSession(value, config) {
  return (
    isObject(value) &&
    value.authenticated === true &&
    value.workspaceId === config.workspaceId &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.marketGeneration == null ||
      (typeof value.marketGeneration === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value.marketGeneration,
        ))) &&
    [value.capabilities, value.writableCommands].every(
      (commands) =>
        Array.isArray(commands) &&
        commands.length <= 1000 &&
        commands.every(
          (command) =>
            typeof command === "string" && COMMAND_NAME.test(command),
        ),
    )
  );
}

function commandResponse(value) {
  if (
    !isObject(value) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    throw new GatewayError("BACKEND_INVALID_RESPONSE");
  }
  if (value.ok === true && Object.hasOwn(value, "data")) {
    return jsonResponse({
      ok: true,
      data: value.data,
      revision: value.revision,
    });
  }
  if (value.ok === false && isObject(value.error)) {
    const code =
      typeof value.error.code === "string" &&
      Object.hasOwn(BUSINESS_ERRORS, value.error.code)
        ? value.error.code
        : "COMMAND_FAILED";
    // A confirmed business rejection can consume a reserved revision. Keep its
    // revision, but never relay the backend's free-form error text or details.
    return jsonResponse({
      ok: false,
      error: { code, message: BUSINESS_ERRORS[code] },
      revision: value.revision,
    });
  }
  throw new GatewayError("BACKEND_INVALID_RESPONSE");
}

async function forward(request, route, config, origin, options, signal) {
  const now = Math.floor(options.now() / 1000);
  const session = readSession(request, origin, config, now);
  let body = Buffer.alloc(0);
  if (route === "commands") {
    if (!session) throw new GatewayError("SESSION_REQUIRED");
    if (
      !equalHex(
        request.headers.get("x-macro-csrf-token"),
        csrfToken(session, origin, config),
      )
    ) {
      throw new GatewayError("CSRF_INVALID");
    }
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      throw new GatewayError("UNSUPPORTED_CONTENT_TYPE");
    }
    body = await readLimited(
      request,
      signal,
      "PAYLOAD_TOO_LARGE",
      MAX_BODY_BYTES,
    );
    const value = parseJson(body, "INVALID_REQUEST");
    if (
      !isObject(value) ||
      value.workspaceId !== config.workspaceId ||
      typeof value.command !== "string" ||
      !COMMAND_NAME.test(value.command) ||
      (value.args !== undefined && !isObject(value.args))
    ) {
      throw new GatewayError("INVALID_REQUEST");
    }
  }

  const path = route === "session" ? "/session" : "/commands";
  const nonce = randomUUID();
  const method = route === "session" ? "GET" : "POST";
  const timestamp = String(Math.floor(options.now() / 1000));
  const signature = mac(
    config.secret,
    `v1\n${timestamp}\n${nonce}\n${method}\n${path}\n${createHash("sha256").update(body).digest("hex")}`,
  );
  const upstream = await options.fetch(`${config.backendOrigin}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      "X-Macro-Timestamp": timestamp,
      "X-Macro-Nonce": nonce,
      "X-Macro-Signature": signature,
    },
    ...(method === "POST" ? { body } : {}),
    redirect: "manual",
    signal,
    cache: "no-store",
  });
  if (upstream.status >= 300 && upstream.status < 400)
    throw new GatewayError("BACKEND_INVALID_RESPONSE");
  if (upstream.status === 401 || upstream.status === 403)
    throw new GatewayError("BACKEND_UNAUTHORIZED");
  if (upstream.status === 409) throw new GatewayError("REVISION_CONFLICT");
  if (
    upstream.status === 404 ||
    upstream.status === 422 ||
    upstream.status === 501
  )
    throw new GatewayError("COMMAND_NOT_AVAILABLE");
  if (!upstream.ok)
    throw new GatewayError(
      upstream.status >= 500 ? "BACKEND_UNAVAILABLE" : "COMMAND_REJECTED",
    );
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      upstream.headers.get("content-type") ?? "",
    )
  ) {
    throw new GatewayError("BACKEND_INVALID_RESPONSE");
  }
  const bytes = await readLimited(
    upstream,
    signal,
    "BACKEND_INVALID_RESPONSE",
    MAX_RESPONSE_BYTES,
  );
  const value = parseJson(bytes, "BACKEND_INVALID_RESPONSE");
  if (route === "commands") {
    const result = commandResponse(value);
    const submitted = parseJson(body, "INVALID_REQUEST");
    if (value.ok === true && ["myfxbook_activate", "myfxbook_set_enabled"].includes(submitted.command) && options.env.MACRO_MYFXBOOK_AUTOMATION === "1") {
      // The committed mutation must remain successful if Queue dispatch fails.
      // Durable jobs and the daily dispatcher recover that transient failure.
      try {
        const { nudgeProviderJobs } = await import("../providers/index.mjs");
        await nudgeProviderJobs(options);
      } catch { /* Status remains visible through the durable scheduler. */ }
    }
    return result;
  }
  if (!validSession(value, config))
    throw new GatewayError("BACKEND_INVALID_RESPONSE");

  const signedValue = `${COOKIE_VERSION}.${now}.${randomUUID()}`;
  const cookie =
    session ?? `${signedValue}.${sessionMac(signedValue, origin, config)}`;
  // Forward only this defined session contract, not arbitrary upstream fields.
  return jsonResponse(
    {
      authenticated: true,
      workspaceId: value.workspaceId,
      revision: value.revision,
      capabilities: value.capabilities,
      writableCommands: value.writableCommands,
      ...(value.marketGeneration
        ? { marketGeneration: value.marketGeneration }
        : {}),
      csrfToken: csrfToken(cookie, origin, config),
    },
    200,
    session
      ? {}
      : {
          "Set-Cookie": `${COOKIE_NAME}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
        },
  );
}

/**
 * Only enable behind verified Vercel Authentication on ALL deployments, with
 * the owner as the sole member and no protection bypasses or share links.
 * Dependency injection is for synthetic tests; no runtime environment disables
 * HTTPS, origin validation, cookie protection, or the upstream signature.
 */
export async function handleGatewayRequest(request, route, dependencies = {}) {
  const options = {
    env: dependencies.env ?? processEnv,
    fetch: dependencies.fetch ?? globalThis.fetch,
    now: dependencies.now ?? Date.now,
    deadlineMs: dependencies.deadlineMs ?? DEADLINE_MS,
  };
  const method =
    route === "session" ? "GET" : route === "commands" ? "POST" : null;
  if (!method || request.method !== method)
    return failure("METHOD_NOT_ALLOWED", { Allow: method ?? "GET, POST" });
  let timer;
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    const config = configuration(options.env);
    const origin = validateOrigin(request, config, route);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new GatewayError("BACKEND_TIMEOUT"));
      }, options.deadlineMs);
    });
    return await Promise.race([
      forward(request, route, config, origin, options, controller.signal),
      timeout,
    ]);
  } catch (error) {
    const code =
      error instanceof GatewayError
        ? error.code
        : controller.signal.aborted
          ? "BACKEND_TIMEOUT"
          : "BACKEND_UNAVAILABLE";
    return failure(code);
  } finally {
    clearTimeout(timer);
    controller.abort();
    request.signal.removeEventListener("abort", cancel);
  }
}
