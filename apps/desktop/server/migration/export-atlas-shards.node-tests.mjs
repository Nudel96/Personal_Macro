import { URL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  exportAtlasShards,
  artifactDefinitions,
} from "./export-atlas-shards.mjs";
async function fixture(mode, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-cloud-test-"));
  const source = path.join(directory, "source.sqlite");
  const db = new DatabaseSync(source);
  try {
    const migrations = new URL(
      `../../src-tauri/${mode === "atlas" ? "atlas" : "bond"}-migrations/`,
      import.meta.url,
    );
    for (const filename of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      db.exec(await readFile(new URL(filename, migrations), "utf8"));
    }
    await run({ directory, source, db });
  } finally {
    try {
      db.close();
    } catch {
      /* Tests may close the source before export. */
    }
    await rm(directory, { recursive: true, force: true });
  }
}
test("empty catalogue shards preserve separate identities and source bytes", () =>
  fixture("atlas", async ({ directory, source, db }) => {
    db.close();
    const before = await readFile(source);
    const result = await exportAtlasShards({
      snapshotPath: source,
      outputDirectory: path.join(directory, "out"),
      keys: artifactDefinitions("atlas")
        .filter((d) => d.family === "series")
        .slice(0, 2)
        .map((d) => d.key),
    });
    assert.equal(result.artifacts.length, 2);
    assert.notEqual(result.artifacts[0].sha256, result.artifacts[1].sha256);
    assert.deepEqual(await readFile(source), before);
    for (const artifact of result.artifacts) {
      const target = new DatabaseSync(
        path.join(directory, "out", artifact.fileName),
        { readOnly: true },
      );
      assert.equal(
        target.prepare("SELECT count(*) n FROM atlas_observations").get().n,
        0,
      );
      assert.equal(
        target.prepare("SELECT key FROM atlas_cloud_identity").get().key,
        artifact.key.slice(6),
      );
      target.close();
    }
  }));
test("bond projection preserves negative, zero and null yields while dropping provider errors", () =>
  fixture("bonds", async ({ directory, source, db }) => {
    const catalog = JSON.parse(
      await readFile(
        new URL(
          "../../src/features/government-bonds/data/catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const symbol = catalog.instruments[0].symbol;
    db.prepare(
      "INSERT INTO bond_series VALUES(?,1,NULL,'private-attempt','secret error')",
    ).run(symbol);
    for (const [day, value] of [
      ["2026-01-01", "-0.125"],
      ["2026-01-02", "0"],
      ["2026-01-03", null],
    ])
      db.prepare("INSERT INTO bond_observations VALUES(?,?,?)").run(
        symbol,
        day,
        value,
      );
    db.prepare("INSERT INTO bond_metadata VALUES('secret','never copy')").run();
    db.close();
    const result = await exportAtlasShards({
      snapshotPath: source,
      outputDirectory: path.join(directory, "out"),
      mode: "bonds",
    });
    const target = new DatabaseSync(
      path.join(directory, "out", result.artifacts[0].fileName),
      { readOnly: true },
    );
    assert.deepEqual(
      target
        .prepare(
          "SELECT yield_pct FROM bond_observations ORDER BY observation_date",
        )
        .all()
        .map((r) => r.yield_pct),
      ["-0.125", "0", null],
    );
    assert.equal(
      target.prepare("SELECT last_error FROM bond_series").get().last_error,
      null,
    );
    assert.equal(
      target.prepare("SELECT count(*) n FROM bond_metadata").get().n,
      0,
    );
    target.close();
  }));
test("personal tables and WAL sidecars are rejected", () =>
  fixture("bonds", async ({ directory, source, db }) => {
    db.exec("CREATE TABLE trades(secret TEXT)");
    db.close();
    await assert.rejects(
      exportAtlasShards({
        snapshotPath: source,
        outputDirectory: path.join(directory, "out"),
        mode: "bonds",
      }),
      (e) => e.code === "PERSONAL_DATA_REJECTED",
    );
    await writeFile(source + "-wal", "x");
    await assert.rejects(
      exportAtlasShards({
        snapshotPath: source,
        outputDirectory: path.join(directory, "out2"),
        mode: "bonds",
      }),
      (e) => e.code === "SOURCE_NOT_CLOSED",
    );
  }));
test("unknown partition keys fail before creating output", () =>
  fixture("atlas", async ({ directory, source, db }) => {
    db.close();
    await assert.rejects(
      exportAtlasShards({
        snapshotPath: source,
        outputDirectory: path.join(directory, "out"),
        keys: ["atlas:series:../../journal"],
      }),
      (e) => e.code === "KEYS_INVALID",
    );
  }));
