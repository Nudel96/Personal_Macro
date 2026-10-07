import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  exportMacroShards,
  MACRO_SCHEMAS,
  MACRO_KEYS,
} from "./export-macro-shards.mjs";

async function fixture(t, change = () => {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "macro-source-test-"));
  const outputs = await mkdtemp(path.join(os.tmpdir(), "macro-output-test-"));
  t.after(async () => {
    for (const directory of [root, outputs]) {
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert.match(path.basename(resolved), /^macro-(source|output)-test-/);
      await rm(resolved, { recursive: true, force: true });
    }
  });
  const snapshotPath = path.join(root, "closed.sqlite"),
    outputDirectory = path.join(outputs, "export");
  const db = new DatabaseSync(snapshotPath);
  const seen = new Set();
  for (const spec of Object.values(MACRO_SCHEMAS))
    for (const [table, definition] of Object.entries(spec.tables)) {
      if (!seen.has(table)) {
        db.exec(definition.ddl);
        seen.add(table);
      }
    }
  function insert(table, values) {
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
    const row = columns.map((c) =>
      Object.hasOwn(values, c.name)
        ? values[c.name]
        : c.type === "TEXT"
          ? ""
          : 0,
    );
    db.prepare(
      `INSERT INTO "${table}" VALUES(${columns.map(() => "?").join(",")})`,
    ).run(...row);
  }
  insert("eodhd_fundamental_snapshots", {
    id: "snapshot",
    built_at: "2026-09-25T10:00:00Z",
  });
  insert("eodhd_events", {
    id: "event",
    country: "US",
    currency: "USD",
    canonical_key: "cpi_yoy",
    provider_type: "Inflation Rate",
    released_at: "2026-09-25T10:00:00Z",
    actual_value: "3.1",
    forecast_value: "2.9",
    previous_value: "3.0",
    source_url: "https://eodhd.com/api/economic-events",
    mapping_status: "approved",
  });
  insert("eodhd_fundamental_evaluations", {
    snapshot_id: "snapshot",
    currency: "USD",
    canonical_key: "cpi_yoy",
    source_url: "https://eodhd.com/api/economic-events",
    reason_codes_json: "[]",
    score: 1,
    evaluation_status: "scored",
  });
  insert("cot_contracts", {
    id: "cot-eur",
    symbol: "EUR",
    display_name: "Euro",
    currency: "EUR",
    is_active: 1,
  });
  insert("cot_legacy_observations", {
    contract_id: "cot-eur",
    report_date: "2026-09-15",
    long_positions: 200,
    short_positions: 100,
    open_interest: 1000,
    net_positions: 100,
    long_share: "0.6667",
    short_share: "0.3333",
    net_position_pct_oi: "0.1",
    net_change_pct_oi: "0.01",
    commercial_long: 200,
    commercial_short: 350,
    nonreportable_long: 50,
    nonreportable_short: 0,
  });
  insert("seasonality_provider_instruments", {
    provider: "eodhd",
    provider_symbol: "AUDUSD.FOREX",
    source_code: "AUDUSD.FOREX",
    display_symbol: "AUD/USD",
    category: "Forex",
    base_currency: "AUD",
    quote_currency: "USD",
  });
  insert("seasonality_provider_profiles", {
    provider: "eodhd",
    provider_symbol: "AUDUSD.FOREX",
    profile_json: JSON.stringify({
      calculatedAt: "2026-09-25T10:00:00Z",
      qualityStatus: "available",
      completeYears: 20,
      forwardReturns: [
        {
          tradingDays: 20,
          samples: 20,
          averageReturn: 1,
          medianReturn: 1,
          positiveRatio: 0.6,
        },
      ],
      privateUnexpected: "must-not-copy",
    }),
  });
  insert("seasonality_provider_daily_candles", {
    provider: "eodhd",
    provider_symbol: "AUDUSD.FOREX",
    candle_time: 1700000000000,
    bid_open: 0.6,
    bid_high: 0.7,
    bid_low: 0.5,
    bid_close: 0.65,
    volume: 1,
  });
  db.exec(
    "CREATE TABLE personal_secrets(token TEXT);INSERT INTO personal_secrets VALUES('must-not-copy')",
  );
  change(db);
  db.close();
  return { snapshotPath, outputDirectory };
}

test("exports isolated exact schemas and preserves source while stripping nonpublic payload fields", async (t) => {
  const options = await fixture(t),
    before = await readFile(options.snapshotPath);
  const manifest = await exportMacroShards(options);
  assert.equal(manifest.artifacts.length, 4);
  assert.deepEqual(await readFile(options.snapshotPath), before);
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.key, MACRO_KEYS[artifact.kind]);
    const bytes = await readFile(
      path.join(options.outputDirectory, artifact.fileName),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      artifact.sha256,
    );
    assert.equal(bytes.length, artifact.sizeBytes);
    assert.equal(bytes.includes("must-not-copy"), false);
    const db = new DatabaseSync(
      path.join(options.outputDirectory, artifact.fileName),
      { readOnly: true },
    );
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    assert.deepEqual(
      tables,
      Object.keys(MACRO_SCHEMAS[artifact.kind].tables).sort(),
    );
    assert.equal(tables.includes("personal_secrets"), false);
    db.close();
  }
});
test("rejects source URLs carrying credentials and returns only fixed error text", async (t) => {
  const options = await fixture(t, (db) =>
    db.exec(
      "UPDATE eodhd_events SET source_url='https://eodhd.com/api/economic-events?api_token=secret-sentinel'",
    ),
  );
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "DATA_INVALID" && !e.message.includes("sentinel"),
  );
});

test("technical exports include only the two USD spot metals and retain their own profiles", async (t) => {
  const options = await fixture(t, (db) => {
    const source = db
      .prepare(
        "SELECT * FROM seasonality_provider_instruments WHERE provider_symbol='AUDUSD.FOREX'",
      )
      .get();
    const columns = Object.keys(source);
    const insert = db.prepare(
      `INSERT INTO seasonality_provider_instruments(${columns.map((name) => `"${name}"`).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    );
    for (const base of ["XAU", "XAG", "XPT"]) {
      const metal = {
        ...source,
        provider_symbol: `${base}USD.FOREX`,
        source_code: `${base}USD.FOREX`,
        display_symbol: `${base}/USD`,
        base_currency: base,
        category: "Commodities",
      };
      insert.run(...columns.map((name) => metal[name]));
      db.prepare(
        "INSERT INTO seasonality_provider_profiles SELECT provider,?,profile_json FROM seasonality_provider_profiles WHERE provider_symbol='AUDUSD.FOREX'",
      ).run(metal.provider_symbol);
    }
  });
  const manifest = await exportMacroShards(options);
  const technicals = manifest.artifacts.find(
    (artifact) => artifact.kind === "technicals",
  );
  const db = new DatabaseSync(
    path.join(options.outputDirectory, technicals.fileName),
    { readOnly: true },
  );
  try {
    assert.deepEqual(
      db
        .prepare(
          "SELECT provider_symbol FROM seasonality_provider_instruments ORDER BY provider_symbol",
        )
        .all()
        .map((row) => row.provider_symbol),
      ["AUDUSD.FOREX", "XAGUSD.FOREX", "XAUUSD.FOREX"],
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM seasonality_provider_profiles WHERE provider_symbol IN ('XAUUSD.FOREX','XAGUSD.FOREX')",
        )
        .get().total,
      2,
    );
  } finally {
    db.close();
  }
});
test("rejects an active WAL snapshot", async (t) => {
  const options = await fixture(t);
  await writeFile(options.snapshotPath + "-wal", "pending");
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "SNAPSHOT_NOT_CLOSED",
  );
});
test("does not overwrite an existing export directory", async (t) => {
  const options = await fixture(t);
  await exportMacroShards(options);
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "PATH_UNSAFE",
  );
});
test("rejects substituted source views instead of executing their projection", async (t) => {
  const options = await fixture(t, (db) =>
    db.exec(
      "DROP TABLE eodhd_mapping_candidates;CREATE VIEW eodhd_mapping_candidates AS SELECT token AS id FROM personal_secrets",
    ),
  );
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "SCHEMA_INVALID",
  );
});
test("rejects arbitrary metadata in evaluation reason codes", async (t) => {
  const options = await fixture(t, (db) =>
    db
      .prepare("UPDATE eodhd_fundamental_evaluations SET reason_codes_json=?")
      .run(JSON.stringify(["https://private.example/?token=secret"])),
  );
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "DATA_INVALID",
  );
});
test("rejects invalid OHLC without silently substituting close prices", async (t) => {
  const options = await fixture(t, (db) =>
    db.exec("UPDATE seasonality_provider_daily_candles SET bid_high=0.4"),
  );
  await assert.rejects(
    () => exportMacroShards(options),
    (e) => e.code === "DATA_INVALID",
  );
});

test("rejects incomplete or out-of-range COT participant pairs", async (t) => {
  for (const sql of [
    "UPDATE cot_legacy_observations SET commercial_long=NULL",
    "UPDATE cot_legacy_observations SET commercial_short=1001",
    "UPDATE cot_legacy_observations SET nonreportable_long=-1",
  ]) {
    const options = await fixture(t, (db) => db.exec(sql));
    await assert.rejects(
      () => exportMacroShards(options),
      (error) => error.code === "DATA_INVALID",
    );
  }
});
test("never includes unselected providers in technical or regime packages", async (t) => {
  const options = await fixture(t, (db) =>
    db.exec(
      "INSERT INTO seasonality_provider_instruments VALUES('private','PERSONAL','PERSONAL','Private','Forex','AUD','USD',1)",
    ),
  );
  const manifest = await exportMacroShards(options);
  for (const artifact of manifest.artifacts.filter(
    (a) => a.kind === "technicals" || a.kind === "regime",
  )) {
    const db = new DatabaseSync(
      path.join(options.outputDirectory, artifact.fileName),
      { readOnly: true },
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT DISTINCT provider FROM seasonality_provider_instruments",
        )
        .all()
        .map((r) => r.provider),
      ["eodhd"],
    );
    db.close();
  }
});
