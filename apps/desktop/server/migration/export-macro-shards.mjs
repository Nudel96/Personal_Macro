import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { createReadStream, constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
export const MACRO_SCHEMAS = JSON.parse(
  await readFile(
    new URL(
      "../../src-tauri/src/cloud_public/macro_schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const MACRO_KEYS = Object.freeze({
  macro: "eodhd:macro",
  cot: "cftc:legacy",
  technicals: "eodhd:technicals",
  regime: "eodhd:aud-china-cpi",
});
const MAX_ARTIFACT = 128 * 1024 * 1024;
const MAX_BUNDLE = 512 * 1024 * 1024;
const FX = "'AUD','CAD','CHF','CNY','EUR','GBP','JPY','NZD','USD'";
const FX_SELECT = `SELECT provider_symbol FROM seasonality_provider_instruments WHERE provider='eodhd' AND category='Forex' AND base_currency IN (${FX}) AND quote_currency IN (${FX})`;
const AUD_SELECT =
  "SELECT provider_symbol FROM seasonality_provider_instruments WHERE provider='eodhd' AND (LOWER(REPLACE(display_symbol,'/',''))='audusd' OR LOWER(provider_symbol)='audusd.forex')";
const URLS = new Set([
  "https://eodhd.com/api/economic-events",
  "https://publicreporting.cftc.gov/resource/6dca-aqww.json",
]);
const MESSAGES = {
  ARGUMENTS_INVALID:
    "Ein abgeschlossener SQLite-Snapshot und ein neues temporäres Ausgabeverzeichnis sind erforderlich.",
  PATH_UNSAFE: "Der gewählte Snapshot- oder Ausgabepfad ist nicht zulässig.",
  SOURCE_CHANGED: "Der Snapshot wurde während der Prüfung verändert.",
  SNAPSHOT_NOT_CLOSED:
    "Der Snapshot ist nicht als eigenständige abgeschlossene SQLite-Datei verfügbar.",
  SCHEMA_INVALID:
    "Eine öffentliche Quelltabelle entspricht nicht dem freigegebenen Schema.",
  DATA_INVALID:
    "Öffentliche Quelldaten entsprechen nicht dem freigegebenen Datenvertrag.",
  LIMIT_EXCEEDED:
    "Das öffentliche Datenpaket überschreitet eine festgelegte Größe.",
  EXPORT_FAILED:
    "Die öffentlichen Analysepakete konnten nicht exportiert werden.",
};
export class MacroShardExportError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? MESSAGES.EXPORT_FAILED);
    this.code = Object.hasOwn(MESSAGES, code) ? code : "EXPORT_FAILED";
  }
}
const check = (value, code = "DATA_INVALID") => {
  if (!value) throw new MacroShardExportError(code);
};
const q = (value) => `"${value}"`; // Only reviewed JSON identifiers reach SQL.
function inside(root, target) {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
}
function absolute(value) {
  check(
    typeof value === "string" &&
      path.isAbsolute(value) &&
      !value.includes("\0"),
    "ARGUMENTS_INVALID",
  );
  return path.resolve(value);
}
function same(a, b) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
async function inspectPath(target, file = false) {
  let current = path.parse(target).root;
  const parts = path.relative(current, target).split(path.sep).filter(Boolean),
    checked = [];
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    const stat = await lstat(current, { bigint: true }),
      final = i === parts.length - 1;
    check(
      !stat.isSymbolicLink() &&
        (final && file ? stat.isFile() : stat.isDirectory()),
      "PATH_UNSAFE",
    );
    check(
      path.relative(current, await realpath(current)) === "",
      "PATH_UNSAFE",
    );
    if (final && file) check(stat.nlink === 1n, "PATH_UNSAFE");
    checked.push({ path: current, stat });
  }
  return checked;
}
async function unchanged(checked, contents = false) {
  for (const [i, entry] of checked.entries()) {
    const current = await lstat(entry.path, { bigint: true });
    check(
      !current.isSymbolicLink() &&
        entry.stat.dev === current.dev &&
        entry.stat.ino === current.ino &&
        entry.stat.mode === current.mode &&
        (!contents || i !== checked.length - 1 || same(entry.stat, current)),
      "SOURCE_CHANGED",
    );
    check(
      path.relative(entry.path, await realpath(entry.path)) === "",
      "PATH_UNSAFE",
    );
  }
}
async function noJournal(file) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(file + suffix);
      throw new MacroShardExportError("SNAPSHOT_NOT_CLOSED");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function filter(kind, table) {
  switch (table) {
    case "eodhd_events":
      return kind === "regime" ? "currency='CNY'" : `currency IN (${FX})`;
    case "eodhd_indicator_profiles":
    case "eodhd_indicator_series":
      return kind === "regime"
        ? "currency='CNY' AND canonical_key='cpi_yoy' AND enabled=1"
        : `currency IN (${FX}) AND enabled=1`;
    case "eodhd_event_revisions":
      return `event_id IN (SELECT id FROM eodhd_events WHERE ${kind === "regime" ? "currency='CNY'" : `currency IN (${FX})`})`;
    case "eodhd_fundamental_snapshots":
      return "id IN (SELECT id FROM eodhd_fundamental_snapshots ORDER BY built_at DESC LIMIT 1)";
    case "eodhd_fundamental_evaluations":
      return "snapshot_id IN (SELECT id FROM eodhd_fundamental_snapshots ORDER BY built_at DESC LIMIT 1)";
    case "eodhd_sync_runs":
      return "status IN ('complete','partial') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 2";
    case "eodhd_mapping_candidates":
      return `currency IN (${FX})`;
    case "cot_contracts":
      return "is_active=1";
    case "cot_legacy_observations":
      return "contract_id IN (SELECT id FROM cot_contracts WHERE is_active=1)";
    case "cot_sync_runs":
      return "status='complete' AND source_url='https://publicreporting.cftc.gov/resource/6dca-aqww.json' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 2";
    case "seasonality_provider_instruments":
    case "seasonality_provider_profiles":
    case "seasonality_provider_daily_candles":
      return `provider='eodhd' AND provider_symbol IN (${kind === "regime" ? AUD_SELECT : FX_SELECT})`;
    case "eodhd_intraday_candles":
      return `interval_seconds=3600 AND provider_symbol IN (${FX_SELECT})`;
    default:
      throw new MacroShardExportError("SCHEMA_INVALID");
  }
}
function safeProfile(text) {
  check(typeof text === "string" && text.length <= 256 * 1024);
  const value = JSON.parse(text);
  check(value && typeof value === "object" && !Array.isArray(value));
  check(
    ["available", "insufficient_history", "unavailable"].includes(
      value.qualityStatus,
    ),
  );
  check(
    Number.isSafeInteger(value.completeYears) &&
      value.completeYears >= 0 &&
      value.completeYears <= 500,
  );
  check(
    typeof value.calculatedAt === "string" &&
      Number.isFinite(Date.parse(value.calculatedAt)),
  );
  check(
    Array.isArray(value.forwardReturns) && value.forwardReturns.length <= 32,
  );
  const forwardReturns = value.forwardReturns.map((item) => {
    check(
      Number.isSafeInteger(item.tradingDays) &&
        item.tradingDays > 0 &&
        item.tradingDays <= 366,
    );
    check(
      Number.isSafeInteger(item.samples) &&
        item.samples >= 0 &&
        item.samples <= 500,
    );
    const clean = { tradingDays: item.tradingDays, samples: item.samples };
    for (const name of ["averageReturn", "medianReturn", "positiveRatio"]) {
      const number = item[name];
      check(
        number === null ||
          (typeof number === "number" && Number.isFinite(number)),
      );
      clean[name] = number;
    }
    check(
      clean.positiveRatio === null ||
        (clean.positiveRatio >= 0 && clean.positiveRatio <= 1),
    );
    return clean;
  });
  return JSON.stringify({
    qualityStatus: value.qualityStatus,
    completeYears: value.completeYears,
    calculatedAt: value.calculatedAt,
    forwardReturns,
  });
}
function cleanRow(table, row, columns) {
  const clean = {};
  for (const { name, type } of columns) {
    let value = row[name];
    if (value !== null) {
      if (type === "TEXT")
        check(
          typeof value === "string" &&
            value.length <= (name === "profile_json" ? 256 * 1024 : 8192) &&
            ![...value].some(
              (character) =>
                character.charCodeAt(0) < 32 &&
                ![9, 10, 13].includes(character.charCodeAt(0)),
            ),
        );
      else if (type === "INTEGER") check(Number.isSafeInteger(value));
      else check(typeof value === "number" && Number.isFinite(value));
    }
    if (name === "source_url" && value !== null) check(URLS.has(value));
    if (name === "reason_codes_json") {
      const values = JSON.parse(value);
      check(
        Array.isArray(values) &&
          values.length <= 100 &&
          values.every(
            (v) => typeof v === "string" && /^[a-zA-Z0-9_:-]{1,160}$/.test(v),
          ),
      );
      value = JSON.stringify(values);
    }
    if (name === "profile_json") value = safeProfile(value);
    if (["provider_symbol", "source_code"].includes(name) && value !== null)
      check(/^[A-Za-z0-9._-]{1,96}$/.test(value));
    if (name === "currency" && value !== null) check(FX.includes(`'${value}'`));
    clean[name] = value;
  }
  if (table === "cot_legacy_observations") {
    check(
      clean.open_interest > 0 &&
        clean.long_positions >= 0 &&
        clean.short_positions >= 0,
    );
    check(clean.net_positions === clean.long_positions - clean.short_positions);
    for (const prefix of ["commercial", "nonreportable"]) {
      const long = clean[`${prefix}_long`],
        short = clean[`${prefix}_short`];
      check(
        (long === null && short === null) ||
          (Number.isSafeInteger(long) &&
            Number.isSafeInteger(short) &&
            long >= 0 &&
            short >= 0 &&
            long <= clean.open_interest &&
            short <= clean.open_interest),
      );
    }
  }
  if (
    table === "seasonality_provider_daily_candles" ||
    table === "eodhd_intraday_candles"
  ) {
    const prefix = table === "seasonality_provider_daily_candles" ? "bid_" : "";
    for (const key of ["open", "high", "low", "close"])
      check(clean[prefix + key] > 0);
    check(
      clean[prefix + "high"] >=
        Math.max(
          clean[prefix + "open"],
          clean[prefix + "close"],
          clean[prefix + "low"],
        ),
    );
    check(
      clean[prefix + "low"] <=
        Math.min(clean[prefix + "open"], clean[prefix + "close"]),
    );
  }
  return clean;
}

async function writeArtifact(source, output, kind, spec, remaining) {
  const staging = path.join(output, `${randomUUID()}.partial`),
    handle = await open(staging, "wx", 0o600);
  await handle.close();
  const destination = new DatabaseSync(staging, { allowExtension: false });
  let rows = 0;
  try {
    destination.exec(
      `PRAGMA journal_mode=DELETE;PRAGMA trusted_schema=OFF;PRAGMA page_size=4096;PRAGMA max_page_count=${Math.floor(Math.min(MAX_ARTIFACT, remaining) / 4096)};BEGIN`,
    );
    for (const [table, definition] of Object.entries(spec.tables)) {
      check(/^[a-z_]+$/.test(table), "SCHEMA_INVALID");
      destination.exec(definition.ddl);
      const columns = destination
        .prepare(`PRAGMA table_info(${q(table)})`)
        .all();
      const schema = source
        .prepare("SELECT type FROM sqlite_schema WHERE name=?")
        .get(table);
      check(schema?.type === "table", "SCHEMA_INVALID");
      const sourceColumns = new Map(
        source
          .prepare(`PRAGMA table_info(${q(table)})`)
          .all()
          .map((column) => [column.name, column.type.toUpperCase()]),
      );
      for (const column of columns)
        check(sourceColumns.get(column.name) === column.type, "SCHEMA_INVALID");
      const selection = source.prepare(
        `SELECT ${columns.map((c) => q(c.name)).join(",")} FROM ${q(table)} WHERE ${filter(kind, table)}`,
      );
      const insert = destination.prepare(
        `INSERT INTO ${q(table)} VALUES(${columns.map(() => "?").join(",")})`,
      );
      let count = 0;
      for (const row of selection.iterate()) {
        check(++count <= definition.maxRows, "LIMIT_EXCEEDED");
        const clean = cleanRow(table, row, columns);
        insert.run(...columns.map((column) => clean[column.name]));
      }
      rows += count;
    }
    destination.exec("COMMIT");
    check(
      Object.values(destination.prepare("PRAGMA quick_check").get())[0] ===
        "ok",
      "SCHEMA_INVALID",
    );
  } finally {
    destination.close();
  }
  await noJournal(staging);
  const sizeBytes = Number((await lstat(staging)).size);
  check(sizeBytes <= MAX_ARTIFACT && sizeBytes <= remaining, "LIMIT_EXCEEDED");
  const sha256 = await digest(staging),
    fileName = `${sha256}.sqlite`;
  await rename(staging, path.join(output, fileName));
  return {
    kind,
    key: MACRO_KEYS[kind],
    sha256,
    sizeBytes,
    rows,
    fileName,
    format: "sqlite",
    schemaVersion: 1,
  };
}

/** Offline export only; never opens an active AppData database or discovers credentials. */
export async function exportMacroShards({ snapshotPath, outputDirectory }) {
  let db, sourceHandle;
  try {
    const snapshot = absolute(snapshotPath),
      output = absolute(outputDirectory);
    check(
      !inside(REPOSITORY, output) &&
        inside(path.resolve(os.tmpdir()), output) &&
        !inside(path.dirname(snapshot), output) &&
        !inside(output, path.dirname(snapshot)),
      "PATH_UNSAFE",
    );
    check(
      !/^(?:journal|cache)\.sqlite$/i.test(path.basename(snapshot)) &&
        !/(?:^|[\\/])appdata[\\/].*[\\/]personalmacro(?:[\\/]|$)/i.test(
          snapshot,
        ),
      "PATH_UNSAFE",
    );
    const sourceChecked = await inspectPath(snapshot, true),
      parentChecked = await inspectPath(path.dirname(output));
    try {
      await lstat(output);
      throw new MacroShardExportError("PATH_UNSAFE");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await noJournal(snapshot);
    sourceHandle = await open(
      snapshot,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    check(
      same(
        sourceChecked.at(-1).stat,
        await sourceHandle.stat({ bigint: true }),
      ),
      "SOURCE_CHANGED",
    );
    const header = Buffer.alloc(100);
    check(
      (await sourceHandle.read(header, 0, 100, 0)).bytesRead === 100 &&
        header.toString("ascii", 0, 16) === "SQLite format 3\0",
      "SNAPSHOT_NOT_CLOSED",
    );
    check(header[18] === 1 && header[19] === 1, "SNAPSHOT_NOT_CLOSED");
    db = new DatabaseSync(snapshot, { readOnly: true, allowExtension: false });
    db.exec(
      "PRAGMA query_only=ON;PRAGMA trusted_schema=OFF;PRAGMA busy_timeout=0;BEGIN",
    );
    check(
      Object.values(db.prepare("PRAGMA quick_check").get())[0] === "ok",
      "SCHEMA_INVALID",
    );
    await unchanged(parentChecked);
    await mkdir(output, { mode: 0o700 });
    const outputChecked = await inspectPath(output);
    const artifacts = [];
    let remaining = MAX_BUNDLE - 1024 * 1024;
    for (const [kind, spec] of Object.entries(MACRO_SCHEMAS)) {
      await unchanged(outputChecked);
      await unchanged(sourceChecked, true);
      const artifact = await writeArtifact(db, output, kind, spec, remaining);
      artifacts.push(artifact);
      remaining -= artifact.sizeBytes;
    }
    db.exec("ROLLBACK");
    db.close();
    db = undefined;
    await noJournal(snapshot);
    await unchanged(sourceChecked, true);
    await unchanged(outputChecked);
    check(
      same(
        sourceChecked.at(-1).stat,
        await sourceHandle.stat({ bigint: true }),
      ),
      "SOURCE_CHANGED",
    );
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
    throw error instanceof MacroShardExportError
      ? error
      : new MacroShardExportError("EXPORT_FAILED");
  } finally {
    try {
      db?.close();
    } finally {
      await sourceHandle?.close();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: { snapshot: { type: "string" }, output: { type: "string" } },
      strict: true,
      allowPositionals: false,
    });
    const manifest = await exportMacroShards({
      snapshotPath: values.snapshot,
      outputDirectory: values.output,
    });
    process.stdout.write(
      JSON.stringify({
        status: "exported",
        artifacts: manifest.artifacts.length,
        sizeBytes: manifest.artifacts.reduce(
          (total, a) => total + a.sizeBytes,
          0,
        ),
      }) + "\n",
    );
  } catch (error) {
    const safe =
      error instanceof MacroShardExportError
        ? error
        : new MacroShardExportError("ARGUMENTS_INVALID");
    process.stderr.write(
      JSON.stringify({
        status: "failed",
        code: safe.code,
        message: safe.message,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
