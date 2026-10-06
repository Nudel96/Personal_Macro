// CLI: node -- server/migration/upload-public-shards.mjs --manifest <absolute> --env-file <absolute> --output <absolute>
// The separator is required: Node otherwise consumes --env-file itself.
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import process, { argv, stderr, stdout } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { clearTimeout, setTimeout } from "node:timers";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { get, put } from "@vercel/blob";
import {
  domainSchema,
  domainMaxRows,
  verifyDomainDatabase,
} from "./domain-shard-contract.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
const MIB = 1024 * 1024;
export const LIMITS = Object.freeze({
  manifestBytes: MIB,
  artifacts: 1024,
  rawBytes: 128 * MIB,
  totalRawBytes: 2048 * MIB,
  transferBytes: 32 * MIB,
  totalTransferBytes: 500 * MIB,
});
const ERRORS = {
  ARGUMENTS_INVALID:
    "Manifest, Konfiguration und neue Ausgabedatei müssen ausdrücklich als absolute Pfade angegeben werden.",
  PATH_UNSAFE:
    "Ein Dateipfad ist nicht zulässig oder wurde während der Prüfung verändert.",
  OUTPUT_EXISTS:
    "Die Ausgabedatei existiert bereits und wird nicht überschrieben.",
  MANIFEST_INVALID:
    "Das öffentliche Datenverzeichnis entspricht nicht dem freigegebenen Vertrag.",
  LIMIT_EXCEEDED:
    "Eine festgelegte Paket- oder Speichergrenze wurde überschritten.",
  SQLITE_NOT_CLOSED:
    "Ein Datenpaket benötigt Journaldateien oder ist nicht abgeschlossen.",
  SHARD_INVALID:
    "Ein Datenpaket stimmt nicht mit seinem geprüften Schema oder Speichernachweis überein.",
  ENV_INVALID:
    "Die Konfigurationsdatei enthält keinen nutzbaren privaten Speicherzugang.",
  REMOTE_INTEGRITY:
    "Ein übertragenes Datenpaket konnte nicht bytegenau bestätigt werden.",
  UPLOAD_FAILED:
    "Der Upload ist unvollständig. Bereits hochgeladene Pakete bleiben erhalten.",
  OUTPUT_FAILED:
    "Der Übertragungsnachweis konnte nicht sicher gespeichert werden.",
  STAGING_FAILED:
    "Die temporären Datenpakete konnten nicht sicher vorbereitet werden.",
};
export class PublicShardUploadError extends Error {
  constructor(code) {
    const known = Object.hasOwn(ERRORS, code) ? code : "UPLOAD_FAILED";
    super(ERRORS[known]);
    this.code = known;
  }
}
const fail = (code) => new PublicShardUploadError(code);
function check(value, code = "MANIFEST_INVALID") {
  if (!value) throw fail(code);
}
function safe(error, fallback) {
  return error instanceof PublicShardUploadError ? error : fail(fallback);
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isHash = (value) =>
  typeof value === "string" &&
  value.length === 64 &&
  /^[a-f0-9]{64}$/.test(value);
function shape(value, keys) {
  check(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
}
function utcTimestamp(value) {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]00:00)$/.exec(
      value,
    );
  if (!match || match[0].length !== value.length) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, Math.min(second, 59), 0);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
export function validateManifest(value) {
  shape(value, ["schemaVersion", "generation", "createdAt", "artifacts"]);
  check(
    value.schemaVersion === 1 &&
      typeof value.generation === "string" &&
      value.generation.length === 36 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        value.generation,
      ) &&
      utcTimestamp(value.createdAt),
  );
  check(
    Array.isArray(value.artifacts) &&
      value.artifacts.length > 0 &&
      value.artifacts.length <= LIMITS.artifacts,
  );
  const identities = new Set(),
    files = new Set();
  let total = 0;
  for (const item of value.artifacts) {
    shape(item, [
      "kind",
      "key",
      "sha256",
      "sizeBytes",
      "rows",
      "fileName",
      "format",
      "schemaVersion",
    ]);
    const maxRows = {
      rates: 10002,
      "seasonality-index": 20002,
      "seasonality-symbol": 100002,
    };
    const domain = domainSchema(item.kind, item.key);
    check(
      (Object.hasOwn(maxRows, item.kind) || domain) &&
        typeof item.key === "string",
    );
    const symbol = item.key.startsWith("eodhd:") ? item.key.slice(6) : "";
    check(
      domain ||
        (item.kind === "rates"
          ? item.key === "eodhd:policy-rates"
          : item.kind === "seasonality-index"
            ? item.key === "eodhd:seasonality"
            : symbol.length > 0 &&
              symbol.length <= 96 &&
              /^[A-Za-z0-9._-]+$/.test(symbol) &&
              !symbol.includes("\n")),
    );
    check(
      isHash(item.sha256) &&
        item.fileName === `${item.sha256}.sqlite` &&
        item.format === "sqlite" &&
        item.schemaVersion === 1,
    );
    check(
      Number.isSafeInteger(item.sizeBytes) &&
        item.sizeBytes >= 512 &&
        item.sizeBytes <= LIMITS.rawBytes &&
        Number.isSafeInteger(item.rows) &&
        item.rows >= 0 &&
        item.rows <= (domain ? domainMaxRows(domain) : maxRows[item.kind]),
      "LIMIT_EXCEEDED",
    );
    const identity = `${item.kind}\n${item.key}`;
    // Aliasing one hash file under several identities is intentionally rejected.
    check(!identities.has(identity) && !files.has(item.fileName));
    identities.add(identity);
    files.add(item.fileName);
    total += item.sizeBytes;
    check(total <= LIMITS.totalRawBytes, "LIMIT_EXCEEDED");
  }
  return value;
}

// JSON.parse silently accepts duplicate object keys; serde's Manifest does not.
function parseManifest(bytes) {
  try {
    const source = new globalThis.TextDecoder("utf-8", { fatal: true }).decode(
      bytes,
    );
    let position = 0;
    const whitespace = () => {
      while (
        /[\t\r\n ]/.test(source[position] ?? "!") &&
        position < source.length
      )
        position++;
    };
    const string = () => {
      const start = position++;
      while (position < source.length) {
        const char = source[position++];
        if (char === "\\") position++;
        else if (char === '"') return JSON.parse(source.slice(start, position));
      }
      throw fail("MANIFEST_INVALID");
    };
    const walk = (depth) => {
      check(depth <= 8);
      whitespace();
      const type = source[position];
      if (type === '"') {
        string();
        return;
      }
      if (type === "{" || type === "[") {
        position++;
        whitespace();
        const end = type === "{" ? "}" : "]",
          keys = new Set();
        if (source[position] === end) {
          position++;
          return;
        }
        for (;;) {
          if (type === "{") {
            check(source[position] === '"');
            const key = string();
            check(!keys.has(key));
            keys.add(key);
            whitespace();
            check(source[position++] === ":");
          }
          walk(depth + 1);
          whitespace();
          if (source[position] === end) {
            position++;
            return;
          }
          check(source[position++] === ",");
          whitespace();
        }
      }
      const token =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          source.slice(position),
        );
      check(token);
      position += token[0].length;
    };
    walk(0);
    whitespace();
    check(position === source.length);
    return validateManifest(JSON.parse(source));
  } catch (error) {
    throw safe(error, "MANIFEST_INVALID");
  }
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
function absolute(value) {
  check(
    typeof value === "string" &&
      value &&
      !value.includes("\0") &&
      path.isAbsolute(value),
    "ARGUMENTS_INVALID",
  );
  check(
    !(path.sep === "\\" && path.parse(value).root === "\\"),
    "ARGUMENTS_INVALID",
  );
  const resolved = path.resolve(value);
  check(
    !path.relative(path.parse(resolved).root, resolved).includes(":"),
    "ARGUMENTS_INVALID",
  );
  return resolved;
}
function sameFile(a, b, contents = false) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    (!contents ||
      (a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs))
  );
}
async function verifiedPath(target, file = false) {
  const checked = [],
    root = path.parse(target).root,
    parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    const stat = await lstat(current, { bigint: true });
    check(
      !stat.isSymbolicLink() &&
        (file && i === parts.length - 1
          ? stat.isFile() && stat.nlink === 1n
          : stat.isDirectory()),
      "PATH_UNSAFE",
    );
    check(
      path.relative(current, await realpath(current)) === "",
      "PATH_UNSAFE",
    );
    checked.push({ path: current, stat });
  }
  return checked;
}
async function unchanged(checked, contents = false) {
  for (const [index, previous] of checked.entries()) {
    const current = await lstat(previous.path, { bigint: true });
    check(
      !current.isSymbolicLink() &&
        sameFile(
          previous.stat,
          current,
          contents && index === checked.length - 1,
        ) &&
        path.relative(previous.path, await realpath(previous.path)) === "",
      "PATH_UNSAFE",
    );
  }
}
async function readVerified(target, maximum, exact) {
  const checked = await verifiedPath(target, true),
    before = checked.at(-1).stat;
  check(
    before.size > 0 &&
      before.size <= BigInt(maximum) &&
      (exact === undefined || before.size === BigInt(exact)),
    "LIMIT_EXCEEDED",
  );
  const handle = await open(
    target,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    check(
      sameFile(before, await handle.stat({ bigint: true }), true),
      "PATH_UNSAFE",
    );
    await unchanged(checked, true);
    const data = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < data.length) {
      const result = await handle.read(data, count, data.length - count, count);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    check(
      count === Number(before.size) &&
        sameFile(before, await handle.stat({ bigint: true }), true),
      "PATH_UNSAFE",
    );
    await unchanged(checked, true);
    return { bytes: data.subarray(0, count), checked };
  } finally {
    await handle.close();
  }
}
async function closedSqlite(target, bytes) {
  check(
    bytes.length >= 100 &&
      bytes.toString("ascii", 0, 16) === "SQLite format 3\0",
    "SHARD_INVALID",
  );
  check(bytes[18] === 1 && bytes[19] === 1, "SQLITE_NOT_CLOSED");
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(target + suffix);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    throw fail("SQLITE_NOT_CLOSED");
  }
}
const SCHEMAS = {
  eodhd_events: [
    "currency",
    "provider_type",
    "released_at",
    "actual_value",
    "forecast_value",
    "source_url",
    "updated_at",
    "canonical_key",
    "mapping_status",
  ].map((key) => [key, "TEXT"]),
  eodhd_sync_runs: [
    "started_at",
    "completed_at",
    "status",
    "error_message",
  ].map((key) => [key, "TEXT"]),
  seasonality_provider_instruments: [
    "provider",
    "provider_symbol",
    "display_symbol",
    "category",
    "description",
    "base_currency",
    "quote_currency",
    "native_timezone",
  ].map((key) => [key, "TEXT"]),
  seasonality_provider_profiles: [
    ["provider", "TEXT"],
    ["provider_symbol", "TEXT"],
    ["calculated_at", "TEXT"],
    ["complete_years", "INTEGER"],
    ["quality_status", "TEXT"],
    ["missing_days", "INTEGER"],
    ["profile_json", "TEXT"],
  ],
  seasonality_provider_sync_runs: [
    "provider",
    "started_at",
    "completed_at",
    "status",
    "error_message",
  ].map((key) => [key, "TEXT"]),
  seasonality_provider_daily_candles: [
    ["provider", "TEXT"],
    ["provider_symbol", "TEXT"],
    ["candle_time", "INTEGER"],
    ["mid_close", "REAL"],
  ],
};
const TABLES = {
  rates: ["eodhd_events", "eodhd_sync_runs"],
  "seasonality-index": [
    "seasonality_provider_instruments",
    "seasonality_provider_profiles",
    "seasonality_provider_sync_runs",
  ],
  "seasonality-symbol": [
    "seasonality_provider_instruments",
    "seasonality_provider_profiles",
    "seasonality_provider_daily_candles",
  ],
};
function primaryKey(table) {
  if (table === "seasonality_provider_daily_candles")
    return ["provider", "provider_symbol", "candle_time"];
  return table === "seasonality_provider_instruments" ||
    table === "seasonality_provider_profiles"
    ? ["provider", "provider_symbol"]
    : [];
}
function normalizedDdl(value) {
  return typeof value === "string"
    ? value.replace(/[\t\n\f\r "]/g, "").toUpperCase()
    : null;
}
function expectedDdl(table) {
  const fields = SCHEMAS[table].map(([name, type]) => `${name} ${type}`);
  const key = primaryKey(table);
  if (key.length) fields.push(`PRIMARY KEY(${key.join(",")})`);
  return normalizedDdl(`CREATE TABLE ${table} (${fields.join(",")}) STRICT`);
}
function validCardinality(kind, table, count) {
  if (table === "eodhd_events") return count >= 0 && count <= 10000;
  if (table === "eodhd_sync_runs" || table === "seasonality_provider_sync_runs")
    return count >= 0 && count <= 2;
  if (table === "seasonality_provider_daily_candles")
    return count >= 1 && count <= 100000;
  return kind === "seasonality-symbol"
    ? count === 1
    : count >= 0 && count <= 10000;
}
function verifyDatabase(target, artifact) {
  let db;
  try {
    db = new DatabaseSync(target, { readOnly: true, allowExtension: false });
    db.exec(
      "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; BEGIN",
    );
    if (domainSchema(artifact.kind, artifact.key)) {
      verifyDomainDatabase(db, artifact, check);
      db.exec("ROLLBACK");
      return;
    }
    const expected = [...TABLES[artifact.kind]].sort();
    const schema = db
      .prepare("SELECT name,type,sql FROM sqlite_schema ORDER BY name")
      .all();
    const objects = schema.filter(
      (item) =>
        !(
          item.type === "index" &&
          item.name.startsWith("sqlite_autoindex_") &&
          item.sql === null
        ),
    );
    check(
      objects.length === expected.length &&
        objects.every(
          (item, i) =>
            item.name === expected[i] &&
            item.type === "table" &&
            normalizedDdl(item.sql) === expectedDdl(expected[i]),
        ),
      "SHARD_INVALID",
    );
    let rows = 0;
    for (const table of expected) {
      const actual = db
        .prepare(
          "SELECT name,type,hidden FROM pragma_table_xinfo(?) ORDER BY cid",
        )
        .all(table);
      const strict = db
        .prepare(
          "SELECT strict FROM pragma_table_list WHERE schema='main' AND name=? AND type='table'",
        )
        .get(table);
      check(
        strict?.strict === 1 &&
          actual.length === SCHEMAS[table].length &&
          actual.every(
            (column, i) =>
              column.name === SCHEMAS[table][i][0] &&
              column.type === SCHEMAS[table][i][1] &&
              column.hidden === 0,
          ),
        "SHARD_INVALID",
      );
      const count = db
        .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
        .get().count;
      check(validCardinality(artifact.kind, table, count), "SHARD_INVALID");
      rows += count;
      if (artifact.kind !== "rates")
        check(
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM "${table}" WHERE provider IS NOT 'eodhd'`,
            )
            .get().count === 0,
          "SHARD_INVALID",
        );
      if (artifact.kind === "seasonality-symbol")
        check(
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM "${table}" WHERE provider IS NOT 'eodhd' OR provider_symbol IS NOT ?`,
            )
            .get(artifact.key.slice(6)).count === 0,
          "SHARD_INVALID",
        );
    }
    check(
      rows === artifact.rows &&
        Object.values(db.prepare("PRAGMA quick_check(1)").get())[0] === "ok",
      "SHARD_INVALID",
    );
    if (artifact.kind !== "rates")
      check(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM seasonality_provider_profiles p WHERE NOT EXISTS(SELECT 1 FROM seasonality_provider_instruments i WHERE i.provider=p.provider AND i.provider_symbol=p.provider_symbol)",
          )
          .get().count === 0,
        "SHARD_INVALID",
      );
    if (artifact.kind === "seasonality-index")
      check(
        db
          .prepare(
            "WITH aliases AS (SELECT provider_symbol,lower(provider_symbol) AS alias FROM seasonality_provider_instruments UNION ALL SELECT provider_symbol,lower(display_symbol) AS alias FROM seasonality_provider_instruments) SELECT COUNT(*) AS count FROM aliases a WHERE alias IS NULL OR EXISTS(SELECT 1 FROM aliases b WHERE a.alias=b.alias AND a.provider_symbol<>b.provider_symbol)",
          )
          .get().count === 0,
        "SHARD_INVALID",
      );
    db.exec("ROLLBACK");
  } catch (error) {
    throw safe(error, "SHARD_INVALID");
  } finally {
    db?.close();
  }
}
async function workspaceRoots(dependencies) {
  const value =
    dependencies.activeWorkspace ??
    (process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "com.personal-macro.app",
          "PersonalMacro",
        )
      : undefined);
  if (!value) return [];
  const target = absolute(value);
  try {
    return [target, await realpath(target)];
  } catch (error) {
    if (error?.code === "ENOENT") return [target];
    throw error;
  }
}
async function destination(output, roots) {
  check(
    !inside(REPOSITORY, output) && roots.every((root) => !inside(root, output)),
    "PATH_UNSAFE",
  );
  const checked = await verifiedPath(path.dirname(output));
  check(
    !inside(await realpath(REPOSITORY), checked.at(-1).path),
    "PATH_UNSAFE",
  );
  try {
    await lstat(output);
  } catch (error) {
    if (error?.code === "ENOENT") return checked;
    throw error;
  }
  throw fail("OUTPUT_EXISTS");
}
async function writeAll(handle, bytes) {
  let count = 0;
  while (count < bytes.length) {
    const result = await handle.write(
      bytes,
      count,
      bytes.length - count,
      count,
    );
    check(result.bytesWritten > 0, "OUTPUT_FAILED");
    count += result.bytesWritten;
  }
  await handle.sync();
}
async function persist(handle, output, parent, document) {
  await unchanged(parent);
  const target = await verifiedPath(output, true);
  check(
    sameFile(target.at(-1).stat, await handle.stat({ bigint: true })),
    "PATH_UNSAFE",
  );
  await handle.truncate(0);
  await writeAll(handle, Buffer.from(`${JSON.stringify(document, null, 2)}\n`));
  await unchanged(parent);
  check(
    sameFile(
      await lstat(output, { bigint: true }),
      await handle.stat({ bigint: true }),
    ),
    "PATH_UNSAFE",
  );
}
export function validateTransferSize(bytes, total) {
  check(
    Number.isSafeInteger(bytes) &&
      bytes > 0 &&
      bytes <= LIMITS.transferBytes &&
      Number.isSafeInteger(total) &&
      total >= bytes &&
      total <= LIMITS.totalTransferBytes,
    "LIMIT_EXCEEDED",
  );
}
async function stageArtifact(
  artifact,
  sourceDirectory,
  staging,
  stagedFiles,
  total,
) {
  const target = path.join(sourceDirectory, artifact.fileName);
  const { bytes, checked } = await readVerified(
    target,
    LIMITS.rawBytes,
    artifact.sizeBytes,
  );
  check(sha256(bytes) === artifact.sha256, "SHARD_INVALID");
  await closedSqlite(target, bytes);
  verifyDatabase(target, artifact);
  await closedSqlite(target, bytes);
  await unchanged(checked, true);
  let compressed;
  try {
    compressed = gzipSync(bytes, {
      level: 9,
      maxOutputLength: LIMITS.transferBytes,
    });
    check(
      gunzipSync(compressed, { maxOutputLength: artifact.sizeBytes }).equals(
        bytes,
      ),
      "SHARD_INVALID",
    );
  } catch (error) {
    throw safe(
      error,
      error?.code === "ERR_BUFFER_TOO_LARGE"
        ? "LIMIT_EXCEEDED"
        : "SHARD_INVALID",
    );
  }
  validateTransferSize(compressed.length, total + compressed.length);
  const filename = path.join(staging.path, `${artifact.sha256}.sqlite.gz`);
  await unchanged(staging.checked);
  const handle = await open(filename, "wx", 0o600);
  const item = { path: filename, stat: await handle.stat({ bigint: true }) };
  stagedFiles.push(item);
  try {
    await writeAll(handle, compressed);
    item.stat = await handle.stat({ bigint: true });
  } finally {
    await handle.close();
  }
  await unchanged(staging.checked);
  return {
    ...item,
    artifact,
    transport: {
      kind: artifact.kind,
      key: artifact.key,
      encoding: "gzip",
      transferBytes: compressed.length,
      transferSha256: sha256(compressed),
    },
  };
}
async function remoteOriginal(
  sdk,
  pathname,
  transport,
  expected,
  options,
  signal,
) {
  const result = await sdk.get(pathname, {
    ...options,
    access: "private",
    useCache: false,
    abortSignal: signal,
  });
  if (result === null) return false;
  if (
    result?.statusCode !== 200 ||
    result?.blob?.pathname !== pathname ||
    result?.blob?.size !== transport.transferBytes ||
    result?.blob?.contentType !== "application/gzip" ||
    !result?.stream
  ) {
    await result?.stream?.cancel().catch(() => {});
    throw fail("REMOTE_INTEGRITY");
  }
  const reader = result.stream.getReader(),
    hash = createHash("sha256");
  let count = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      check(!signal.aborted, "UPLOAD_FAILED");
      const next = await reader.read();
      if (next.done) break;
      const bytes = Buffer.from(next.value);
      check(
        count + bytes.length <= expected.length &&
          bytes.equals(expected.subarray(count, count + bytes.length)),
        "REMOTE_INTEGRITY",
      );
      count += bytes.length;
      hash.update(bytes);
    }
    check(!signal.aborted, "UPLOAD_FAILED");
    check(
      count === transport.transferBytes &&
        hash.digest("hex") === transport.transferSha256,
      "REMOTE_INTEGRITY",
    );
    return true;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
async function uploadArtifact(item, generation, token, sdk, dependencies) {
  const { bytes } = await readVerified(
    item.path,
    LIMITS.transferBytes,
    item.transport.transferBytes,
  );
  check(sha256(bytes) === item.transport.transferSha256, "SHARD_INVALID");
  const pathname = `public-cache/v1/${generation}/${item.artifact.fileName}.gz`;
  const controller = new globalThis.AbortController();
  const cancel = () => controller.abort();
  dependencies.signal?.addEventListener("abort", cancel, { once: true });
  if (dependencies.signal?.aborted) controller.abort();
  let timer, rejectAbort;
  const deadline = new Promise((_, reject) => {
    rejectAbort = () => reject(fail("UPLOAD_FAILED"));
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    timer = setTimeout(() => controller.abort(), 90_000);
  });
  try {
    const operation = async () => {
      check(!controller.signal.aborted, "UPLOAD_FAILED");
      const options = { token };
      const present = await remoteOriginal(
        sdk,
        pathname,
        item.transport,
        bytes,
        options,
        controller.signal,
      );
      if (!present) {
        try {
          const stored = await sdk.put(pathname, bytes, {
            ...options,
            access: "private",
            contentType: "application/gzip",
            addRandomSuffix: false,
            allowOverwrite: false,
            abortSignal: controller.signal,
          });
          check(
            stored?.pathname === pathname &&
              stored?.contentType === "application/gzip",
            "REMOTE_INTEGRITY",
          );
        } catch {
          // A lost response or competing immutable put is resolved only by readback.
          check(
            await remoteOriginal(
              sdk,
              pathname,
              item.transport,
              bytes,
              options,
              controller.signal,
            ),
            "UPLOAD_FAILED",
          );
        }
      }
      check(
        await remoteOriginal(
          sdk,
          pathname,
          item.transport,
          bytes,
          options,
          controller.signal,
        ),
        "REMOTE_INTEGRITY",
      );
    };
    await Promise.race([operation(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", rejectAbort);
    dependencies.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
async function cleanup(staging, files) {
  if (!staging) return;
  try {
    await unchanged(staging.checked);
    for (const item of files) {
      check(path.dirname(item.path) === staging.path, "PATH_UNSAFE");
      const checked = await verifiedPath(item.path, true);
      check(sameFile(item.stat, checked.at(-1).stat, true), "PATH_UNSAFE");
      await unchanged(staging.checked);
      await unlink(item.path);
    }
    await unchanged(staging.checked);
    await rmdir(staging.path); // Empty directory only; never a recursive removal.
  } catch {
    /* Leave ambiguous temporary files in place; never broaden deletion. */
  }
}

/** Explicit exported data only. Blob SDK injection is reserved for offline tests. */
export async function runUpload(options, dependencies = {}) {
  let staging, outputHandle;
  const stagedFiles = [];
  try {
    const manifestPath = absolute(options?.manifestPath),
      envFile = absolute(options?.envFile),
      output = absolute(options?.output);
    check(
      path.basename(manifestPath) === "manifest.json" &&
        !inside(REPOSITORY, manifestPath),
      "PATH_UNSAFE",
    );
    const parent = await destination(
      output,
      await workspaceRoots(dependencies),
    );
    const source = await readVerified(manifestPath, LIMITS.manifestBytes);
    const manifest = parseManifest(source.bytes);
    let configuration;
    try {
      configuration = parseEnv(
        new globalThis.TextDecoder("utf-8", { fatal: true }).decode(
          (await readVerified(envFile, 64 * 1024)).bytes,
        ),
      );
    } catch {
      throw fail("ENV_INVALID");
    }
    const token = configuration.BLOB_READ_WRITE_TOKEN;
    check(
      typeof token === "string" &&
        token.length > 0 &&
        token.length <= 4096 &&
        token === token.trim() &&
        !Array.from(token).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ),
      "ENV_INVALID",
    );
    await unchanged(parent);
    const temporary = path.join(
      path.dirname(output),
      `.macro-public-upload-${randomUUID()}`,
    );
    await mkdir(temporary, { mode: 0o700 });
    staging = { path: temporary, checked: await verifiedPath(temporary) };
    const items = [];
    let transferBytes = 0;
    for (const artifact of manifest.artifacts) {
      const item = await stageArtifact(
        artifact,
        path.dirname(manifestPath),
        staging,
        stagedFiles,
        transferBytes,
      );
      items.push(item);
      transferBytes += item.transport.transferBytes;
    }
    await unchanged(source.checked, true);
    await unchanged(parent);
    try {
      outputHandle = await open(output, "wx", 0o600);
    } catch (error) {
      throw fail(error?.code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_FAILED");
    }
    const descriptor = {
      version: 1,
      complete: false,
      manifest,
      transports: [],
    };
    await persist(outputHandle, output, parent, descriptor);
    const sdk = dependencies.blob ?? { get, put };
    for (const item of items) {
      await uploadArtifact(item, manifest.generation, token, sdk, dependencies);
      descriptor.transports.push(item.transport);
      await persist(outputHandle, output, parent, descriptor);
    }
    descriptor.complete = true;
    await persist(outputHandle, output, parent, descriptor);
    return {
      status: "complete",
      artifacts: items.length,
      rawBytes: manifest.artifacts.reduce(
        (total, item) => total + item.sizeBytes,
        0,
      ),
      transferBytes,
    };
  } catch (error) {
    throw safe(error, "UPLOAD_FAILED");
  } finally {
    await outputHandle?.close().catch(() => {});
    await cleanup(staging, stagedFiles);
  }
}

if (argv[1] && import.meta.url === pathToFileURL(path.resolve(argv[1])).href) {
  try {
    let values;
    try {
      ({ values } = parseArgs({
        options: {
          manifest: { type: "string" },
          "env-file": { type: "string" },
          output: { type: "string" },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch {
      throw fail("ARGUMENTS_INVALID");
    }
    const result = await runUpload({
      manifestPath: values.manifest,
      envFile: values["env-file"],
      output: values.output,
    });
    stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const issue = safe(error, "UPLOAD_FAILED");
    stderr.write(
      `${JSON.stringify({ status: "failed", code: issue.code, message: issue.message })}\n`,
    );
    process.exitCode = 1;
  }
}
