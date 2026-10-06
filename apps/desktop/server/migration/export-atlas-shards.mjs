import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  realpath,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DATA = new URL("../../src/features/world-atlas/data/", import.meta.url);
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../src-tauri/src/cloud_public/atlas_schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const catalog = JSON.parse(
  await readFile(new URL("catalog.json", DATA), "utf8"),
);
const markets = JSON.parse(
  await readFile(new URL("market-proxies.json", DATA), "utf8"),
);
const sources = JSON.parse(
  await readFile(new URL("public-series-catalog.json", DATA), "utf8"),
).sources;
const valuations = JSON.parse(
  await readFile(new URL("valuation-catalog.json", DATA), "utf8"),
).datasets;
const bonds = JSON.parse(
  await readFile(
    new URL(
      "../../src/features/government-bonds/data/catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const LIMITS = {
  artifactBytes: 128 * 1024 * 1024,
  totalBytes: 2 * 1024 * 1024 * 1024,
  cellBytes: 64 * 1024 * 1024,
  artifacts: 1024,
};
export class AtlasExportError extends Error {
  constructor(code) {
    super("Der geprüfte Atlas-/Anleihenexport konnte nicht erstellt werden.");
    this.code = code;
  }
}
function check(value, code = "DATA_INVALID") {
  if (!value) throw new AtlasExportError(code);
}
const q = (name) => '"' + name.replaceAll('"', '""') + '"';
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const within = (root, p) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
async function safePath(value, file = false) {
  check(typeof value === "string" && path.isAbsolute(value), "PATH_INVALID");
  let current = path.parse(value).root;
  const found = [];
  for (const part of [
    null,
    ...path.relative(current, value).split(path.sep).filter(Boolean),
  ]) {
    if (part !== null) current = path.join(current, part);
    const stat = await lstat(current, { bigint: true });
    check(
      !stat.isSymbolicLink() &&
        (current === value && file ? stat.isFile() : stat.isDirectory()),
      "PATH_INVALID",
    );
    check(
      path.relative(current, await realpath(current)) === "",
      "PATH_INVALID",
    );
    found.push([current, stat]);
  }
  return found;
}
async function unchanged(chain, contents = false) {
  for (let i = 0; i < chain.length; i++) {
    const [p, before] = chain[i];
    const now = await lstat(p, { bigint: true });
    check(
      !now.isSymbolicLink() &&
        now.dev === before.dev &&
        now.ino === before.ino &&
        path.relative(p, await realpath(p)) === "",
      "PATH_CHANGED",
    );
    if (contents && i === chain.length - 1)
      check(
        now.size === before.size &&
          now.mtimeNs === before.mtimeNs &&
          now.ctimeNs === before.ctimeNs,
        "SOURCE_CHANGED",
      );
  }
}
async function noSidecars(p) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(p + suffix);
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw new AtlasExportError("SOURCE_NOT_CLOSED");
  }
}
export function artifactDefinitions(mode) {
  if (mode === "bonds")
    return [{ kind: "bonds", key: "bonds:all", family: "bonds" }];
  check(mode === "atlas", "MODE_INVALID");
  const defs = [{ kind: "atlas", key: "atlas:catalog", family: "catalog" }];
  for (const [family, items] of [
    ["series", catalog.series],
    ["market", markets],
    ["public", sources],
    ["valuation", valuations],
  ])
    for (const item of items)
      defs.push({ kind: "atlas", family, key: `atlas:${family}:${item.id}` });
  for (const family of Object.keys(schema))
    if (
      !["catalog", "series", "market", "public", "valuation", "bonds"].includes(
        family,
      )
    )
      defs.push({ kind: "atlas", family, key: `atlas:${family}` });
  return defs;
}
function identityValue(def, table) {
  const identity = table.identity;
  return identity
    ? identity.valueFromKeyPrefix
      ? def.key.slice(identity.valueFromKeyPrefix.length)
      : identity.value
    : null;
}
function validateSource(db, mode) {
  const objects = db
    .prepare(
      "SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
    )
    .all();
  check(
    objects.every((o) => o.type !== "view" && o.type !== "trigger"),
    "SCHEMA_INVALID",
  );
  check(
    objects
      .filter((o) => o.type === "table")
      .every(
        (o) =>
          o.name === "_sqlx_migrations" ||
          o.name.startsWith(mode === "atlas" ? "atlas_" : "bond_"),
      ),
    "PERSONAL_DATA_REJECTED",
  );
  const expected =
    mode === "atlas"
      ? Object.entries(schema).filter(
          ([f]) => !["bonds", "catalog"].includes(f),
        )
      : [["bonds", schema.bonds]];
  for (const [, family] of expected)
    for (const [name, t] of Object.entries(family.tables)) {
      if (name === "atlas_cloud_identity") continue;
      check(
        objects.some(
          (o) =>
            o.name === name &&
            o.type === "table" &&
            !/CREATE\s+VIRTUAL/i.test(o.sql),
        ),
        "SCHEMA_INVALID",
      );
      if (name === "atlas_cloud_identity") continue;
      const cols = db.prepare(`PRAGMA table_xinfo(${q(name)})`).all();
      for (const [column, type] of Object.entries(t.columns))
        check(
          cols.some(
            (c) =>
              c.name === column &&
              c.type.toUpperCase() === type &&
              c.hidden === 0,
          ),
          "SCHEMA_INVALID",
        );
    }
  check(
    Object.values(db.prepare("PRAGMA quick_check(1)").get())[0] === "ok",
    "SOURCE_INVALID",
  );
}
function valueValid(value, type, name) {
  if (value === null) return;
  if (type === "TEXT") {
    check(
      typeof value === "string" &&
        Buffer.byteLength(value) <= LIMITS.cellBytes &&
        !value.includes("\0"),
      "DATA_INVALID",
    );
    if (name.endsWith("_json")) JSON.parse(value);
  } else if (type === "INTEGER")
    check(Number.isSafeInteger(value), "DATA_INVALID");
  else
    check(typeof value === "number" && Number.isFinite(value), "DATA_INVALID");
}
async function packageFile(db, output, chain, def) {
  await unchanged(chain);
  const temporary = path.join(output, `staging-${randomUUID()}.sqlite`);
  const target = new DatabaseSync(temporary, { allowExtension: false });
  let count = 0;
  try {
    target.exec(
      "PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF; PRAGMA page_size=4096; PRAGMA max_page_count=32768; BEGIN",
    );
    for (const [name, t] of Object.entries(schema[def.family].tables)) {
      target.exec(t.ddl);
      const columns = Object.keys(t.columns);
      const insert = target.prepare(
        `INSERT INTO ${q(name)}(${columns.map(q).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
      );
      if (def.family === "catalog") {
        insert.run(1);
        count++;
        continue;
      }
      if (name === "atlas_cloud_identity") {
        insert.run(def.key.slice("atlas:".length));
        count++;
        continue;
      }
      const condition = t.identity ? ` WHERE ${q(t.identity.column)}=?` : "";
      const args = t.identity ? [identityValue(def, t)] : [];
      // SELECT lists are compile-time reviewed projections; errors/jobs never enter a package.
      const selected = columns.map((col) =>
        def.family === "bonds" &&
        ["last_error", "last_attempt_at"].includes(col)
          ? `NULL AS ${q(col)}`
          : q(col),
      );
      const statement = db.prepare(
        `SELECT ${selected.join(",")} FROM ${q(name)}${condition} LIMIT ${t.maxRows + 1}`,
      );
      let rows = 0;
      for (const row of statement.iterate(...args)) {
        check(++rows <= t.maxRows, "ROW_LIMIT");
        for (const [col, type] of Object.entries(t.columns))
          valueValid(row[col], type, col);
        if (def.family === "bonds" && row.symbol !== undefined)
          check(
            bonds.instruments.some((b) => b.symbol === row.symbol),
            "IDENTITY_INVALID",
          );
        if (row.geography_id !== undefined)
          check(
            catalog.geographies.some((g) => g.id === row.geography_id),
            "IDENTITY_INVALID",
          );
        insert.run(...columns.map((col) => row[col]));
        count++;
      }
    }
    target.exec("COMMIT");
    check(
      Object.values(target.prepare("PRAGMA quick_check(1)").get())[0] === "ok",
      "PACKAGE_INVALID",
    );
  } finally {
    target.close();
  }
  await unchanged(chain);
  const bytes = await readFile(temporary);
  check(bytes.length <= LIMITS.artifactBytes, "BYTE_LIMIT");
  const sha256 = hash(bytes),
    fileName = `${sha256}.sqlite`,
    destination = path.join(output, fileName);
  // Identical empty projections may share bytes, which is safe and content addressed.
  try {
    const existing = await readFile(destination);
    check(hash(existing) === sha256, "PACKAGE_INVALID");
    await import("node:fs/promises").then((fs) => fs.unlink(temporary));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await rename(temporary, destination);
  }
  return {
    kind: def.kind,
    key: def.key,
    sha256,
    sizeBytes: bytes.length,
    rows: count,
    fileName,
    format: "sqlite",
    schemaVersion: 1,
  };
}
export async function exportAtlasShards({
  snapshotPath,
  outputDirectory,
  mode = "atlas",
  keys,
} = {}) {
  let db;
  try {
    check(
      path.isAbsolute(snapshotPath ?? "") &&
        path.isAbsolute(outputDirectory ?? ""),
      "PATH_INVALID",
    );
    const source = path.resolve(snapshotPath),
      output = path.resolve(outputDirectory);
    check(
      !within(ROOT, source) && !within(ROOT, output) && source !== output,
      "PATH_INVALID",
    );
    const chain = await safePath(source, true),
      parent = await safePath(path.dirname(output));
    await noSidecars(source);
    const sourceHandle = await open(source, "r");
    const header = Buffer.alloc(100);
    try {
      check(
        (await sourceHandle.read(header, 0, 100, 0)).bytesRead === 100,
        "SOURCE_INVALID",
      );
    } finally {
      await sourceHandle.close();
    }
    check(
      header.subarray(0, 16).toString() === "SQLite format 3\0" &&
        header[18] === 1 &&
        header[19] === 1,
      "SOURCE_NOT_CLOSED",
    );
    await unchanged(chain, true);
    let defs = artifactDefinitions(mode);
    if (keys !== undefined) {
      check(
        Array.isArray(keys) &&
          keys.length > 0 &&
          new Set(keys).size === keys.length,
        "KEYS_INVALID",
      );
      check(
        keys.every((key) => defs.some((d) => d.key === key)),
        "KEYS_INVALID",
      );
      defs = defs.filter((d) => keys.includes(d.key));
    }
    check(defs.length <= LIMITS.artifacts, "ARTIFACT_LIMIT");
    db = new DatabaseSync(source, { readOnly: true, allowExtension: false });
    db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN");
    validateSource(db, mode);
    await unchanged(parent);
    await mkdir(output, { mode: 0o700 });
    const outputChain = await safePath(output);
    const artifacts = [];
    let total = 0;
    for (const def of defs) {
      const artifact = await packageFile(db, output, outputChain, def);
      total += artifact.sizeBytes;
      check(total <= LIMITS.totalBytes, "TOTAL_LIMIT");
      artifacts.push(artifact);
    }
    db.exec("ROLLBACK");
    db.close();
    db = undefined;
    await noSidecars(source);
    await unchanged(chain, true);
    await unchanged(outputChain);
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
    throw error instanceof AtlasExportError
      ? error
      : new AtlasExportError("EXPORT_FAILED");
  } finally {
    db?.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        snapshot: { type: "string" },
        output: { type: "string" },
        mode: { type: "string" },
        key: { type: "string", multiple: true },
      },
      strict: true,
      allowPositionals: false,
    });
    const result = await exportAtlasShards({
      snapshotPath: values.snapshot,
      outputDirectory: values.output,
      mode: values.mode,
      keys: values.key,
    });
    process.stdout.write(
      JSON.stringify({
        status: "exported",
        artifacts: result.artifacts.length,
        sizeBytes: result.artifacts.reduce((sum, a) => sum + a.sizeBytes, 0),
      }) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        status: "failed",
        code:
          error instanceof AtlasExportError ? error.code : "ARGUMENTS_INVALID",
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
