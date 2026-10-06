import type {
  CommandError,
  MediaRecord,
  TradeInput,
  TradeDetail,
} from "../types/domain";
import { isPrivateWeb } from "./runtime-mode";
import { PRIVATE_MARKET_COMMANDS } from "./private-market-commands";

export interface PrivateWebSession {
  authenticated: true;
  workspaceId: string;
  revision: number;
  csrfToken: string;
  capabilities: string[];
  writableCommands: string[];
  marketGeneration?: string;
}

export interface PrivateWebClientState {
  status: "unauthenticated" | "ready" | "reload-required";
  workspaceId: string | null;
  revision: number | null;
  writeInFlight: boolean;
  error: CommandError | null;
}

const READ_TIMEOUT_MS = 30_000;
const MARKET_READ_TIMEOUT_MS = 80_000;
const WRITE_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const COMMAND_NAME = /^[a-z][a-z0-9_]{0,95}$/;
const nativePathCommands = new Set([
  "import_media_file",
  "preview_backup",
  "stage_backup_restore",
  "preview_legacy_database",
  "import_legacy_database",
  "open_central_bank_report_file",
  "detect_mt5_account",
  "create_account_from_mt5",
  "preview_metatrader_html",
  "commit_metatrader_html",
  "preview_ctrader_statement",
  "commit_ctrader_statement",
]);

let session: PrivateWebSession | null = null;
// This latch deliberately survives logout/reconfiguration. Only a new page can
// discard every stale form after a conflict or an uncertain mutation result.
let reloadError: CommandError | null = null;
let state: PrivateWebClientState = {
  status: "unauthenticated",
  workspaceId: null,
  revision: null,
  writeInFlight: false,
  error: null,
};
const listeners = new Set<() => void>();
let marketReads = 0;
let marketGenerationRefreshInFlight = false;
const marketWaiters: Array<() => void> = [];
const GENERATION =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function error(code: string, message: string): CommandError {
  return { code, message };
}

function publish(next: PrivateWebClientState) {
  state = next;
  for (const listener of listeners) listener();
}

export function getPrivateWebClientState(): PrivateWebClientState {
  return state;
}

export function subscribePrivateWebClient(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isCommandList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 512 &&
    value.every(
      (item) => typeof item === "string" && COMMAND_NAME.test(item),
    ) &&
    new Set(value).size === value.length
  );
}

export function configurePrivateWebSession(value: unknown): void {
  if (reloadError) throw reloadError;
  if (
    !isPrivateWeb() ||
    !isRecord(value) ||
    value.authenticated !== true ||
    typeof value.workspaceId !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,128}$/.test(value.workspaceId) ||
    !isRevision(value.revision) ||
    typeof value.csrfToken !== "string" ||
    !/^[a-zA-Z0-9._~-]{32,512}$/.test(value.csrfToken) ||
    !isCommandList(value.capabilities) ||
    !isCommandList(value.writableCommands) ||
    (value.marketGeneration != null &&
      (typeof value.marketGeneration !== "string" ||
        !GENERATION.test(value.marketGeneration)))
  ) {
    throw error(
      "WEB_SESSION_INVALID",
      "Die private Verbindung konnte nicht bestätigt werden.",
    );
  }
  const capabilities = new Set(value.capabilities);
  if (value.writableCommands.some((command) => !capabilities.has(command))) {
    throw error(
      "WEB_SESSION_INVALID",
      "Die private Verbindung konnte nicht bestätigt werden.",
    );
  }
  // Refreshing a session must never silently bless a newer database revision
  // while a form based on the old revision is still open.
  if (session) {
    if (
      session.workspaceId === value.workspaceId &&
      session.revision === value.revision
    )
      return;
    throw error(
      "WEB_SESSION_ACTIVE",
      "Lade die Seite neu, um die private Verbindung zu wechseln.",
    );
  }
  session = {
    authenticated: true,
    workspaceId: value.workspaceId,
    revision: value.revision,
    csrfToken: value.csrfToken,
    capabilities: [...value.capabilities],
    writableCommands: [...value.writableCommands],
    marketGeneration:
      typeof value.marketGeneration === "string"
        ? value.marketGeneration
        : undefined,
  };
  publish({
    status: "ready",
    workspaceId: session.workspaceId,
    revision: session.revision,
    writeInFlight: false,
    error: null,
  });
}

export function clearPrivateWebSession(): void {
  session = null;
  publish({
    status: reloadError ? "reload-required" : "unauthenticated",
    workspaceId: null,
    revision: null,
    writeInFlight: false,
    error: reloadError,
  });
}

export function supportsPrivateWebCommand(command: string): boolean {
  return Boolean(
    isPrivateWeb() &&
    session?.capabilities.includes(command) &&
    !nativePathCommands.has(command),
  );
}

function requireReload(reason: CommandError) {
  reloadError = reason;
  publish({ ...state, status: "reload-required", error: reason });
  return reason;
}

async function readJson(
  response: Response,
  maximumBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new Error("Invalid response format");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > maximumBytes || !response.body)
    throw new Error("Invalid response size");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumBytes) throw new Error("Invalid response size");
      chunks.push(result.value);
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    throw cause;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Called by the hosted boundary, before any workspace imports. */
export async function connectPrivateWebSession(
  requiredCommands: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  if (
    !isPrivateWeb() ||
    requiredCommands.length === 0 ||
    !requiredCommands.every((command) => COMMAND_NAME.test(command))
  ) {
    throw error(
      "WEB_SESSION_INVALID",
      "Die private Verbindung konnte nicht bestätigt werden.",
    );
  }
  if (reloadError) throw reloadError;
  const controller = new AbortController();
  const deadline = Date.now() + READ_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  let abortRequest: () => void = () => undefined;
  let expireRequest: () => void = () => undefined;
  let completedError: CommandError | null = null;
  let timedOut = false;
  const timeoutError = () =>
    error(
      "WEB_READ_TIMEOUT",
      "Die Verbindungsprüfung hat zu lange gedauert. Versuche es erneut.",
    );
  const cancelled = new Promise<never>((_resolve, reject) => {
    abortRequest = () => {
      controller.abort();
      reject(
        error("WEB_SESSION_CANCELLED", "Die Verbindungsprüfung wurde beendet."),
      );
    };
    expireRequest = () => {
      timedOut = true;
      controller.abort();
      reject(timeoutError());
    };
    timer = setTimeout(expireRequest, READ_TIMEOUT_MS);
  });
  // iOS can suspend timers while a browser sheet is hidden. Reconcile the
  // original deadline on return instead of granting a stale attempt more time.
  const checkDeadline = () => {
    if (Date.now() >= deadline) expireRequest();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") checkDeadline();
  };
  const assertCurrent = () => {
    if (signal?.aborted)
      throw error(
        "WEB_SESSION_CANCELLED",
        "Die Verbindungsprüfung wurde beendet.",
      );
    checkDeadline();
    if (timedOut) throw timeoutError();
  };
  signal?.addEventListener("abort", abortRequest, { once: true });
  window.addEventListener("pageshow", checkDeadline);
  document.addEventListener("visibilitychange", onVisible);
  try {
    assertCurrent();
    const response = await Promise.race([
      fetch("/api/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
      cancelled,
    ]);
    assertCurrent();
    if (response.status === 401 || response.status === 403) {
      completedError = error(
        "WEB_AUTH_REQUIRED",
        "Melde dich mit deinem Besitzerkonto an, um den privaten Workspace zu öffnen.",
      );
      clearPrivateWebSession();
      throw completedError;
    }
    if (response.status === 503) {
      completedError = error(
        "WEB_NOT_CONFIGURED",
        "Der private Datendienst ist noch nicht eingerichtet oder vorübergehend nicht erreichbar.",
      );
      throw completedError;
    }
    if (!response.ok) throw new Error("Invalid session response");
    const result = await Promise.race([
      readJson(response, 128 * 1024),
      cancelled,
    ]);
    assertCurrent();
    if (
      !isRecord(result) ||
      !isCommandList(result.capabilities) ||
      !requiredCommands.every(
        (command) =>
          (result.capabilities as string[]).includes(command) &&
          !nativePathCommands.has(command),
      )
    ) {
      completedError = error(
        "WEB_CAPABILITY_UNAVAILABLE",
        "Die benötigten Funktionen sind im privaten Datendienst noch nicht vollständig eingerichtet.",
      );
      throw completedError;
    }
    configurePrivateWebSession(result);
  } catch (cause) {
    if (completedError) throw completedError;
    if (timedOut) throw timeoutError();
    if (
      isRecord(cause) &&
      typeof cause.code === "string" &&
      [
        "WEB_SESSION_CANCELLED",
        "WEB_READ_TIMEOUT",
        "WEB_SESSION_INVALID",
        "WEB_SESSION_ACTIVE",
      ].includes(cause.code)
    )
      throw cause;
    if (signal?.aborted)
      throw error(
        "WEB_SESSION_CANCELLED",
        "Die Verbindungsprüfung wurde beendet.",
      );
    throw error(
      "WEB_CONNECTION_FAILED",
      "Die private Verbindung konnte nicht bestätigt werden. Versuche es erneut.",
    );
  } finally {
    clearTimeout(timer!);
    controller.abort();
    signal?.removeEventListener("abort", abortRequest);
    window.removeEventListener("pageshow", checkDeadline);
    document.removeEventListener("visibilitychange", onVisible);
  }
}

/** Checks only for a new published market generation; never renews a session. */
export async function refreshPrivateWebMarketGeneration(
  signal?: AbortSignal,
): Promise<boolean> {
  const active = session;
  if (
    !isPrivateWeb() ||
    !active ||
    state.status !== "ready" ||
    state.writeInFlight ||
    reloadError ||
    signal?.aborted ||
    marketGenerationRefreshInFlight
  )
    return false;
  marketGenerationRefreshInFlight = true;
  const controller = new AbortController();
  const deadline = Date.now() + READ_TIMEOUT_MS;
  let abortRequest: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abortRequest = () => {
      controller.abort();
      reject(new Error("Market generation check ended"));
    };
  });
  const timer = setTimeout(abortRequest, READ_TIMEOUT_MS);
  const current = () =>
    session === active &&
    !reloadError &&
    state.status === "ready" &&
    !controller.signal.aborted &&
    !signal?.aborted &&
    Date.now() < deadline;
  signal?.addEventListener("abort", abortRequest, { once: true });
  try {
    const response = await Promise.race([
      fetch("/api/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }),
      cancelled,
    ]);
    if (!current()) return false;
    if (response.status === 401 || response.status === 403) {
      clearPrivateWebSession();
      return false;
    }
    if (!response.ok) return false;
    const result = await Promise.race([
      readJson(response, 128 * 1024),
      cancelled,
    ]);
    if (
      !current() ||
      !isRecord(result) ||
      result.authenticated !== true ||
      result.workspaceId !== active.workspaceId ||
      !isRevision(result.revision) ||
      typeof result.csrfToken !== "string" ||
      !/^[a-zA-Z0-9._~-]{32,512}$/.test(result.csrfToken) ||
      !isCommandList(result.capabilities) ||
      !isCommandList(result.writableCommands) ||
      result.writableCommands.some(
        (command) => !(result.capabilities as string[]).includes(command),
      ) ||
      typeof result.marketGeneration !== "string" ||
      !GENERATION.test(result.marketGeneration) ||
      result.marketGeneration === active.marketGeneration
    )
      return false;
    // Keep object identity, journal revision, CSRF and capabilities unchanged.
    // In particular, another device's writes must still conflict with old forms.
    active.marketGeneration = result.marketGeneration;
    return true;
  } catch {
    // A failed read retains the previously verified market data. The next
    // visible-page check can retry without issuing any provider refresh.
    return false;
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal?.removeEventListener("abort", abortRequest);
    marketGenerationRefreshInFlight = false;
  }
}

function serverError(value: unknown): CommandError | null {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error))
    return null;
  const { code, message } = value.error;
  if (
    typeof code !== "string" ||
    !/^[A-Z][A-Z0-9_]{0,95}$/.test(code) ||
    typeof message !== "string" ||
    message.length < 1 ||
    message.length > 600 ||
    /[<>]/.test(message) ||
    Array.from(message).some((character) => character.charCodeAt(0) < 32)
  )
    return null;
  return { code, message };
}

export async function privateWebCall<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const market = PRIVATE_MARKET_COMMANDS.has(command);
  const active = session;
  if (market) {
    // A coverage gallery can enqueue hundreds of reads. Limit requests before
    // starting their network deadlines; never fan out beyond the two disk leases.
    if (marketReads >= 2) {
      if (marketWaiters.length >= 1024) {
        throw error(
          "WEB_READ_BUSY",
          "Es werden bereits viele Analysen geladen. Warte kurz auf den Abschluss.",
        );
      }
      await new Promise<void>((resolve) => marketWaiters.push(resolve));
    } else {
      marketReads += 1;
    }
  }
  try {
    if (session !== active) {
      throw error(
        "WEB_AUTH_REQUIRED",
        "Die private Verbindung wurde beendet. Melde dich erneut an.",
      );
    }
    const parameters = { ...args };
    if (market && parameters.generation == null && active?.marketGeneration) {
      parameters.generation = active.marketGeneration;
    }
    return await privateWebRequest<T>(command, (context) => ({
      url: "/api/commands",
      contentType: "application/json",
      body: JSON.stringify({ ...context, command, args: parameters }),
    }));
  } finally {
    if (market) {
      const next = marketWaiters.shift();
      if (next) next();
      else marketReads -= 1;
    }
  }
}

export interface PrivateMediaUploadContext {
  accountId?: string;
  tradeId?: string;
  slot?: string;
  caption?: string;
}

/** Sends the original bytes; session credentials never leave this module. */
export async function privateWebMediaUpload(
  file: File,
  context: PrivateMediaUploadContext = {},
): Promise<MediaRecord> {
  return privateWebRequest(
    "upload_private_media",
    (requestContext) => {
      if (
        !(file instanceof File) ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ) {
        throw error(
          "WEB_MEDIA_TYPE_INVALID",
          "Wähle ein Bild im Format PNG, JPEG oder WebP.",
        );
      }
      if (file.size === 0 || file.size > 3 * 1024 * 1024) {
        throw error(
          "WEB_MEDIA_SIZE_INVALID",
          "Das Bild muss größer als 0 Byte und darf höchstens 3 MiB groß sein.",
        );
      }
      if (
        !file.name ||
        new TextEncoder().encode(file.name).length > 255 ||
        /[\\/]/.test(file.name) ||
        Array.from(file.name).some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || (code >= 127 && code <= 159);
        })
      ) {
        throw error(
          "WEB_MEDIA_NAME_INVALID",
          "Der Dateiname darf höchstens 255 UTF-8-Bytes lang sein und keine Pfade oder Steuerzeichen enthalten.",
        );
      }
      for (const [key, maximum] of [
        ["accountId", 128],
        ["tradeId", 128],
        ["slot", 64],
        ["caption", 4000],
      ] as const) {
        const value = context[key];
        if (
          value != null &&
          (typeof value !== "string" ||
            new TextEncoder().encode(value).length > maximum)
        ) {
          throw error(
            "WEB_MEDIA_CONTEXT_INVALID",
            "Die Zuordnung oder Bildbeschreibung ist ungültig oder zu lang.",
          );
        }
      }
      const metadata = new TextEncoder().encode(
        JSON.stringify({
          ...requestContext,
          filename: file.name,
          accountId: context.accountId ?? undefined,
          tradeId: context.tradeId ?? undefined,
          slot: context.slot ?? undefined,
          caption: context.caption ?? undefined,
        }),
      );
      const encoded = btoa(
        Array.from(metadata, (byte) => String.fromCharCode(byte)).join(""),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return {
        url: "/api/media",
        contentType: file.type,
        headers: { "X-Macro-Media": encoded },
        body: file,
      };
    },
    true,
  );
}

interface PrivateRequestContext {
  workspaceId: string;
  operationId?: string;
  expectedRevision?: number;
}

/** Trade, metadata and attachment commit together after the original is verified. */
export async function privateWebTradeScreenshotUpload(
  file: File,
  input: TradeInput,
): Promise<TradeDetail> {
  if (
    !input.accountId ||
    input.id != null ||
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size === 0 ||
    file.size > 3 * 1024 * 1024 ||
    !file.name ||
    new TextEncoder().encode(file.name).length > 255 ||
    /[\\/]/.test(file.name) ||
    Array.from(file.name).some(
      (c) =>
        c.charCodeAt(0) < 32 ||
        (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
    )
  ) {
    throw error(
      "VALIDATION_ERROR",
      "Wähle ein PNG-/JPEG-Original bis 3 MiB und ein aktives Konto.",
    );
  }
  const trade = JSON.stringify(input);
  if (new TextEncoder().encode(trade).length > 64 * 1024) {
    throw error(
      "VALIDATION_ERROR",
      "Die Trade-Eingaben sind für den Screenshot-Import zu umfangreich.",
    );
  }
  return privateWebRequest(
    "create_trade_with_screenshot",
    (context) => {
      const bytes = new TextEncoder().encode(
        JSON.stringify({
          ...context,
          filename: file.name,
          accountId: input.accountId,
        }),
      );
      const metadata = btoa(
        Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const body = new FormData();
      body.set("trade", trade);
      body.set("image", file);
      return {
        url: "/api/media",
        headers: { "X-Macro-Media": metadata },
        body,
      };
    },
    true,
  );
}

async function privateWebRequest<T>(
  command: string,
  prepare: (context: PrivateRequestContext) => {
    url: "/api/commands" | "/api/media";
    contentType?: string;
    headers?: Record<string, string>;
    body: BodyInit;
  },
  requireWrite = false,
): Promise<T> {
  const active = session;
  if (!isPrivateWeb() || !active) {
    throw error(
      "WEB_AUTH_REQUIRED",
      "Melde dich an, um deinen privaten Workspace zu öffnen.",
    );
  }
  if (
    !supportsPrivateWebCommand(command) ||
    (requireWrite && !active.writableCommands.includes(command))
  ) {
    throw error(
      "WEB_CAPABILITY_UNAVAILABLE",
      "Diese Funktion ist in der privaten Browser-Version noch nicht verfügbar.",
    );
  }
  const write = active.writableCommands.includes(command);
  if (write && reloadError) throw reloadError;
  if (write && state.writeInFlight) {
    throw error(
      "WEB_WRITE_IN_PROGRESS",
      "Eine Änderung wird gerade gespeichert. Warte auf deren Abschluss.",
    );
  }

  const expectedRevision = active.revision;
  // Prepare before taking the write lock; local validation sends nothing.
  const request = prepare({
    workspaceId: active.workspaceId,
    ...(write ? { operationId: crypto.randomUUID(), expectedRevision } : {}),
  });
  if (write) publish({ ...state, writeInFlight: true });
  const controller = new AbortController();
  let timedOut = false;
  let completedError: CommandError | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
        reject(new Error("Request timeout"));
      },
      write
        ? WRITE_TIMEOUT_MS
        : PRIVATE_MARKET_COMMANDS.has(command)
          ? MARKET_READ_TIMEOUT_MS
          : command === "myfxbook_login" || command === "myfxbook_preview"
            ? WRITE_TIMEOUT_MS
            : READ_TIMEOUT_MS,
    );
  });
  try {
    const response = await Promise.race([
      fetch(request.url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: {
          ...request.headers,
          ...(request.contentType
            ? { "Content-Type": request.contentType }
            : {}),
          "X-Macro-CSRF-Token": active.csrfToken,
        },
        body: request.body,
        signal: controller.signal,
      }),
      timeout,
    ]);
    if (session !== active) {
      completedError = error(
        "WEB_AUTH_REQUIRED",
        "Die private Verbindung wurde beendet. Melde dich erneut an.",
      );
      throw completedError;
    }
    if (response.status === 401 || response.status === 403) {
      clearPrivateWebSession();
      completedError = error(
        "WEB_AUTH_REQUIRED",
        "Deine Anmeldung ist abgelaufen oder der Zugriff wurde verweigert. Melde dich erneut an.",
      );
      throw completedError;
    }
    if (response.status === 409) {
      completedError = requireReload(
        error(
          "WEB_REVISION_CONFLICT",
          "Der Datenbestand wurde zwischenzeitlich geändert. Lade die Seite neu und prüfe deine Eingaben erneut.",
        ),
      );
      throw completedError;
    }
    // A server failure cannot prove that a submitted write was rolled back.
    if (write && response.status >= 500) throw new Error("Uncertain mutation");
    const result = await Promise.race([readJson(response), timeout]);
    if (session !== active) {
      completedError = error(
        "WEB_AUTH_REQUIRED",
        "Die private Verbindung wurde beendet. Melde dich erneut an.",
      );
      throw completedError;
    }
    const failure = serverError(result);
    if (failure) {
      if (
        write &&
        (!isRecord(result) || result.revision !== expectedRevision)
      ) {
        // The backend reserves a durable revision before invoking a mutation.
        // A failed command at a newer (or missing) revision may have had partial
        // effects; only a preflight rejection at our exact base is retryable.
        completedError = requireReload(
          error(
            "WEB_WRITE_UNCERTAIN",
            "Die Änderung konnte nicht bestätigt werden. Lade die Seite neu und prüfe den gespeicherten Stand, bevor du sie erneut eingibst.",
          ),
        );
        throw completedError;
      }
      completedError = failure;
      throw failure;
    }
    if (
      !response.ok ||
      !isRecord(result) ||
      result.ok !== true ||
      !("data" in result) ||
      !isRevision(result.revision) ||
      (write && result.revision <= expectedRevision)
    )
      throw new Error("Invalid command response");
    if (write) {
      active.revision = result.revision;
      publish({ ...state, revision: result.revision });
    }
    // A read may observe another device's new revision. It must not advance the
    // mutation base of an already open form; its next write must conflict.
    return result.data as T;
  } catch {
    if (completedError) throw completedError;
    if (session !== active) {
      throw error(
        "WEB_AUTH_REQUIRED",
        "Die private Verbindung wurde beendet. Melde dich erneut an.",
      );
    }
    if (write) {
      throw requireReload(
        error(
          "WEB_WRITE_UNCERTAIN",
          "Der Speicherstatus ist unklar. Wiederhole die Änderung nicht. Lade die Seite neu und prüfe, ob sie gespeichert wurde.",
        ),
      );
    }
    throw error(
      timedOut ? "WEB_READ_TIMEOUT" : "WEB_CONNECTION_FAILED",
      timedOut
        ? "Die Anfrage hat zu lange gedauert. Versuche es erneut."
        : "Die privaten Daten konnten nicht geladen werden. Prüfe deine Verbindung.",
    );
  } finally {
    clearTimeout(timer!);
    controller.abort();
    if (write && session === active)
      publish({ ...state, writeInFlight: false });
  }
}
