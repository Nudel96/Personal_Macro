import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  LIMITS,
  PublicShardUploadError,
  runUpload,
  validateManifest,
  validateTransferSize,
} from "./upload-public-shards.mjs";

const MIB = 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const TOKEN = "vercel_blob_rw_fixture_only_not_a_secret";
const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
const SQL = {
  eodhd_events: `CREATE TABLE eodhd_events (
    currency TEXT, provider_type TEXT, released_at TEXT, actual_value TEXT,
    forecast_value TEXT, source_url TEXT, updated_at TEXT, canonical_key TEXT,
    mapping_status TEXT) STRICT`,
  eodhd_sync_runs: `CREATE TABLE eodhd_sync_runs (
    started_at TEXT, completed_at TEXT, status TEXT, error_message TEXT) STRICT`,
  seasonality_provider_instruments: `CREATE TABLE seasonality_provider_instruments (
    provider TEXT, provider_symbol TEXT, display_symbol TEXT, category TEXT,
    description TEXT, base_currency TEXT, quote_currency TEXT, native_timezone TEXT,
    PRIMARY KEY(provider,provider_symbol)) STRICT`,
  seasonality_provider_profiles: `CREATE TABLE seasonality_provider_profiles (
    provider TEXT, provider_symbol TEXT, calculated_at TEXT, complete_years INTEGER,
    quality_status TEXT, missing_days INTEGER, profile_json TEXT,
    PRIMARY KEY(provider,provider_symbol)) STRICT`,
  seasonality_provider_sync_runs: `CREATE TABLE seasonality_provider_sync_runs (
    provider TEXT, started_at TEXT, completed_at TEXT, status TEXT, error_message TEXT) STRICT`,
  seasonality_provider_daily_candles: `CREATE TABLE seasonality_provider_daily_candles (
    provider TEXT, provider_symbol TEXT, candle_time INTEGER, mid_close REAL,
    PRIMARY KEY(provider,provider_symbol,candle_time)) STRICT`,
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

async function fixture(t, kinds = ["rates"]) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "macro-public-shard-test-"),
  );
  t.after(async () => {
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith("macro-public-shard-test-"));
    await rm(target, { recursive: true, force: true });
  });
  const directory = path.join(root, "export");
  await mkdir(directory);
  const activeWorkspace = path.join(root, "ActiveWorkspace");
  await mkdir(activeWorkspace);
  const artifacts = [],
    originals = [];
  for (const [index, kind] of kinds.entries()) {
    const target = path.join(directory, `seed-${index}.sqlite`);
    const db = new DatabaseSync(target);
    let rows;
    const symbol = `TEST${index}.FOREX`;
    try {
      for (const table of TABLES[kind]) db.exec(SQL[table]);
      if (kind === "rates") {
        db.prepare(
          "INSERT INTO eodhd_events(currency,actual_value) VALUES (?,?)",
        ).run("USD", "5.25");
      } else {
        db.prepare(
          "INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol) VALUES (?,?,?)",
        ).run("eodhd", symbol, `DISPLAY${index}`);
        db.prepare(
          "INSERT INTO seasonality_provider_profiles(provider,provider_symbol,complete_years) VALUES (?,?,?)",
        ).run("eodhd", symbol, 5);
        if (kind === "seasonality-symbol")
          db.prepare(
            "INSERT INTO seasonality_provider_daily_candles VALUES (?,?,?,?)",
          ).run("eodhd", symbol, 1000, 1.25);
      }
      rows = TABLES[kind].reduce(
        (sum, table) =>
          sum +
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        0,
      );
    } finally {
      db.close();
    }
    const bytes = await readFile(target),
      sha256 = digest(bytes);
    const fileName = `${sha256}.sqlite`;
    await rename(target, path.join(directory, fileName));
    artifacts.push({
      kind,
      key:
        kind === "rates"
          ? "eodhd:policy-rates"
          : kind === "seasonality-index"
            ? "eodhd:seasonality"
            : `eodhd:${symbol}`,
      sha256,
      sizeBytes: bytes.length,
      rows,
      fileName,
      format: "sqlite",
      schemaVersion: 1,
    });
    originals.push(bytes);
  }
  const manifest = {
    schemaVersion: 1,
    generation: randomUUID(),
    createdAt: "2026-09-24T12:00:00.000Z",
    artifacts,
  };
  const options = {
    manifestPath: path.join(directory, "manifest.json"),
    envFile: path.join(root, "blob.env"),
    output: path.join(root, "descriptor.json"),
  };
  await writeFile(options.manifestPath, JSON.stringify(manifest));
  await writeFile(
    options.envFile,
    `BLOB_READ_WRITE_TOKEN=${TOKEN}\nUNRELATED_VALUE=must_not_be_passed\n`,
  );
  const state = {
    root,
    directory,
    activeWorkspace,
    manifest,
    options,
    originals,
  };
  state.saveManifest = async () =>
    writeFile(options.manifestPath, JSON.stringify(manifest));
  state.rewrite = async (index, mutate) => {
    const artifact = manifest.artifacts[index],
      target = path.join(directory, artifact.fileName);
    await mutate(target);
    const bytes = await readFile(target),
      sha256 = digest(bytes),
      filename = `${sha256}.sqlite`;
    await rename(target, path.join(directory, filename));
    Object.assign(artifact, {
      sha256,
      fileName: filename,
      sizeBytes: bytes.length,
    });
    originals[index] = bytes;
    await state.saveManifest();
  };
  return state;
}

function memoryBlob(settings = {}) {
  const objects = new Map(),
    calls = { get: [], put: [] };
  return {
    objects,
    calls,
    async get(pathname, options) {
      calls.get.push({ pathname, options });
      assert.equal(options.token, TOKEN);
      assert.equal(options.access, "private");
      assert.equal(
        options.useCache,
        false,
        "negative cache must never hide a newly uploaded object",
      );
      assert.ok(options.abortSignal instanceof globalThis.AbortSignal);
      assert.deepEqual(Object.keys(options).sort(), [
        "abortSignal",
        "access",
        "token",
        "useCache",
      ]);
      if (settings.get) return settings.get(pathname, options, objects, calls);
      return response(pathname, objects.get(pathname));
    },
    async put(pathname, bytes, options) {
      calls.put.push({ pathname, bytes: Buffer.from(bytes), options });
      assert.equal(options.token, TOKEN);
      assert.equal(options.access, "private");
      assert.equal(options.contentType, "application/gzip");
      assert.equal(options.allowOverwrite, false);
      assert.equal(options.addRandomSuffix, false);
      assert.deepEqual(Object.keys(options).sort(), [
        "abortSignal",
        "access",
        "addRandomSuffix",
        "allowOverwrite",
        "contentType",
        "token",
      ]);
      if (settings.put)
        return settings.put(pathname, bytes, options, objects, calls);
      assert.ok(!objects.has(pathname));
      objects.set(pathname, Buffer.from(bytes));
      return { pathname, contentType: "application/gzip" };
    },
  };
}
function response(pathname, bytes, overrides = {}) {
  if (!bytes) return null;
  return {
    statusCode: 200,
    blob: { pathname, size: bytes.length, contentType: "application/gzip" },
    stream: new globalThis.ReadableStream({
      start(controller) {
        const mid = Math.floor(bytes.length / 2);
        controller.enqueue(bytes.subarray(0, mid));
        controller.enqueue(bytes.subarray(mid));
        controller.close();
      },
    }),
    ...overrides,
  };
}
const upload = (f, blob, options = f.options, extra = {}) =>
  runUpload(options, { blob, activeWorkspace: f.activeWorkspace, ...extra });
const readDescriptor = async (f) =>
  JSON.parse(await readFile(f.options.output, "utf8"));
async function absent(target) {
  await assert.rejects(lstat(target), { code: "ENOENT" });
}
async function noStage(f) {
  assert.deepEqual(
    (await readdir(f.root)).filter((name) =>
      name.startsWith(".macro-public-upload-"),
    ),
    [],
  );
}
async function rejectsBeforeUpload(f, code) {
  const blob = memoryBlob();
  await assert.rejects(
    upload(f, blob),
    code ? { code } : PublicShardUploadError,
  );
  assert.equal(blob.calls.get.length, 0);
  assert.equal(blob.calls.put.length, 0);
  await absent(f.options.output);
  await noStage(f);
}

test("uploads all three exact schemas privately and proves original bytes before completing", async (t) => {
  const f = await fixture(t, [
      "rates",
      "seasonality-index",
      "seasonality-symbol",
    ]),
    blob = memoryBlob();
  const result = await upload(f, blob),
    document = await readDescriptor(f);
  assert.deepEqual(Object.keys(document), [
    "version",
    "complete",
    "manifest",
    "transports",
  ]);
  assert.equal(document.version, 1);
  assert.equal(document.complete, true);
  assert.deepEqual(document.manifest, f.manifest);
  assert.equal(document.transports.length, 3);
  assert.equal(blob.calls.put.length, 3);
  assert.equal(blob.calls.get.length, 6);
  let total = 0;
  for (const [index, transport] of document.transports.entries()) {
    const artifact = f.manifest.artifacts[index],
      pathname = `public-cache/v1/${f.manifest.generation}/${artifact.fileName}.gz`;
    const bytes = blob.objects.get(pathname);
    assert.deepEqual(Object.keys(transport), [
      "kind",
      "key",
      "encoding",
      "transferBytes",
      "transferSha256",
    ]);
    assert.deepEqual(transport, {
      kind: artifact.kind,
      key: artifact.key,
      encoding: "gzip",
      transferBytes: bytes.length,
      transferSha256: digest(bytes),
    });
    assert.ok(gunzipSync(bytes).equals(f.originals[index]));
    assert.ok(
      (await readFile(path.join(f.directory, artifact.fileName))).equals(
        f.originals[index],
      ),
    );
    total += bytes.length;
  }
  assert.deepEqual(result, {
    status: "complete",
    artifacts: 3,
    rawBytes: f.originals.reduce((sum, bytes) => sum + bytes.length, 0),
    transferBytes: total,
  });
  assert.ok(!JSON.stringify(document).includes(TOKEN));
  assert.ok(!JSON.stringify(document).includes(f.directory));
  if (process.platform !== "win32")
    assert.equal((await lstat(f.options.output)).mode & 0o777, 0o600);
  await noStage(f);
});

test("existing identical objects are read twice without any repeated put", async (t) => {
  const f = await fixture(t),
    blob = memoryBlob();
  await upload(f, blob);
  const before = await readDescriptor(f);
  await upload(f, blob, {
    ...f.options,
    output: path.join(f.root, "second.json"),
  });
  assert.equal(blob.calls.put.length, 1);
  assert.equal(blob.calls.get.length, 4);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(f.root, "second.json"), "utf8")),
    before,
  );
});

test("an uncertain put succeeds only after two exact uncached readbacks without retrying put", async (t) => {
  const f = await fixture(t),
    blob = memoryBlob({
      put(pathname, bytes, _options, objects) {
        objects.set(pathname, Buffer.from(bytes));
        throw new Error("simulated lost response with private details");
      },
    });
  await upload(f, blob);
  assert.equal(blob.calls.put.length, 1);
  assert.equal(blob.calls.get.length, 3);
  assert.equal((await readDescriptor(f)).complete, true);
});

test("partial upload retains only verified progress and never deletes uploaded objects", async (t) => {
  const f = await fixture(t, ["rates", "seasonality-index"]),
    blob = memoryBlob({
      put(pathname, bytes, _options, objects, calls) {
        if (calls.put.length === 2) throw new Error(`${TOKEN} private failure`);
        objects.set(pathname, Buffer.from(bytes));
        return { pathname, contentType: "application/gzip" };
      },
    });
  await assert.rejects(upload(f, blob), { code: "UPLOAD_FAILED" });
  const document = await readDescriptor(f);
  assert.equal(document.complete, false);
  assert.equal(document.transports.length, 1);
  assert.deepEqual(document.manifest, f.manifest);
  assert.equal(blob.objects.size, 1);
  assert.equal(blob.calls.put.length, 2);
  await noStage(f);
});

test("corruption after put leaves an incomplete descriptor without a transport", async (t) => {
  const f = await fixture(t),
    blob = memoryBlob({
      put(pathname, bytes, _options, objects) {
        const corrupt = Buffer.from(bytes);
        corrupt[corrupt.length - 1] ^= 1;
        objects.set(pathname, corrupt);
        return { pathname, contentType: "application/gzip" };
      },
    });
  await assert.rejects(upload(f, blob), { code: "REMOTE_INTEGRITY" });
  assert.equal(blob.objects.size, 1);
  assert.deepEqual((await readDescriptor(f)).transports, []);
  assert.equal((await readDescriptor(f)).complete, false);
});

for (const variant of [
  "content",
  "size",
  "pathname",
  "contentType",
  "status",
  "short",
  "extra",
  "missing-after-put",
]) {
  test(`rejects remote ${variant} and never overwrites a conflicting object`, async (t) => {
    const f = await fixture(t),
      artifact = f.manifest.artifacts[0];
    const pathname = `public-cache/v1/${f.manifest.generation}/${artifact.fileName}.gz`;
    const compressed = gzipSync(f.originals[0], { level: 9 });
    const blob = memoryBlob({
      get(name, _options, objects) {
        if (variant === "missing-after-put") return null;
        const bytes = objects.get(name);
        const result = response(name, bytes);
        if (variant === "size") result.blob.size++;
        if (variant === "pathname") result.blob.pathname += "-wrong";
        if (variant === "contentType") result.blob.contentType = "text/plain";
        if (variant === "status") result.statusCode = 304;
        if (variant === "short" || variant === "extra") {
          result.stream = response(
            name,
            variant === "short"
              ? bytes.subarray(0, -1)
              : Buffer.concat([bytes, Buffer.from([0])]),
          ).stream;
        }
        return result;
      },
    });
    if (variant !== "missing-after-put") {
      const bytes = Buffer.from(compressed);
      if (variant === "content") bytes[10] ^= 1;
      blob.objects.set(pathname, bytes);
    }
    await assert.rejects(upload(f, blob), { code: "REMOTE_INTEGRITY" });
    assert.equal(
      blob.calls.put.length,
      variant === "missing-after-put" ? 1 : 0,
    );
    assert.equal((await readDescriptor(f)).complete, false);
    assert.equal((await readDescriptor(f)).transports.length, 0);
  });
}

test("all files preflight before any cloud call, including a later hash mismatch", async (t) => {
  const f = await fixture(t, ["rates", "seasonality-index"]);
  const target = path.join(f.directory, f.manifest.artifacts[1].fileName),
    bytes = await readFile(target);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(target, bytes);
  await rejectsBeforeUpload(f, "SHARD_INVALID");
});

for (const sidecar of ["-wal", "-shm", "-journal"]) {
  test(`rejects an exported shard with ${sidecar} companion`, async (t) => {
    const f = await fixture(t);
    await writeFile(
      path.join(f.directory, f.manifest.artifacts[0].fileName) + sidecar,
      "fixture",
    );
    await rejectsBeforeUpload(f, "SQLITE_NOT_CLOSED");
  });
}

for (const kind of ["signature", "wal-mode", "size", "rows"]) {
  test(`rejects ${kind} mismatch before any upload`, async (t) => {
    const f = await fixture(t);
    if (kind === "signature" || kind === "wal-mode") {
      await f.rewrite(0, async (target) => {
        const bytes = await readFile(target);
        bytes[kind === "signature" ? 0 : 18] = 2;
        await writeFile(target, bytes);
      });
    } else {
      f.manifest.artifacts[0][kind === "size" ? "sizeBytes" : "rows"]++;
      await f.saveManifest();
    }
    await rejectsBeforeUpload(
      f,
      kind === "wal-mode"
        ? "SQLITE_NOT_CLOSED"
        : kind === "size"
          ? "LIMIT_EXCEEDED"
          : "SHARD_INVALID",
    );
  });
}

for (const mutation of [
  "extra-table",
  "view",
  "trigger",
  "extra-index",
  "generated-column",
  "non-strict",
  "wrong-column-type",
  "wrong-column-order",
]) {
  test(`rejects ${mutation} in the purported public schema`, async (t) => {
    const f = await fixture(t);
    await f.rewrite(0, async (target) => {
      const db = new DatabaseSync(target);
      try {
        if (mutation === "extra-table")
          db.exec("CREATE TABLE private_journal(secret TEXT) STRICT");
        if (mutation === "view")
          db.exec("CREATE VIEW hidden AS SELECT * FROM eodhd_events");
        if (mutation === "trigger")
          db.exec(
            "CREATE TRIGGER hidden AFTER INSERT ON eodhd_events BEGIN SELECT 1; END",
          );
        if (mutation === "extra-index")
          db.exec("CREATE INDEX hidden ON eodhd_events(currency)");
        if (mutation === "generated-column")
          db.exec(
            "ALTER TABLE eodhd_events ADD COLUMN hidden TEXT GENERATED ALWAYS AS (currency) VIRTUAL",
          );
        if (
          ["non-strict", "wrong-column-type", "wrong-column-order"].includes(
            mutation,
          )
        ) {
          db.exec("DROP TABLE eodhd_sync_runs");
          let sql = SQL.eodhd_sync_runs;
          if (mutation === "non-strict") sql = sql.replace(" STRICT", "");
          if (mutation === "wrong-column-type")
            sql = sql.replace("started_at TEXT", "started_at INTEGER");
          if (mutation === "wrong-column-order")
            sql = sql.replace(
              "started_at TEXT, completed_at TEXT",
              "completed_at TEXT, started_at TEXT",
            );
          db.exec(sql);
        }
      } finally {
        db.close();
      }
    });
    await rejectsBeforeUpload(f, "SHARD_INVALID");
  });
}

for (const column of ["provider", "provider_symbol"]) {
  test(`symbol shard rejects inconsistent ${column}`, async (t) => {
    const f = await fixture(t, ["seasonality-symbol"]);
    await f.rewrite(0, async (target) => {
      const db = new DatabaseSync(target);
      try {
        db.exec(`UPDATE seasonality_provider_profiles SET ${column}='wrong'`);
      } finally {
        db.close();
      }
    });
    await rejectsBeforeUpload(f, "SHARD_INVALID");
  });
}

test("additional UNIQUE constraint is rejected even with identical columns", async (t) => {
  const f = await fixture(t);
  await f.rewrite(0, async (target) => {
    const db = new DatabaseSync(target);
    try {
      db.exec("DROP TABLE eodhd_sync_runs");
      db.exec(
        SQL.eodhd_sync_runs.replace(
          "started_at TEXT",
          "started_at TEXT UNIQUE",
        ),
      );
    } finally {
      db.close();
    }
  });
  await rejectsBeforeUpload(f, "SHARD_INVALID");
});

for (const change of [
  "index-provider",
  "orphan-profile",
  "ambiguous-alias",
  "excess-sync-rows",
  "empty-candles",
  "altered-primary-key",
]) {
  test(`loader alignment rejects ${change}`, async (t) => {
    const kind = ["empty-candles", "altered-primary-key"].includes(change)
      ? "seasonality-symbol"
      : "seasonality-index";
    const f = await fixture(t, [kind]);
    await f.rewrite(0, async (target) => {
      const db = new DatabaseSync(target);
      try {
        if (change === "index-provider")
          db.exec(
            "UPDATE seasonality_provider_profiles SET provider='untrusted'",
          );
        if (change === "orphan-profile")
          db.exec(
            "UPDATE seasonality_provider_profiles SET provider_symbol='ORPHAN'",
          );
        if (change === "ambiguous-alias")
          db.exec(
            "INSERT INTO seasonality_provider_instruments(provider,provider_symbol,display_symbol) VALUES ('eodhd','OTHER','display0')",
          );
        if (change === "excess-sync-rows")
          db.exec(
            "INSERT INTO seasonality_provider_sync_runs(provider) VALUES ('eodhd'),('eodhd'),('eodhd')",
          );
        if (change === "empty-candles")
          db.exec("DELETE FROM seasonality_provider_daily_candles");
        if (change === "altered-primary-key") {
          db.exec("DROP TABLE seasonality_provider_daily_candles");
          db.exec(
            SQL.seasonality_provider_daily_candles.replace(
              "PRIMARY KEY(provider,provider_symbol,candle_time)",
              "PRIMARY KEY(provider_symbol,provider,candle_time)",
            ),
          );
          db.exec(
            "INSERT INTO seasonality_provider_daily_candles VALUES ('eodhd','TEST0.FOREX',1000,1.25)",
          );
        }
        f.manifest.artifacts[0].rows = TABLES[kind].reduce(
          (sum, table) =>
            sum +
            db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
          0,
        );
      } finally {
        db.close();
      }
    });
    await rejectsBeforeUpload(f, "SHARD_INVALID");
  });
}

test("file hardlinks are rejected before reading shard content", async (t) => {
  const f = await fixture(t);
  await link(
    path.join(f.directory, f.manifest.artifacts[0].fileName),
    path.join(f.root, "alias.sqlite"),
  );
  await rejectsBeforeUpload(f, "PATH_UNSAFE");
});

for (const location of ["manifest-parent", "output-parent"]) {
  test(`rejects ${location} junction or symbolic link`, async (t) => {
    const f = await fixture(t),
      alias = path.join(f.root, "linked");
    await symlink(
      f.directory,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    if (location === "manifest-parent")
      f.options.manifestPath = path.join(alias, "manifest.json");
    else f.options.output = path.join(alias, "descriptor.json");
    await rejectsBeforeUpload(f, "PATH_UNSAFE");
  });
}

test("rejects shard symbolic link when the platform permits creating one", async (t) => {
  const f = await fixture(t),
    target = path.join(f.directory, f.manifest.artifacts[0].fileName),
    actual = path.join(f.root, "actual.sqlite");
  await rename(target, actual);
  try {
    await symlink(actual, target, "file");
  } catch (error) {
    if (error.code === "EPERM")
      return t.skip(
        "File symlink permission unavailable; junction and hardlink checks run separately.",
      );
    throw error;
  }
  await rejectsBeforeUpload(f, "PATH_UNSAFE");
});

test("existing output is retained byte for byte without any cloud call", async (t) => {
  const f = await fixture(t),
    blob = memoryBlob(),
    original = Buffer.from("keep this private descriptor");
  await writeFile(f.options.output, original);
  await assert.rejects(upload(f, blob), { code: "OUTPUT_EXISTS" });
  assert.ok((await readFile(f.options.output)).equals(original));
  assert.equal(blob.calls.get.length, 0);
  assert.equal(blob.calls.put.length, 0);
});

for (const location of ["repository", "active-workspace", "active-backups"]) {
  test(`rejects descriptor output in ${location}`, async (t) => {
    const f = await fixture(t);
    const directory =
      location === "repository"
        ? REPOSITORY
        : location === "active-workspace"
          ? f.activeWorkspace
          : path.join(f.activeWorkspace, "backups");
    if (location === "active-backups") await mkdir(directory);
    f.options.output = path.join(
      directory,
      `forbidden-test-${randomUUID()}.json`,
    );
    await rejectsBeforeUpload(f, "PATH_UNSAFE");
  });
}

test("manifest must be explicitly named manifest.json outside the repository", async (t) => {
  const f = await fixture(t);
  for (const manifestPath of [
    path.join(f.directory, "renamed.json"),
    path.join(REPOSITORY, "manifest.json"),
  ]) {
    const blob = memoryBlob();
    await assert.rejects(upload(f, blob, { ...f.options, manifestPath }), {
      code: "PATH_UNSAFE",
    });
    assert.equal(blob.calls.get.length, 0);
  }
});

test("relative and alternate-stream argument paths are rejected", async (t) => {
  const f = await fixture(t);
  for (const argument of ["manifestPath", "envFile", "output"]) {
    await assert.rejects(
      upload(f, memoryBlob(), { ...f.options, [argument]: "relative" }),
      { code: "ARGUMENTS_INVALID" },
    );
  }
  if (process.platform === "win32")
    await assert.rejects(
      upload(f, memoryBlob(), {
        ...f.options,
        output: `${f.options.output}:stream`,
      }),
      { code: "ARGUMENTS_INVALID" },
    );
});

for (const content of [
  "OTHER=value",
  "BLOB_READ_WRITE_TOKEN=",
  'BLOB_READ_WRITE_TOKEN="has\\ncontrol"',
  Buffer.from([0xff]),
]) {
  test(`invalid environment configuration is rejected (${typeof content === "string" ? content.split("=")[0] : "invalid UTF-8"})`, async (t) => {
    const f = await fixture(t);
    await writeFile(f.options.envFile, content);
    await rejectsBeforeUpload(f, "ENV_INVALID");
  });
}

test("duplicate decoded JSON keys are rejected instead of accepting last-write wins", async (t) => {
  const f = await fixture(t),
    original = JSON.stringify(f.manifest);
  for (const source of [
    original.replace(
      '{"schemaVersion":1,',
      '{"schemaVersion":1,"schemaVersion":1,',
    ),
    original.replace(
      '{"schemaVersion":1,',
      '{"schemaVersion":1,"schema\\u0056ersion":1,',
    ),
    original.replace(
      '"format":"sqlite"',
      '"format":"sqlite","format":"sqlite"',
    ),
  ]) {
    await writeFile(f.options.manifestPath, source);
    await rejectsBeforeUpload(f, "MANIFEST_INVALID");
  }
});

test("malformed and non UTF-8 JSON fail before any cloud call", async (t) => {
  const f = await fixture(t);
  for (const source of [
    '{"x":',
    "[]",
    Buffer.from([0xff]),
    JSON.stringify(f.manifest) + " trailing",
  ]) {
    await writeFile(f.options.manifestPath, source);
    await rejectsBeforeUpload(f, "MANIFEST_INVALID");
  }
});

function plainManifest() {
  return {
    schemaVersion: 1,
    generation: "12345678-1234-4234-8234-123456789abc",
    createdAt: "2026-09-24T12:00:00Z",
    artifacts: [plainArtifact(1)],
  };
}
function plainArtifact(index, sizeBytes = 512) {
  const sha256 = index.toString(16).padStart(64, "0");
  return {
    kind: "seasonality-symbol",
    key: `eodhd:TEST${index}.FOREX`,
    sha256,
    sizeBytes,
    rows: 0,
    fileName: `${sha256}.sqlite`,
    format: "sqlite",
    schemaVersion: 1,
  };
}
for (const [label, mutate] of [
  ["unknown manifest field", (m) => (m.extra = 1)],
  [
    "unknown artifact field",
    (m) => (m.artifacts[0].url = "https://untrusted.invalid/data.sqlite"),
  ],
  [
    "generation not v4",
    (m) => (m.generation = m.generation.replace("-4234-", "-1234-")),
  ],
  [
    "generation wrong variant",
    (m) => (m.generation = m.generation.replace("-8234-", "-7234-")),
  ],
  ["generation uppercase", (m) => (m.generation = m.generation.toUpperCase())],
  ["generation newline", (m) => (m.generation += "\n")],
  ["non UTC timestamp", (m) => (m.createdAt = "2026-09-24T12:00:00+02:00")],
  ["invalid calendar day", (m) => (m.createdAt = "2026-02-30T12:00:00Z")],
  ["unsupported kind", (m) => (m.artifacts[0].kind = "journal")],
  ["wrong fixed key", (m) => (m.artifacts[0].kind = "rates")],
  ["symbol traversal", (m) => (m.artifacts[0].key = "eodhd:../private")],
  ["symbol newline", (m) => (m.artifacts[0].key = "eodhd:TEST\n")],
  ["symbol too long", (m) => (m.artifacts[0].key = `eodhd:${"A".repeat(97)}`)],
  [
    "filename traversal",
    (m) => (m.artifacts[0].fileName = `../${m.artifacts[0].fileName}`),
  ],
  [
    "filename backslash",
    (m) => (m.artifacts[0].fileName = `sub\\${m.artifacts[0].fileName}`),
  ],
  [
    "filename URL",
    (m) => (m.artifacts[0].fileName = "https://untrusted.invalid/data.sqlite"),
  ],
  ["uppercase hash", (m) => (m.artifacts[0].sha256 = "A".repeat(64))],
  ["unsupported format", (m) => (m.artifacts[0].format = "json")],
  ["unsupported artifact schema", (m) => (m.artifacts[0].schemaVersion = 2)],
  ["unsupported manifest schema", (m) => (m.schemaVersion = 2)],
  [
    "duplicate identity",
    (m) => {
      m.artifacts.push(plainArtifact(2));
      m.artifacts[1].key = m.artifacts[0].key;
    },
  ],
  [
    "hashfile alias",
    (m) => {
      m.artifacts.push({ ...m.artifacts[0], key: "eodhd:ANOTHER" });
    },
  ],
  ["empty list", (m) => (m.artifacts = [])],
]) {
  test(`manifest rejects ${label}`, () => {
    const m = plainManifest();
    mutate(m);
    assert.throws(() => validateManifest(m), { code: "MANIFEST_INVALID" });
  });
}

test("manifest accepts exact raw, rows and artifact-count bounds and rejects overflow", () => {
  const m = plainManifest();
  m.artifacts = Array.from({ length: LIMITS.artifacts }, (_, index) =>
    plainArtifact(index + 1),
  );
  assert.equal(validateManifest(m), m);
  m.artifacts.push(plainArtifact(LIMITS.artifacts + 1));
  assert.throws(() => validateManifest(m), { code: "MANIFEST_INVALID" });
  const fullArtifacts = LIMITS.totalRawBytes / LIMITS.rawBytes;
  m.artifacts = Array.from({ length: fullArtifacts }, (_, index) =>
    plainArtifact(index + 1, LIMITS.rawBytes),
  );
  assert.equal(validateManifest(m), m);
  m.artifacts.push(plainArtifact(fullArtifacts + 1));
  assert.throws(() => validateManifest(m), { code: "LIMIT_EXCEEDED" });
  for (const size of [0, 511, LIMITS.rawBytes + 1, 512.5, "512"]) {
    m.artifacts = [plainArtifact(1, size)];
    assert.throws(() => validateManifest(m), { code: "LIMIT_EXCEEDED" });
  }
  for (const [kind, key, maximum] of [
    ["rates", "eodhd:policy-rates", 10002],
    ["seasonality-index", "eodhd:seasonality", 20002],
    ["seasonality-symbol", "eodhd:TEST", 100002],
  ]) {
    m.artifacts = [{ ...plainArtifact(1), kind, key, rows: maximum }];
    assert.equal(validateManifest(m), m);
    for (const rows of [-1, maximum + 1, 1.5, "1"]) {
      m.artifacts[0].rows = rows;
      assert.throws(() => validateManifest(m), { code: "LIMIT_EXCEEDED" });
    }
  }
});

test("gzip individual and generation byte bounds are inclusive", () => {
  validateTransferSize(32 * MIB, 500 * MIB);
  validateTransferSize(1, 1);
  for (const [size, total] of [
    [0, 1],
    [32 * MIB + 1, 32 * MIB + 1],
    [1, 500 * MIB + 1],
    [2, 1],
    [1.5, 2],
    [1, "2"],
  ]) {
    assert.throws(() => validateTransferSize(size, total), {
      code: "LIMIT_EXCEEDED",
    });
  }
});

test("actual poorly compressing shard exceeding 32 MiB gzip is rejected before upload", async (t) => {
  const f = await fixture(t);
  await f.rewrite(0, async (target) => {
    const db = new DatabaseSync(target);
    try {
      db.prepare("UPDATE eodhd_events SET actual_value=?").run(
        randomBytes(33 * MIB).toString("base64"),
      );
    } finally {
      db.close();
    }
  });
  assert.ok(f.manifest.artifacts[0].sizeBytes < LIMITS.rawBytes);
  await rejectsBeforeUpload(f, "LIMIT_EXCEEDED");
});

test("external cancellation never attempts a put and leaves incomplete progress", async (t) => {
  const f = await fixture(t),
    blob = memoryBlob(),
    controller = new globalThis.AbortController();
  controller.abort();
  await assert.rejects(
    upload(f, blob, f.options, { signal: controller.signal }),
    { code: "UPLOAD_FAILED" },
  );
  assert.equal(blob.calls.put.length, 0);
  assert.equal(blob.calls.get.length, 0);
  assert.equal((await readDescriptor(f)).complete, false);
  await noStage(f);
});

test("CLI errors contain only stable code and generic text", () => {
  const script = fileURLToPath(
    new URL("./upload-public-shards.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--",
      script,
      "--manifest",
      "fixture-private-path",
      "--env-file",
      "fixture-private-token",
      "--output",
      "fixture-private-output",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(error), ["status", "code", "message"]);
  assert.equal(error.code, "ARGUMENTS_INVALID");
  assert.ok(!result.stderr.includes("fixture-private"));
  assert.ok(!result.stderr.includes(REPOSITORY));
});
