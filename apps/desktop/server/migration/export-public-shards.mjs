import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process, { argv, stderr, stdout } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
const MIB = 1024 * 1024;
export const LIMITS = Object.freeze({
  artifactBytes: 64 * MIB,
  bundleBytes: 512 * MIB,
  instruments: 10_000,
  profiles: 10_000,
  candles: 100_000,
  events: 10_000,
  profileBytes: 256 * 1024,
  symbols: 510,
});
const RATE_SOURCE = "https://eodhd.com/api/economic-events";
const PRICE_SOURCE =
  "https://eodhd.com/financial-apis/api-for-historical-data-and-volumes";
const PRICE_NAME = "EODHD Historical Market Data";
const CURRENCIES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "USD",
]);
const CATEGORIES = new Set([
  "Forex",
  "Commodities",
  "Indizes",
  "Kryptowährungen",
]);
const QUALITY = new Set(["available", "insufficient_history", "unavailable"]);
const ZONES = new Set([
  "EODHD/FRED provider-native date",
  "EODHD provider-native trading date",
]);
const REASONS = new Set([
  "Mindestens zehn vollständige Kalenderjahre aus lokal gespeicherter D1-Historie.",
  "Für eine bewertbare Seasonality werden mindestens zehn vollständige Kalenderjahre benötigt.",
  "Für dieses Asset ist keine nutzbare lokale D1-Historie vorhanden.",
  "Mindestens zehn vollständige Jahre aus EODHD-D1-Historie. Adjusted Close wird verwendet, wenn EODHD ihn bereitstellt.",
  "EODHD liefert für dieses Asset weniger als zehn vollständige D1-Jahre; die Analyse bleibt explorativ.",
]);
const ERRORS = {
  ARGUMENTS_INVALID:
    "Snapshot, neues temporäres Ausgabe-Verzeichnis und Katalogsymbole müssen ausdrücklich angegeben werden.",
  PATH_UNSAFE: "Die Pfade sind nicht zulässig oder wurden verändert.",
  OUTPUT_EXISTS:
    "Das Ausgabe-Verzeichnis existiert bereits und wird nicht überschrieben.",
  SNAPSHOT_NOT_CLOSED:
    "Erforderlich ist ein abgeschlossener SQLite-Snapshot ohne Journaldateien.",
  SNAPSHOT_INVALID:
    "Der Snapshot konnte nicht konsistent und schreibgeschützt geprüft werden.",
  SCHEMA_INVALID:
    "Eine benötigte öffentliche Quelltabelle entspricht nicht dem freigegebenen Schema.",
  DATA_INVALID:
    "Öffentliche Quelldaten entsprechen nicht dem freigegebenen Datenvertrag.",
  SYMBOL_UNAVAILABLE:
    "Ein ausgewähltes Symbol besitzt keinen vollständigen EODHD-Datensatz im Snapshot.",
  LIMIT_EXCEEDED:
    "Der Export überschreitet eine festgelegte Mengen- oder Speichergrenze.",
  EXPORT_FAILED:
    "Der öffentliche Cache-Export konnte nicht abgeschlossen werden.",
};
export class PublicShardExportError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : "EXPORT_FAILED";
    super(ERRORS[safeCode]);
    this.code = safeCode;
  }
}
const fail = (code) => new PublicShardExportError(code);
function check(value, code = "DATA_INVALID") {
  if (!value) throw fail(code);
}

// Fixed schemas only. Source SQL, paths and provider payloads are never copied.
const SCHEMAS = {
  eodhd_events: {
    currency: "TEXT",
    provider_type: "TEXT",
    released_at: "TEXT",
    actual_value: "TEXT",
    forecast_value: "TEXT",
    source_url: "TEXT",
    updated_at: "TEXT",
    canonical_key: "TEXT",
    mapping_status: "TEXT",
  },
  eodhd_sync_runs: {
    started_at: "TEXT",
    completed_at: "TEXT",
    status: "TEXT",
    error_message: "TEXT",
  },
  seasonality_provider_instruments: {
    provider: "TEXT",
    provider_symbol: "TEXT",
    display_symbol: "TEXT",
    category: "TEXT",
    description: "TEXT",
    base_currency: "TEXT",
    quote_currency: "TEXT",
    native_timezone: "TEXT",
  },
  seasonality_provider_profiles: {
    provider: "TEXT",
    provider_symbol: "TEXT",
    calculated_at: "TEXT",
    complete_years: "INTEGER",
    quality_status: "TEXT",
    missing_days: "INTEGER",
    profile_json: "TEXT",
  },
  seasonality_provider_sync_runs: {
    provider: "TEXT",
    started_at: "TEXT",
    completed_at: "TEXT",
    status: "TEXT",
    error_message: "TEXT",
  },
  seasonality_provider_daily_candles: {
    provider: "TEXT",
    provider_symbol: "TEXT",
    candle_time: "INTEGER",
    mid_close: "REAL",
  },
};
const PRIMARY_KEYS = {
  seasonality_provider_instruments: ["provider", "provider_symbol"],
  seasonality_provider_profiles: ["provider", "provider_symbol"],
  seasonality_provider_daily_candles: [
    "provider",
    "provider_symbol",
    "candle_time",
  ],
};
const q = (name) => `"${name}"`; // Only fixed identifiers from SCHEMAS reach this helper.

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
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
      value.length > 0 &&
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
function identity(a, b, contents = false) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    (!contents ||
      (a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs))
  );
}
async function verifyPath(target, file = false) {
  let current = path.parse(target).root;
  const checked = [];
  const parts = path.relative(current, target).split(path.sep).filter(Boolean);
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = path.join(current, parts[index]);
    const stat = await lstat(current, { bigint: true });
    const final = index === parts.length - 1;
    check(
      !stat.isSymbolicLink() &&
        (final && file ? stat.isFile() : stat.isDirectory()),
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
    const stat = await lstat(previous.path, { bigint: true });
    check(
      !stat.isSymbolicLink() &&
        identity(previous.stat, stat, contents && index === checked.length - 1),
      "PATH_UNSAFE",
    );
    check(
      path.relative(previous.path, await realpath(previous.path)) === "",
      "PATH_UNSAFE",
    );
  }
}
async function noJournal(snapshot) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(snapshot + suffix);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw fail("SNAPSHOT_NOT_CLOSED");
  }
}
function sourceSchema(db, table) {
  const definition = db
    .prepare("SELECT type,sql FROM sqlite_schema WHERE name=?")
    .get(table);
  check(
    definition?.type === "table" &&
      !/\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(definition.sql ?? ""),
    "SCHEMA_INVALID",
  );
  const columns = db.prepare(`PRAGMA table_xinfo(${q(table)})`).all();
  for (const [name, type] of Object.entries(SCHEMAS[table])) {
    const column = columns.find((c) => c.name === name);
    check(
      column && column.type.toUpperCase() === type && column.hidden === 0,
      "SCHEMA_INVALID",
    );
  }
}
function boundedRows(db, sql, args, limit) {
  const rows = db.prepare(`${sql} LIMIT ${limit + 1}`).all(...args);
  check(rows.length <= limit, "LIMIT_EXCEEDED");
  return rows;
}
function boundTextColumns(db, table, condition, excluded = []) {
  const columns = Object.entries(SCHEMAS[table]).filter(
    ([name, type]) =>
      type === "TEXT" &&
      name !== "error_message" &&
      name !== "profile_json" &&
      !excluded.includes(name),
  );
  for (const [column] of columns) {
    const row = db
      .prepare(
        `SELECT COALESCE(MAX(length(CAST(${q(column)} AS BLOB))),0) AS bytes FROM ${q(table)} WHERE ${condition}`,
      )
      .get();
    check(row.bytes <= 512, "LIMIT_EXCEEDED");
  }
}
function text(value, maximum = 512, nullable = false) {
  if (nullable && value === null) return value;
  check(
    typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value) <= maximum &&
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }),
  );
  return value;
}
function timestamp(value, nullable = false) {
  if (nullable && value === null) return value;
  text(value, 40);
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) && Number.isFinite(Date.parse(value)),
  );
  return value;
}
function publicLabel(value, maximum = 512, nullable = false) {
  text(value, maximum, nullable);
  if (value !== null)
    check(
      !/(?:https?:\/\/|file:|[a-z]:[\\/]|\\\\|\bbearer\s|\b(?:api[_ -]?key|token|password|secret|authorization)\s*[:=])/i.test(
        value,
      ),
    );
  return value;
}
function date(value) {
  if (value === null) return value;
  text(value, 10);
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
  return value;
}
function integer(value, maximum = 1_000_000, minimum = 0) {
  check(Number.isSafeInteger(value) && value >= minimum && value <= maximum);
  return value;
}
function numeric(value, minimum = -Infinity, maximum = Infinity) {
  if (value === null) return value;
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum,
  );
  return value;
}
function decimal(value) {
  if (value === null) return value;
  text(value, 64);
  check(/^[+-]?\d+(?:\.\d+)?$/.test(value));
  return value;
}
function symbol(value) {
  check(typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value));
  return value;
}
function shape(value, required, optional = []) {
  check(value && typeof value === "object" && !Array.isArray(value));
  check(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every(
        (key) => required.includes(key) || optional.includes(key),
      ),
  );
}
function array(value, maximum, validate, minimum = 0) {
  check(
    Array.isArray(value) && value.length >= minimum && value.length <= maximum,
  );
  value.forEach(validate);
}
function instrument(row) {
  check(row.provider === "eodhd" && CATEGORIES.has(row.category));
  symbol(row.provider_symbol);
  text(row.display_symbol, 64);
  check(/^[A-Z0-9][A-Z0-9/._-]{0,63}$/.test(row.display_symbol));
  publicLabel(row.description, 512, true);
  for (const value of [row.base_currency, row.quote_currency])
    check(
      value === null ||
        (typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value)),
    );
  check(row.native_timezone === null || ZONES.has(row.native_timezone));
  return row;
}
function validateProfile(row, item) {
  timestamp(row.calculated_at);
  integer(row.complete_years, 300);
  integer(row.missing_days);
  check(QUALITY.has(row.quality_status));
  text(row.profile_json, LIMITS.profileBytes);
  let data;
  try {
    data = JSON.parse(row.profile_json);
  } catch {
    throw fail("DATA_INVALID");
  }
  shape(
    data,
    [
      "symbol",
      "category",
      "description",
      "baseCurrency",
      "quoteCurrency",
      "calculatedAt",
      "historyStart",
      "historyEnd",
      "completeYears",
      "qualityStatus",
      "qualityReason",
      "annualCurve",
      "months",
      "quarters",
      "forwardReturns",
      "similarYears",
      "heatmapSignal",
    ],
    ["dataSource", "dataSourceUrl", "nativeTimezone", "missingDays"],
  );
  for (const [key, source] of [
    ["symbol", "display_symbol"],
    ["category", "category"],
    ["description", "description"],
    ["baseCurrency", "base_currency"],
    ["quoteCurrency", "quote_currency"],
  ])
    check(data[key] === item[source]);
  check(
    data.calculatedAt === row.calculated_at &&
      data.completeYears === row.complete_years &&
      data.qualityStatus === row.quality_status &&
      REASONS.has(data.qualityReason),
  );
  date(data.historyStart);
  date(data.historyEnd);
  check((data.historyStart === null) === (data.historyEnd === null));
  check(data.historyStart === null || data.historyStart <= data.historyEnd);
  check(data.dataSource === undefined || data.dataSource === PRICE_NAME);
  check(
    data.dataSourceUrl === undefined ||
      data.dataSourceUrl === null ||
      data.dataSourceUrl === PRICE_SOURCE,
  );
  check(
    data.nativeTimezone === undefined ||
      data.nativeTimezone === null ||
      data.nativeTimezone === item.native_timezone,
  );
  check(
    data.missingDays === undefined || data.missingDays === row.missing_days,
  );
  check(data.heatmapSignal === null || [-1, 0, 1].includes(data.heatmapSignal));
  array(
    data.annualCurve,
    52,
    (point, index) => {
      shape(point, ["week", "mean", "p25", "p75"]);
      check(point.week === index + 1);
      for (const key of ["mean", "p25", "p75"]) numeric(point[key]);
    },
    52,
  );
  const period = (point) => {
    shape(point, [
      "period",
      "averageReturn",
      "medianReturn",
      "positiveRatio",
      "samples",
    ]);
    numeric(point.averageReturn);
    numeric(point.medianReturn);
    numeric(point.positiveRatio, 0, 1);
    integer(point.samples, 300);
  };
  array(
    data.months,
    12,
    (point, i) => {
      period(point);
      check(point.period === `M${String(i + 1).padStart(2, "0")}`);
    },
    12,
  );
  array(
    data.quarters,
    4,
    (point, i) => {
      period(point);
      check(point.period === `Q${i + 1}`);
    },
    4,
  );
  array(
    data.forwardReturns,
    3,
    (point, i) => {
      shape(point, [
        "label",
        "tradingDays",
        "averageReturn",
        "medianReturn",
        "positiveRatio",
        "volatility",
        "samples",
      ]);
      check(
        point.tradingDays === [5, 20, 60][i] &&
          point.label === ["1 Woche", "4 Wochen", "13 Wochen"][i],
      );
      numeric(point.averageReturn);
      numeric(point.medianReturn);
      numeric(point.positiveRatio, 0, 1);
      numeric(point.volatility, 0);
      integer(point.samples, 300);
    },
    3,
  );
  const years = new Set();
  array(data.similarYears, 3, (point) => {
    shape(point, ["year", "correlation", "finalReturn"]);
    integer(point.year, 2500, 1500);
    check(!years.has(point.year));
    years.add(point.year);
    numeric(point.correlation, -1, 1);
    numeric(point.finalReturn);
  });
  // Serialize the validated contract, never retain an arbitrary JSON payload.
  data.dataSource = PRICE_NAME;
  data.dataSourceUrl = PRICE_SOURCE;
  data.nativeTimezone = item.native_timezone;
  data.missingDays = row.missing_days;
  return { ...row, profile_json: JSON.stringify(data) };
}
function runs(db, table, provider = false) {
  // Never SELECT free-form error_message, provider_symbol, trigger or run IDs.
  const filter = provider ? "provider='eodhd' AND " : "";
  const latest = db
    .prepare(
      `SELECT started_at,completed_at,status FROM ${q(table)} WHERE ${filter}1 ORDER BY started_at DESC LIMIT 1`,
    )
    .get();
  const success = db
    .prepare(
      `SELECT started_at,completed_at,status FROM ${q(table)} WHERE ${filter}status IN (${provider ? "'complete'" : "'complete','partial'"}) AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1`,
    )
    .get();
  const results = [];
  for (const row of [latest, success]) {
    if (!row) continue;
    timestamp(row.started_at);
    timestamp(row.completed_at, true);
    check(
      [
        "running",
        "complete",
        "partial",
        "failed",
        ...(provider ? ["paused"] : ["skipped"]),
      ].includes(row.status),
    );
    const safe = {
      ...(provider ? { provider: "eodhd" } : {}),
      ...row,
      status: row.status === "running" ? "failed" : row.status,
      error_message: null,
    };
    if (!results.some((item) => JSON.stringify(item) === JSON.stringify(safe)))
      results.push(safe);
  }
  return results.sort((a, b) => a.started_at.localeCompare(b.started_at));
}
function readIndex(db) {
  const instruments = boundedRows(
    db,
    `SELECT ${Object.keys(SCHEMAS.seasonality_provider_instruments).map(q).join(",")} FROM seasonality_provider_instruments WHERE provider='eodhd' ORDER BY provider_symbol`,
    [],
    LIMITS.instruments,
  ).map(instrument);
  const catalog = new Map(
    instruments.map((item) => [item.provider_symbol, item]),
  );
  check(catalog.size === instruments.length);
  // Bound JSON size before materializing it in JavaScript.
  const size = db
    .prepare(
      "SELECT COALESCE(MAX(length(CAST(profile_json AS BLOB))),0) AS largest,COALESCE(SUM(length(CAST(profile_json AS BLOB))),0) AS total FROM seasonality_provider_profiles WHERE provider='eodhd'",
    )
    .get();
  check(
    size.largest <= LIMITS.profileBytes &&
      size.total <= LIMITS.artifactBytes / 2,
    "LIMIT_EXCEEDED",
  );
  const rows = boundedRows(
    db,
    `SELECT ${Object.keys(SCHEMAS.seasonality_provider_profiles).map(q).join(",")} FROM seasonality_provider_profiles WHERE provider='eodhd' ORDER BY provider_symbol`,
    [],
    LIMITS.profiles,
  );
  const seen = new Set();
  const profiles = rows.map((row) => {
    check(catalog.has(row.provider_symbol) && !seen.has(row.provider_symbol));
    seen.add(row.provider_symbol);
    return validateProfile(row, catalog.get(row.provider_symbol));
  });
  return {
    instruments,
    profiles,
    catalog,
    sync: runs(db, "seasonality_provider_sync_runs", true),
  };
}
function readRates(db) {
  const columns = Object.keys(SCHEMAS.eodhd_events)
    .slice(0, 7)
    .map(q)
    .join(",");
  const events = boundedRows(
    db,
    `SELECT ${columns} FROM eodhd_events WHERE canonical_key='interest_rates' AND mapping_status IN ('automatic','approved') ORDER BY currency,released_at,provider_type,updated_at,actual_value,forecast_value`,
    [],
    LIMITS.events,
  ).map((row) => {
    check(CURRENCIES.has(row.currency));
    publicLabel(row.provider_type, 256);
    timestamp(row.released_at);
    timestamp(row.updated_at);
    decimal(row.actual_value);
    decimal(row.forecast_value);
    check(row.source_url === RATE_SOURCE);
    return {
      ...row,
      canonical_key: "interest_rates",
      mapping_status: "approved",
    };
  });
  return { eodhd_events: events, eodhd_sync_runs: runs(db, "eodhd_sync_runs") };
}
function candles(db, providerSymbol) {
  const rows = boundedRows(
    db,
    "SELECT candle_time,mid_close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time",
    [providerSymbol],
    LIMITS.candles,
  );
  check(rows.length > 0, "SYMBOL_UNAVAILABLE");
  let last = -Infinity;
  return rows.map((row) => {
    integer(row.candle_time, Date.UTC(2500, 0, 1), Date.UTC(1500, 0, 1));
    check(row.candle_time > last && row.candle_time % 86_400_000 === 0);
    check(row.mid_close !== null);
    numeric(row.mid_close, Number.MIN_VALUE);
    last = row.candle_time;
    return { provider: "eodhd", provider_symbol: providerSymbol, ...row };
  });
}
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
function inspectOutput(db, tables) {
  const objects = db
    .prepare("SELECT name,type,sql FROM sqlite_schema ORDER BY name")
    .all();
  check(
    objects
      .filter((item) => item.type === "table")
      .map((item) => item.name)
      .join("|") === Object.keys(tables).sort().join("|"),
    "SCHEMA_INVALID",
  );
  for (const item of objects)
    check(
      item.type === "table" ||
        (item.type === "index" &&
          item.sql === null &&
          item.name.startsWith("sqlite_autoindex_")),
      "SCHEMA_INVALID",
    );
  for (const table of Object.keys(tables)) {
    const columns = db.prepare(`PRAGMA table_info(${q(table)})`).all();
    check(
      columns.length === Object.keys(SCHEMAS[table]).length &&
        columns.every(
          (column, i) =>
            column.name === Object.keys(SCHEMAS[table])[i] &&
            column.type === SCHEMAS[table][column.name],
        ),
      "SCHEMA_INVALID",
    );
  }
  const integrity = db.prepare("PRAGMA quick_check").all();
  check(
    integrity.length === 1 && Object.values(integrity[0])[0] === "ok",
    "SCHEMA_INVALID",
  );
}
async function writeArtifact(directory, checked, kind, key, tables, remaining) {
  check(remaining >= 4096, "LIMIT_EXCEEDED");
  await unchanged(checked);
  const temporary = path.join(directory, `${randomUUID()}.partial`);
  const handle = await open(temporary, "wx", 0o600);
  await handle.close();
  let db;
  let rows = 0;
  try {
    db = new DatabaseSync(temporary, { allowExtension: false });
    db.exec(
      `PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF; PRAGMA page_size=4096; PRAGMA max_page_count=${Math.floor(Math.min(remaining, LIMITS.artifactBytes) / 4096)}; BEGIN`,
    );
    for (const [table, values] of Object.entries(tables)) {
      const schema = SCHEMAS[table];
      check(schema, "SCHEMA_INVALID");
      const columns = Object.keys(schema);
      const pk = PRIMARY_KEYS[table];
      db.exec(
        `CREATE TABLE ${q(table)} (${columns.map((name) => `${q(name)} ${schema[name]}`).join(",")}${pk ? `,PRIMARY KEY(${pk.map(q).join(",")})` : ""}) STRICT`,
      );
      const insert = db.prepare(
        `INSERT INTO ${q(table)}(${columns.map(q).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      );
      for (const value of values)
        insert.run(...columns.map((name) => value[name]));
      rows += values.length;
    }
    db.exec("COMMIT");
    inspectOutput(db, tables);
    db.close();
    db = undefined;
    await unchanged(checked);
    await noJournal(temporary);
    const sizeBytes = Number((await lstat(temporary)).size);
    check(
      sizeBytes <= LIMITS.artifactBytes && sizeBytes <= remaining,
      "LIMIT_EXCEEDED",
    );
    const digest = await sha256(temporary);
    const fileName = `${digest}.sqlite`;
    // Every kind has a distinct schema; different symbol shards have different keys in their rows.
    // Thus any pre-existing hash path in this exclusively created directory is unexpected.
    try {
      await lstat(path.join(directory, fileName));
      throw fail("OUTPUT_EXISTS");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(temporary, path.join(directory, fileName));
    return {
      kind,
      key,
      sha256: digest,
      sizeBytes,
      rows,
      fileName,
      format: "sqlite",
      schemaVersion: 1,
    };
  } finally {
    db?.close();
  }
}

/** Offline only. The caller must explicitly supply a separate, completed snapshot. */
async function exportSnapshot({ snapshotPath, outputDirectory, symbols = [] }) {
  let db, sourceHandle;
  try {
    const snapshot = absolute(snapshotPath),
      output = absolute(outputDirectory);
    check(
      Array.isArray(symbols) &&
        symbols.length <= LIMITS.symbols &&
        new Set(symbols).size === symbols.length,
      "ARGUMENTS_INVALID",
    );
    symbols.forEach(symbol);
    const sourceParent = path.dirname(snapshot);
    check(
      !inside(REPOSITORY, output) &&
        inside(path.resolve(os.tmpdir()), output) &&
        !inside(sourceParent, output) &&
        !inside(output, sourceParent),
      "PATH_UNSAFE",
    );
    check(
      !/(?:^|[\\/])appdata[\\/].*[\\/]personalmacro(?:[\\/]|$)/i.test(
        snapshot,
      ) && !/^(?:journal|cache)\.sqlite$/i.test(path.basename(snapshot)),
      "PATH_UNSAFE",
    );
    const sourceChecked = await verifyPath(snapshot, true);
    check(sourceChecked.at(-1).stat.nlink === 1n, "PATH_UNSAFE");
    const parentChecked = await verifyPath(path.dirname(output));
    try {
      await lstat(output);
      throw fail("OUTPUT_EXISTS");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await noJournal(snapshot);
    sourceHandle = await open(
      snapshot,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    check(
      identity(
        sourceChecked.at(-1).stat,
        await sourceHandle.stat({ bigint: true }),
        true,
      ),
      "SNAPSHOT_INVALID",
    );
    const header = Buffer.alloc(100);
    check(
      (await sourceHandle.read(header, 0, 100, 0)).bytesRead === 100 &&
        header.toString("ascii", 0, 16) === "SQLite format 3\0",
      "SNAPSHOT_INVALID",
    );
    check(header[18] === 1 && header[19] === 1, "SNAPSHOT_NOT_CLOSED");
    await unchanged(sourceChecked, true);
    db = new DatabaseSync(snapshot, { readOnly: true, allowExtension: false });
    db.exec(
      "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; BEGIN",
    );
    const integrity = db.prepare("PRAGMA quick_check").all();
    check(
      integrity.length === 1 && Object.values(integrity[0])[0] === "ok",
      "SNAPSHOT_INVALID",
    );
    for (const table of Object.keys(SCHEMAS)) sourceSchema(db, table);
    for (const table of Object.keys(SCHEMAS)) {
      if (table === "seasonality_provider_daily_candles") continue;
      const condition =
        table === "eodhd_events"
          ? "canonical_key='interest_rates' AND mapping_status IN ('automatic','approved')"
          : table.startsWith("seasonality_")
            ? "provider='eodhd'"
            : "1";
      boundTextColumns(db, table, condition);
    }
    const rates = readRates(db),
      index = readIndex(db);
    const selected = [...symbols].sort();
    for (const providerSymbol of selected)
      check(
        index.catalog.has(providerSymbol) &&
          index.profiles.some((p) => p.provider_symbol === providerSymbol),
        "SYMBOL_UNAVAILABLE",
      );
    await unchanged(parentChecked);
    await mkdir(output, { mode: 0o700 });
    const outputChecked = await verifyPath(output);
    const artifacts = [];
    // Reserve space for the manifest and fresh-file SQLite journal within the staging budget.
    let remaining = LIMITS.bundleBytes - MIB;
    const add = async (kind, key, tables) => {
      const artifact = await writeArtifact(
        output,
        outputChecked,
        kind,
        key,
        tables,
        remaining,
      );
      artifacts.push(artifact);
      remaining -= artifact.sizeBytes;
    };
    await add("rates", "eodhd:policy-rates", rates);
    await add("seasonality-index", "eodhd:seasonality", {
      seasonality_provider_instruments: index.instruments,
      seasonality_provider_profiles: index.profiles,
      seasonality_provider_sync_runs: index.sync,
    });
    for (const providerSymbol of selected)
      await add("seasonality-symbol", `eodhd:${providerSymbol}`, {
        seasonality_provider_instruments: [index.catalog.get(providerSymbol)],
        seasonality_provider_profiles: index.profiles.filter(
          (p) => p.provider_symbol === providerSymbol,
        ),
        seasonality_provider_daily_candles: candles(db, providerSymbol),
      });
    db.exec("ROLLBACK");
    db.close();
    db = undefined;
    await noJournal(snapshot);
    check(
      identity(
        sourceChecked.at(-1).stat,
        await sourceHandle.stat({ bigint: true }),
        true,
      ),
      "SNAPSHOT_INVALID",
    );
    await unchanged(sourceChecked, true);
    await unchanged(outputChecked);
    const manifest = {
      schemaVersion: 1,
      generation: randomUUID(),
      createdAt: new Date().toISOString(),
      artifacts,
    };
    await writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return manifest;
  } catch (error) {
    throw error instanceof PublicShardExportError
      ? error
      : fail("EXPORT_FAILED");
  } finally {
    try {
      db?.close();
    } finally {
      await sourceHandle?.close();
    }
  }
}

export async function exportPublicShards(options) {
  try {
    return await exportSnapshot(options);
  } catch (error) {
    // This also normalizes errors while closing source handles in the finally block.
    throw error instanceof PublicShardExportError
      ? error
      : fail("EXPORT_FAILED");
  }
}

if (argv[1] && import.meta.url === pathToFileURL(path.resolve(argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        snapshot: { type: "string" },
        output: { type: "string" },
        symbol: { type: "string", multiple: true },
      },
      strict: true,
      allowPositionals: false,
    });
    const manifest = await exportPublicShards({
      snapshotPath: values.snapshot,
      outputDirectory: values.output,
      symbols: values.symbol ?? [],
    });
    stdout.write(
      JSON.stringify({
        status: "exported",
        artifacts: manifest.artifacts.length,
        sizeBytes: manifest.artifacts.reduce(
          (total, item) => total + item.sizeBytes,
          0,
        ),
      }) + "\n",
    );
  } catch (error) {
    const safe =
      error instanceof PublicShardExportError
        ? error
        : fail("ARGUMENTS_INVALID");
    stderr.write(
      JSON.stringify({
        status: "failed",
        code: safe.code,
        message: safe.message,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
