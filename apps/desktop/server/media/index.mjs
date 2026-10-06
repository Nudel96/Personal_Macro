import { Buffer } from "node:buffer";
import { env as processEnv } from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import {
  GatewayError,
  gatewayConfiguration,
  gatewayFailure,
  gatewayJsonResponse,
  authorizeMediaRequest,
  mediaBackendCommand,
} from "../gateway/index.mjs";
import {
  MAX_MEDIA_BYTES,
  MediaError,
  isMediaId,
  inspectImage,
  uploadIdentity,
  validateFilename,
} from "./image.mjs";
import { readOriginal, storeOriginal } from "./storage.mjs";

const ERRORS = {
  MEDIA_NOT_CONFIGURED: [
    503,
    "Der private Bildspeicher ist noch nicht eingerichtet.",
  ],
  MEDIA_INVALID_REQUEST: [400, "Die Bildanfrage ist ungültig."],
  MEDIA_TOO_LARGE: [
    413,
    "Bilder dürfen höchstens 3 MiB groß sein. Das Original wird nicht verkleinert.",
  ],
  MEDIA_UNSUPPORTED_TYPE: [415, "Erlaubt sind PNG, JPEG und WebP."],
  MEDIA_INVALID_IMAGE: [415, "Die Datei ist kein gültiges unterstütztes Bild."],
  MEDIA_NOT_FOUND: [404, "Das Bild ist nicht verfügbar."],
  MEDIA_INTEGRITY_ERROR: [
    502,
    "Das Originalbild konnte nicht sicher bestätigt werden.",
  ],
  MEDIA_UNAVAILABLE: [
    502,
    "Der private Bildspeicher ist vorübergehend nicht erreichbar.",
  ],
  MEDIA_UPLOAD_PENDING: [
    503,
    "Der Speicherstatus des Bildes ist noch unklar. Bitte lade die Seite neu und prüfe den Bestand, bevor du es erneut hochlädst.",
  ],
};
function failure(code) {
  const [status, message] = ERRORS[code] ?? ERRORS.MEDIA_UNAVAILABLE;
  return gatewayJsonResponse({ ok: false, error: { code, message } }, status);
}
function metadata(request, config) {
  const header = request.headers.get("x-macro-media");
  if (!header || header.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(header))
    throw new MediaError("MEDIA_INVALID_REQUEST");
  let value;
  try {
    value = JSON.parse(
      new globalThis.TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.from(header, "base64url"),
      ),
    );
  } catch {
    throw new MediaError("MEDIA_INVALID_REQUEST");
  }
  const keys = [
    "workspaceId",
    "operationId",
    "expectedRevision",
    "filename",
    "accountId",
    "tradeId",
    "slot",
    "caption",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.workspaceId !== config.workspaceId ||
    !isMediaId(value.operationId) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    value.expectedRevision < 0
  )
    throw new MediaError("MEDIA_INVALID_REQUEST");
  validateFilename(value.filename);
  for (const [key, maximum] of [
    ["accountId", 128],
    ["tradeId", 128],
    ["slot", 64],
    ["caption", 4000],
  ]) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" ||
        Buffer.byteLength(value[key]) > maximum)
    )
      throw new MediaError("MEDIA_INVALID_REQUEST");
  }
  if (value.tradeId && !value.accountId)
    throw new MediaError("MEDIA_INVALID_REQUEST");
  return value;
}
async function body(request, signal, maximum = MAX_MEDIA_BYTES) {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maximum)
  )
    throw new MediaError("MEDIA_TOO_LARGE");
  if (!request.body) throw new MediaError("MEDIA_INVALID_IMAGE");
  const reader = request.body.getReader(),
    chunks = [];
  let count = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new MediaError("MEDIA_UNAVAILABLE");
      const next = await reader.read();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > maximum) throw new MediaError("MEDIA_TOO_LARGE");
      chunks.push(Buffer.from(next.value));
    }
    if (signal.aborted) throw new MediaError("MEDIA_UNAVAILABLE");
    if (declared !== null && Number(declared) !== count)
      throw new MediaError("MEDIA_INVALID_REQUEST");
    return Buffer.concat(chunks, count);
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
async function handle(request, config, options, signal) {
  authorizeMediaRequest(request, config, options.now());
  if (request.method === "GET") {
    const url = new URL(request.url),
      ids = url.searchParams.getAll("id");
    if (
      ids.length !== 1 ||
      [...url.searchParams.keys()].some((key) => key !== "id") ||
      !isMediaId(ids[0])
    )
      throw new MediaError("MEDIA_INVALID_REQUEST");
    const response = await mediaBackendCommand(
      {
        workspaceId: config.workspaceId,
        command: "get_private_media_object",
        args: { id: ids[0] },
      },
      config,
      options,
      signal,
    );
    const result = await response.json();
    if (!result.ok)
      throw new MediaError(
        result.error?.code === "NOT_FOUND"
          ? "MEDIA_NOT_FOUND"
          : "MEDIA_UNAVAILABLE",
      );
    const bytes = await readOriginal(
      result.data,
      options.env,
      signal,
      options.blob,
    );
    // Never forward Blob headers, URLs, user-supplied filenames or redirects.
    return new globalThis.Response(bytes, {
      headers: {
        "Content-Type": result.data.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }
  const meta = metadata(request, config);
  let bytes,
    type = request.headers.get("content-type"),
    trade;
  if (type?.startsWith("multipart/form-data;")) {
    // Bound the entire multipart stream before parsing; never accept a path/URL.
    const raw = await body(request, signal, MAX_MEDIA_BYTES + 128 * 1024);
    const form = await new globalThis.Response(raw, {
      headers: { "Content-Type": type },
    }).formData();
    const keys = [...form.keys()];
    const imageFile = form.get("image"),
      submitted = form.get("trade");
    if (
      keys.length !== 2 ||
      !keys.includes("image") ||
      !keys.includes("trade") ||
      !(imageFile instanceof globalThis.File) ||
      typeof submitted !== "string" ||
      Buffer.byteLength(submitted) > 64 * 1024 ||
      meta.tradeId ||
      !meta.accountId
    ) {
      throw new MediaError("MEDIA_INVALID_REQUEST");
    }
    try {
      trade = JSON.parse(submitted);
    } catch {
      throw new MediaError("MEDIA_INVALID_REQUEST");
    }
    if (
      !trade ||
      Array.isArray(trade) ||
      typeof trade !== "object" ||
      trade.accountId !== meta.accountId ||
      trade.id != null
    ) {
      throw new MediaError("MEDIA_INVALID_REQUEST");
    }
    bytes = Buffer.from(await imageFile.arrayBuffer());
    type = imageFile.type;
  } else {
    bytes = await body(request, signal);
  }
  const image = inspectImage(bytes, type);
  const reference = {
    ...uploadIdentity(
      config.secret,
      config.workspaceId,
      meta.operationId,
      image,
    ),
    ...image,
  };
  let uploaded = false;
  try {
    await storeOriginal(bytes, reference, options.env, signal, options.blob);
    uploaded = true;
    const registration = {
      ...reference,
      originalFilename: meta.filename,
      ...Object.fromEntries(
        ["accountId", "tradeId", "slot", "caption"]
          .filter((key) => meta[key] !== undefined)
          .map((key) => [key, meta[key]]),
      ),
    };
    const response = await mediaBackendCommand(
      {
        workspaceId: config.workspaceId,
        command: trade
          ? "register_private_trade_media"
          : "register_private_media",
        args: { input: registration, ...(trade ? { trade } : {}) },
        operationId: meta.operationId,
        expectedRevision: meta.expectedRevision,
      },
      config,
      options,
      signal,
    );
    const result = await response.clone().json();
    if (!result.ok) throw new MediaError("MEDIA_UPLOAD_PENDING");
    return response;
  } catch (error) {
    // A rejected concurrent retry can share a successful request's object.
    // Preserve it and report pending reconciliation instead of deleting an
    // original that may already have a committed attachment.
    if (uploaded) throw new MediaError("MEDIA_UPLOAD_PENDING");
    throw error;
  }
}
/** Requires the same owner-only Vercel protection as /api/session and /commands. */
export async function handleMediaRequest(request, dependencies = {}) {
  if (!["GET", "POST"].includes(request.method))
    return gatewayFailure("METHOD_NOT_ALLOWED", { Allow: "GET, POST" });
  const options = {
    env: dependencies.env ?? processEnv,
    fetch: dependencies.fetch ?? globalThis.fetch,
    now: dependencies.now ?? Date.now,
    blob: dependencies.blob,
  };
  const controller = new globalThis.AbortController();
  let timer;
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) controller.abort();
  try {
    const config = gatewayConfiguration(options.env);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new MediaError(
            request.method === "POST"
              ? "MEDIA_UPLOAD_PENDING"
              : "MEDIA_UNAVAILABLE",
          ),
        );
      }, dependencies.deadlineMs ?? 90_000);
    });
    return await Promise.race([
      handle(request, config, options, controller.signal),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof GatewayError) return gatewayFailure(error.code);
    return failure(
      error instanceof MediaError ? error.code : "MEDIA_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    request.signal.removeEventListener("abort", cancel);
  }
}
