import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { URL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  exportPublicShards,
  LIMITS,
  PublicShardExportError,
} from "./export-public-shards.mjs";

const RATE_SOURCE = "https://eodhd.com/api/economic-events";
const PRICE_SOURCE =
  "https://eodhd.com/financial-apis/api-for-historical-data-and-volumes";
const NOW = "2026-09-25T10:00:00+00:00";
const SECRET = "PRIVATE_JOURNAL_SENTINEL_do_not_export";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plain = (row) => JSON.parse(JSON.stringify(row));

function profile(symbol = "EUR/USD", overrides = {}) {
  const period = (name) => ({
    period: name,
    averageReturn: null,
    medianReturn: null,
    positiveRatio: null,
    samples: 0,
  });
  return {
    symbol,
    category: "Forex",
    description: "Euro versus US Dollar",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    calculatedAt: NOW,
    historyStart: "2020-01-02",
    historyEnd: "2020-01-03",
    completeYears: 0,
    qualityStatus: "insufficient_history",
    qualityReason:
      "EODHD liefert für dieses Asset weniger als zehn vollständige D1-Jahre; die Analyse bleibt explorativ.",
    annualCurve: Array.from({ length: 52 }, (_, i) => ({
      week: i + 1,
      mean: null,
      p25: null,
      p75: null,
    })),
    months: Array.from({ length: 12 }, (_, i) =>
      period(`M${String(i + 1).padStart(2, "0")}`),
    ),
    quarters: Array.from({ length: 4 }, (_, i) => period(`Q${i + 1}`)),
    forwardReturns: [5, 20, 60].map((days, i) => ({
      label: ["1 Woche", "4 Wochen", "13 Wochen"][i],
      tradingDays: days,
      averageReturn: null,
      medianReturn: null,
      positiveRatio: null,
      volatility: null,
      samples: 0,
    })),
    similarYears: [],
    heatmapSignal: null,
    dataSource: "EODHD Historical Market Data",
    dataSourceUrl: PRICE_SOURCE,
    nativeTimezone: "EODHD provider-native trading date",
    missingDays: 0,
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "macro-public-shards-fixture-"),
  );
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^macro-public-shards-fixture-/);
    await rm(root, { recursive: true, force: true });
  });
  const input = path.join(root, "input");
  await mkdir(input);
  const snapshotPath = path.join(input, "completed-snapshot.sqlite");
  const outputDirectory = path.join(root, "export");
  const db = new DatabaseSync(snapshotPath);
  db.exec(`PRAGMA journal_mode=DELETE;
    CREATE TABLE eodhd_events(id TEXT PRIMARY KEY,currency TEXT,provider_type TEXT,released_at TEXT,actual_value TEXT,forecast_value TEXT,source_url TEXT,updated_at TEXT,canonical_key TEXT,mapping_status TEXT,previous_value TEXT,raw_payload TEXT);
    CREATE TABLE eodhd_sync_runs(id TEXT PRIMARY KEY,started_at TEXT,completed_at TEXT,status TEXT,error_message TEXT,trigger_kind TEXT);
    CREATE TABLE seasonality_provider_instruments(provider TEXT,provider_symbol TEXT,display_symbol TEXT,category TEXT,description TEXT,base_currency TEXT,quote_currency TEXT,native_timezone TEXT,data_kind TEXT,source_code TEXT,PRIMARY KEY(provider,provider_symbol));
    CREATE TABLE seasonality_provider_profiles(provider TEXT,provider_symbol TEXT,calculated_at TEXT,complete_years INTEGER,quality_status TEXT,missing_days INTEGER,profile_json TEXT,history_start TEXT,history_end TEXT,PRIMARY KEY(provider,provider_symbol));
    CREATE TABLE seasonality_provider_daily_candles(provider TEXT,provider_symbol TEXT,candle_time INTEGER,mid_close REAL,bid_close REAL,fetched_at TEXT,PRIMARY KEY(provider,provider_symbol,candle_time));
    CREATE TABLE seasonality_provider_sync_runs(id TEXT PRIMARY KEY,provider TEXT,started_at TEXT,completed_at TEXT,status TEXT,error_message TEXT,trigger TEXT);
    CREATE TABLE trades(notes TEXT);
    CREATE TABLE app_settings(key TEXT,value_json TEXT);
    CREATE TABLE media_files(original_filename TEXT);
    CREATE TABLE market_daily_candles(private_payload TEXT);
    CREATE TABLE seasonality_snapshots(private_payload TEXT);
    CREATE TRIGGER private_trigger AFTER INSERT ON trades BEGIN INSERT INTO app_settings VALUES('private','hidden'); END;
    CREATE VIEW private_view AS SELECT notes FROM trades;
  `);
  for (const table of [
    "trades",
    "media_files",
    "market_daily_candles",
    "seasonality_snapshots",
  ])
    db.prepare(`INSERT INTO ${table} VALUES(?)`).run(SECRET);
  db.prepare("INSERT INTO app_settings VALUES('api_key',?)").run(SECRET);
  const event = db.prepare(
    "INSERT INTO eodhd_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  event.run(
    "current",
    "USD",
    "Fed Interest Rate Decision",
    "2026-09-01T12:00:00Z",
    "4.2500",
    null,
    RATE_SOURCE,
    NOW,
    "interest_rates",
    "automatic",
    SECRET,
    SECRET,
  );
  event.run(
    "next",
    "USD",
    "Fed Interest Rate Decision",
    "2026-10-01T12:00:00Z",
    null,
    "4.0000",
    RATE_SOURCE,
    NOW,
    "interest_rates",
    "approved",
    SECRET,
    SECRET,
  );
  event.run(
    "negative",
    "JPY",
    "BoJ Interest Rate Decision",
    "2026-09-01T12:00:00Z",
    "-0.1000",
    "0",
    RATE_SOURCE,
    NOW,
    "interest_rates",
    "approved",
    SECRET,
    SECRET,
  );
  event.run(
    "ignored",
    "USD",
    SECRET,
    NOW,
    SECRET,
    SECRET,
    SECRET,
    NOW,
    "interest_rates",
    "ignored",
    SECRET,
    SECRET,
  );
  event.run(
    "inflation",
    "USD",
    SECRET,
    NOW,
    SECRET,
    SECRET,
    SECRET,
    NOW,
    "cpi",
    "approved",
    SECRET,
    SECRET,
  );
  db.prepare("INSERT INTO eodhd_sync_runs VALUES(?,?,?,?,?,?)").run(
    "previous-private-id",
    "2026-09-24T10:00:00Z",
    "2026-09-24T10:01:00Z",
    "partial",
    SECRET,
    SECRET,
  );
  db.prepare("INSERT INTO eodhd_sync_runs VALUES(?,?,?,?,?,?)").run(
    "current-private-id",
    NOW,
    null,
    "running",
    SECRET,
    SECRET,
  );
  const instrument = db.prepare(
    "INSERT INTO seasonality_provider_instruments VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  const insertProfile = db.prepare(
    "INSERT INTO seasonality_provider_profiles VALUES(?,?,?,?,?,?,?,?,?)",
  );
  const candle = db.prepare(
    "INSERT INTO seasonality_provider_daily_candles VALUES(?,?,?,?,?,?)",
  );
  for (const [providerSymbol, display] of [
    ["EURUSD.FOREX", "EUR/USD"],
    ["USDJPY.FOREX", "USD/JPY"],
    ["GBPUSD.FOREX", "GBP/USD"],
  ]) {
    instrument.run(
      "eodhd",
      providerSymbol,
      display,
      "Forex",
      "Euro versus US Dollar",
      "EUR",
      "USD",
      "EODHD provider-native trading date",
      "eod",
      providerSymbol,
    );
    if (providerSymbol === "GBPUSD.FOREX") continue;
    insertProfile.run(
      "eodhd",
      providerSymbol,
      NOW,
      0,
      "insufficient_history",
      0,
      JSON.stringify(profile(display)),
      "2020-01-02",
      "2020-01-03",
    );
    candle.run(
      "eodhd",
      providerSymbol,
      Date.UTC(2020, 0, 2),
      1.11111,
      999,
      SECRET,
    );
    candle.run(
      "eodhd",
      providerSymbol,
      Date.UTC(2020, 0, 3),
      1.125,
      999,
      SECRET,
    );
  }
  instrument.run(
    "dukascopy",
    "EURUSD",
    SECRET,
    SECRET,
    SECRET,
    SECRET,
    SECRET,
    SECRET,
    SECRET,
    SECRET,
  );
  insertProfile.run(
    "dukascopy",
    "EURUSD",
    SECRET,
    99,
    SECRET,
    0,
    SECRET,
    SECRET,
    SECRET,
  );
  candle.run("dukascopy", "EURUSD", Date.UTC(2020, 0, 2), 98765, 999, SECRET);
  db.prepare(
    "INSERT INTO seasonality_provider_sync_runs VALUES(?,?,?,?,?,?,?)",
  ).run("seasonal-private-id", "eodhd", NOW, NOW, "complete", SECRET, SECRET);
  db.close();
  return { root, snapshotPath, outputDirectory, symbols: ["EURUSD.FOREX"] };
}
function modify(file, action) {
  const db = new DatabaseSync(file);
  try {
    action(db);
  } finally {
    db.close();
  }
}
async function noManifest(output) {
  await assert.rejects(readFile(path.join(output, "manifest.json")), {
    code: "ENOENT",
  });
}

test("fresh shards retain native public read columns, exact decimals and every indexed profile, excluding private and legacy data", async (t) => {
  const options = await fixture(t);
  const before = hash(await readFile(options.snapshotPath));
  const manifest = await exportPublicShards(options);
  assert.equal(hash(await readFile(options.snapshotPath)), before);
  assert.match(
    manifest.generation,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(new Date(manifest.createdAt).toISOString(), manifest.createdAt);
  assert.deepEqual(Object.keys(manifest), [
    "schemaVersion",
    "generation",
    "createdAt",
    "artifacts",
  ]);
  assert.deepEqual(
    manifest.artifacts.map((a) => [a.kind, a.key]),
    [
      ["rates", "eodhd:policy-rates"],
      ["seasonality-index", "eodhd:seasonality"],
      ["seasonality-symbol", "eodhd:EURUSD.FOREX"],
    ],
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(options.outputDirectory, "manifest.json"),
        "utf8",
      ),
    ),
    manifest,
  );
  const schemas = {
    rates: {
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
      ],
      eodhd_sync_runs: [
        "started_at",
        "completed_at",
        "status",
        "error_message",
      ],
    },
    "seasonality-index": {
      seasonality_provider_instruments: [
        "provider",
        "provider_symbol",
        "display_symbol",
        "category",
        "description",
        "base_currency",
        "quote_currency",
        "native_timezone",
      ],
      seasonality_provider_profiles: [
        "provider",
        "provider_symbol",
        "calculated_at",
        "complete_years",
        "quality_status",
        "missing_days",
        "profile_json",
      ],
      seasonality_provider_sync_runs: [
        "provider",
        "started_at",
        "completed_at",
        "status",
        "error_message",
      ],
    },
    "seasonality-symbol": {
      seasonality_provider_instruments: [
        "provider",
        "provider_symbol",
        "display_symbol",
        "category",
        "description",
        "base_currency",
        "quote_currency",
        "native_timezone",
      ],
      seasonality_provider_profiles: [
        "provider",
        "provider_symbol",
        "calculated_at",
        "complete_years",
        "quality_status",
        "missing_days",
        "profile_json",
      ],
      seasonality_provider_daily_candles: [
        "provider",
        "provider_symbol",
        "candle_time",
        "mid_close",
      ],
    },
  };
  for (const artifact of manifest.artifacts) {
    assert.deepEqual(Object.keys(artifact), [
      "kind",
      "key",
      "sha256",
      "sizeBytes",
      "rows",
      "fileName",
      "format",
      "schemaVersion",
    ]);
    const file = path.join(options.outputDirectory, artifact.fileName);
    const bytes = await readFile(file);
    assert.equal(hash(bytes), artifact.sha256);
    assert.equal(bytes.length, artifact.sizeBytes);
    assert.equal(artifact.fileName, `${artifact.sha256}.sqlite`);
    assert.equal(bytes[18], 1);
    assert.equal(bytes[19], 1);
    assert.ok(!bytes.includes(Buffer.from(SECRET)));
    assert.ok(!bytes.includes(Buffer.from("dukascopy")));
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      assert.deepEqual(
        db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
          )
          .all()
          .map((r) => r.name),
        Object.keys(schemas[artifact.kind]).sort(),
      );
      let rowCount = 0;
      for (const [table, columns] of Object.entries(schemas[artifact.kind])) {
        assert.deepEqual(
          db
            .prepare(`PRAGMA table_info(${table})`)
            .all()
            .map((r) => r.name),
          columns,
        );
        rowCount += db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      }
      assert.equal(artifact.rows, rowCount);
      if (artifact.kind === "rates") {
        assert.deepEqual(
          db
            .prepare(
              "SELECT actual_value,forecast_value FROM eodhd_events WHERE currency='JPY'",
            )
            .get(),
          Object.assign(Object.create(null), {
            actual_value: "-0.1000",
            forecast_value: "0",
          }),
        );
        assert.equal(
          db
            .prepare(
              "SELECT actual_value FROM eodhd_events WHERE currency='USD' AND actual_value IS NOT NULL",
            )
            .get().actual_value,
          "4.2500",
        );
        assert.deepEqual(
          plain(
            db
              .prepare(
                "SELECT status,error_message FROM eodhd_sync_runs ORDER BY started_at DESC LIMIT 1",
              )
              .get(),
          ),
          { status: "failed", error_message: null },
        );
        assert.equal(
          db
            .prepare(
              "SELECT completed_at FROM eodhd_sync_runs WHERE status IN ('complete','partial') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
            )
            .get().completed_at,
          "2026-09-24T10:01:00Z",
        );
      } else if (artifact.kind === "seasonality-index") {
        assert.equal(
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM seasonality_provider_instruments",
            )
            .get().n,
          3,
        );
        assert.equal(
          db
            .prepare("SELECT COUNT(*) AS n FROM seasonality_provider_profiles")
            .get().n,
          2,
        );
        const rows = db
          .prepare(
            "SELECT pi.display_symbol,pp.profile_json FROM seasonality_provider_profiles pp JOIN seasonality_provider_instruments pi ON pi.provider=pp.provider AND pi.provider_symbol=pp.provider_symbol WHERE pp.provider='eodhd' ORDER BY pi.display_symbol",
          )
          .all();
        assert.deepEqual(
          rows.map((r) => r.display_symbol),
          ["EUR/USD", "USD/JPY"],
        );
        assert.equal(
          JSON.parse(rows[0].profile_json).dataSourceUrl,
          PRICE_SOURCE,
        );
      } else {
        assert.deepEqual(
          db
            .prepare(
              "SELECT candle_time / 1000 AS time,mid_close FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol=? ORDER BY candle_time",
            )
            .all("EURUSD.FOREX")
            .map(plain),
          [
            { time: Date.UTC(2020, 0, 2) / 1000, mid_close: 1.11111 },
            { time: Date.UTC(2020, 0, 3) / 1000, mid_close: 1.125 },
          ],
        );
      }
    } finally {
      db.close();
    }
  }
  assert.equal((await readdir(options.outputDirectory)).length, 4);
});

test("all 214 selected shards export in order; invalid, duplicate, excessive or incomplete selections fail closed", async (t) => {
  const complete = await fixture(t);
  const selection = Array.from(
    { length: 214 },
    (_, i) => `SYNTH${String(i).padStart(3, "0")}.FOREX`,
  );
  modify(complete.snapshotPath, (db) => {
    const instrument = db.prepare(
      "INSERT INTO seasonality_provider_instruments SELECT provider,?,? ,category,description,base_currency,quote_currency,native_timezone,data_kind,? FROM seasonality_provider_instruments WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
    );
    const insertProfile = db.prepare(
      "INSERT INTO seasonality_provider_profiles SELECT provider,?,calculated_at,complete_years,quality_status,missing_days,?,history_start,history_end FROM seasonality_provider_profiles WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
    );
    const candle = db.prepare(
      "INSERT INTO seasonality_provider_daily_candles SELECT provider,?,candle_time,mid_close,bid_close,fetched_at FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
    );
    db.exec("BEGIN");
    for (const providerSymbol of selection) {
      const display = providerSymbol.replace(".FOREX", "");
      instrument.run(providerSymbol, display, providerSymbol);
      insertProfile.run(providerSymbol, JSON.stringify(profile(display)));
      candle.run(providerSymbol);
    }
    db.exec("COMMIT");
  });
  const before = hash(await readFile(complete.snapshotPath));
  const manifest = await exportPublicShards({
    ...complete,
    symbols: [...selection].reverse(),
  });
  const shards = manifest.artifacts.filter(
    (artifact) => artifact.kind === "seasonality-symbol",
  );
  assert.equal(manifest.artifacts.length, 216);
  assert.deepEqual(
    shards.map((artifact) => artifact.key),
    selection.map((providerSymbol) => `eodhd:${providerSymbol}`),
  );
  for (const artifact of shards) {
    assert.equal(artifact.rows, 4);
    const db = new DatabaseSync(
      path.join(complete.outputDirectory, artifact.fileName),
      { readOnly: true },
    );
    try {
      assert.equal(
        db
          .prepare(
            "SELECT provider_symbol FROM seasonality_provider_daily_candles GROUP BY provider_symbol",
          )
          .get().provider_symbol,
        artifact.key.slice("eodhd:".length),
      );
    } finally {
      db.close();
    }
  }
  assert.equal((await readdir(complete.outputDirectory)).length, 217);
  assert.equal(hash(await readFile(complete.snapshotPath)), before);
  const excessive = await fixture(t);
  await assert.rejects(
    exportPublicShards({
      ...excessive,
      symbols: Array.from({ length: 511 }, (_, i) => `LIMIT${i}.FOREX`),
    }),
    { code: "ARGUMENTS_INVALID" },
  );
  await assert.rejects(readdir(excessive.outputDirectory), { code: "ENOENT" });
  for (const selection of [
    ["../../journal.sqlite"],
    ["EURUSD"],
    ["GBPUSD.FOREX"],
    ["EURUSD.FOREX", "EURUSD.FOREX"],
  ]) {
    const options = await fixture(t);
    await assert.rejects(
      exportPublicShards({ ...options, symbols: selection }),
      PublicShardExportError,
    );
    await noManifest(options.outputDirectory);
  }
  const options = await fixture(t);
  modify(options.snapshotPath, (db) =>
    db.exec(
      "DELETE FROM seasonality_provider_daily_candles WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
    ),
  );
  await assert.rejects(exportPublicShards(options), {
    code: "SYMBOL_UNAVAILABLE",
  });
  await noManifest(options.outputDirectory);
});

test("unknown JSON properties, nested payloads and credential-bearing public metadata are rejected without echoing values", async (t) => {
  const mutations = [
    (db) =>
      db
        .prepare(
          "UPDATE seasonality_provider_profiles SET profile_json=? WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
        )
        .run(JSON.stringify(profile("EUR/USD", { notes: SECRET }))),
    (db) =>
      db
        .prepare(
          "UPDATE seasonality_provider_profiles SET profile_json=? WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
        )
        .run(
          JSON.stringify(
            profile("EUR/USD", {
              annualCurve: [
                { week: 1, mean: null, p25: null, p75: null, note: SECRET },
              ],
            }),
          ),
        ),
    (db) =>
      db
        .prepare(
          "UPDATE seasonality_provider_profiles SET profile_json=? WHERE provider='eodhd' AND provider_symbol='EURUSD.FOREX'",
        )
        .run(
          JSON.stringify(
            profile("EUR/USD", {
              dataSourceUrl: `https://eodhd.com/api/eod?api_token=${SECRET}`,
            }),
          ),
        ),
    (db) =>
      db
        .prepare("UPDATE eodhd_events SET source_url=? WHERE id='current'")
        .run(`${RATE_SOURCE}?api_token=${SECRET}`),
    (db) =>
      db
        .prepare("UPDATE eodhd_events SET provider_type=? WHERE id='current'")
        .run(`token=${SECRET}`),
    (db) =>
      db
        .prepare(
          "UPDATE seasonality_provider_instruments SET description=? WHERE provider='eodhd'",
        )
        .run(`C:\\private\\${SECRET}`),
  ];
  for (const mutate of mutations) {
    const options = await fixture(t);
    modify(options.snapshotPath, mutate);
    await assert.rejects(
      exportPublicShards(options),
      (error) =>
        error instanceof PublicShardExportError &&
        !error.message.includes(SECRET),
    );
    await noManifest(options.outputDirectory);
  }
});

test("source views, generated selected columns and wrong declared types cannot stand in for public tables", async (t) => {
  for (const mutate of [
    (db) =>
      db.exec(
        "ALTER TABLE eodhd_events RENAME TO hidden_events; CREATE VIEW eodhd_events AS SELECT * FROM hidden_events",
      ),
    (db) =>
      db.exec(
        "ALTER TABLE eodhd_events RENAME COLUMN currency TO old_currency; ALTER TABLE eodhd_events ADD COLUMN currency TEXT GENERATED ALWAYS AS (old_currency) VIRTUAL",
      ),
    (db) =>
      db.exec(
        "ALTER TABLE seasonality_provider_daily_candles RENAME TO old_candles; CREATE TABLE seasonality_provider_daily_candles(provider TEXT,provider_symbol TEXT,candle_time TEXT,mid_close REAL)",
      ),
  ]) {
    const options = await fixture(t);
    modify(options.snapshotPath, mutate);
    await assert.rejects(exportPublicShards(options), {
      code: "SCHEMA_INVALID",
    });
    await noManifest(options.outputDirectory);
  }
});

test("row, JSON byte and finite-price limits reject exports instead of truncating", async (t) => {
  const tooMany = await fixture(t);
  modify(tooMany.snapshotPath, (db) =>
    db.exec(
      `WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<=${LIMITS.events}) INSERT INTO eodhd_events(id,currency,provider_type,released_at,actual_value,source_url,updated_at,canonical_key,mapping_status) SELECT 'bulk-'||x,'USD','Interest Rate Decision','2026-09-01T12:00:00Z','0','${RATE_SOURCE}','${NOW}','interest_rates','approved' FROM n`,
    ),
  );
  await assert.rejects(exportPublicShards(tooMany), { code: "LIMIT_EXCEEDED" });
  await noManifest(tooMany.outputDirectory);
  const huge = await fixture(t);
  modify(huge.snapshotPath, (db) =>
    db
      .prepare(
        "UPDATE seasonality_provider_profiles SET profile_json=? WHERE provider='eodhd'",
      )
      .run(" ".repeat(LIMITS.profileBytes + 1)),
  );
  await assert.rejects(exportPublicShards(huge), { code: "LIMIT_EXCEEDED" });
  const zero = await fixture(t);
  modify(zero.snapshotPath, (db) =>
    db.exec(
      "UPDATE seasonality_provider_daily_candles SET mid_close=0 WHERE provider='eodhd'",
    ),
  );
  await assert.rejects(exportPublicShards(zero), { code: "DATA_INVALID" });
  await noManifest(zero.outputDirectory);
});

test("closed-snapshot and disjoint new temporary-output requirements prevent in-place or repository writes", async (t) => {
  const options = await fixture(t);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    await writeFile(options.snapshotPath + suffix, "");
    await assert.rejects(exportPublicShards(options), {
      code: "SNAPSHOT_NOT_CLOSED",
    });
    await rm(options.snapshotPath + suffix);
  }
  const bytes = await readFile(options.snapshotPath);
  bytes[18] = 2;
  bytes[19] = 2;
  await writeFile(options.snapshotPath, bytes);
  await assert.rejects(exportPublicShards(options), {
    code: "SNAPSHOT_NOT_CLOSED",
  });
  bytes[18] = 1;
  bytes[19] = 1;
  await writeFile(options.snapshotPath, bytes);
  await assert.rejects(
    exportPublicShards({
      ...options,
      outputDirectory: path.dirname(options.snapshotPath),
    }),
    { code: "PATH_UNSAFE" },
  );
  await assert.rejects(
    exportPublicShards({
      ...options,
      outputDirectory: path.join(path.dirname(options.snapshotPath), "output"),
    }),
    { code: "PATH_UNSAFE" },
  );
  await assert.rejects(
    exportPublicShards({
      ...options,
      outputDirectory: fileURLToPath(
        new URL("./must-not-create", import.meta.url),
      ),
    }),
    { code: "PATH_UNSAFE" },
  );
  await mkdir(options.outputDirectory);
  await assert.rejects(exportPublicShards(options), { code: "OUTPUT_EXISTS" });
  assert.deepEqual(await readdir(options.outputDirectory), []);
});

test("symbol index alone works and content-addressed artifacts are deterministic across generations", async (t) => {
  const options = await fixture(t);
  const first = await exportPublicShards({ ...options, symbols: [] });
  const second = await exportPublicShards({
    ...options,
    symbols: [],
    outputDirectory: path.join(options.root, "second"),
  });
  assert.equal(first.artifacts.length, 2);
  assert.deepEqual(first.artifacts, second.artifacts);
  assert.notEqual(first.generation, second.generation);
});

test("directory aliases are refused before any artifact write", async (t) => {
  const options = await fixture(t);
  const alias = path.join(options.root, "input-alias");
  try {
    await symlink(path.dirname(options.snapshotPath), alias, "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code))
      return t.skip("Directory links unavailable");
    throw error;
  }
  await assert.rejects(
    exportPublicShards({
      ...options,
      snapshotPath: path.join(alias, path.basename(options.snapshotPath)),
    }),
    { code: "PATH_UNSAFE" },
  );
  await noManifest(options.outputDirectory);
});

test("CLI emits only bounded status and fixed error descriptions", async (t) => {
  const options = await fixture(t);
  modify(options.snapshotPath, (db) =>
    db
      .prepare("UPDATE eodhd_events SET source_url=? WHERE id='current'")
      .run(SECRET),
  );
  const script = fileURLToPath(
    new URL("./export-public-shards.mjs", import.meta.url),
  );
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      "--disable-warning=ExperimentalWarning",
      script,
      "--snapshot",
      options.snapshotPath,
      "--output",
      options.outputDirectory,
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, "");
      assert.ok(!error.stderr.includes(SECRET));
      assert.ok(!error.stderr.includes(options.snapshotPath));
      assert.equal(JSON.parse(error.stderr).code, "DATA_INVALID");
      return true;
    },
  );
  await noManifest(options.outputDirectory);
});
