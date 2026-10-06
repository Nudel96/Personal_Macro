import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  domainSchema,
  verifyDomainDatabase,
} from "./domain-shard-contract.mjs";

test("only fixed domains and declared atlas families resolve", () => {
  for (const [kind, key] of [
    ["macro", "eodhd:macro"],
    ["cot", "cftc:legacy"],
    ["atlas", "atlas:catalog"],
    ["bonds", "bonds:all"],
  ])
    assert.ok(domainSchema(kind, key));
  for (const [kind, key] of [
    ["macro", "eodhd:other"],
    ["atlas", "atlas:unknown"],
    ["atlas", "atlas:series:../file"],
    ["bonds", "bonds:other"],
  ])
    assert.equal(domainSchema(kind, key), null);
});
test("exact schema, identity, minimum rows and forbidden objects are checked", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const schema = domainSchema("atlas", "atlas:catalog");
    for (const table of Object.values(schema.tables)) db.exec(table.ddl);
    const artifact = { kind: "atlas", key: "atlas:catalog", rows: 1 };
    const check = (condition) => assert.ok(condition);
    assert.throws(() =>
      verifyDomainDatabase(db, { ...artifact, rows: 0 }, check),
    );
    db.prepare("INSERT INTO atlas_cloud_metadata(version) VALUES(?)").run(1);
    verifyDomainDatabase(db, artifact, check);
    db.exec("UPDATE atlas_cloud_metadata SET version=2");
    assert.throws(() => verifyDomainDatabase(db, artifact, check));
    db.exec(
      "UPDATE atlas_cloud_metadata SET version=1; CREATE VIEW forbidden AS SELECT version FROM atlas_cloud_metadata",
    );
    assert.throws(() => verifyDomainDatabase(db, artifact, check));
  } finally {
    db.close();
  }
});
test("one series cannot be relabelled as another shard", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const schema = domainSchema("atlas", "atlas:series:test-a");
    for (const table of Object.values(schema.tables)) db.exec(table.ddl);
    db.prepare("INSERT INTO atlas_cloud_identity(key) VALUES(?)").run(
      "series:test-a",
    );
    verifyDomainDatabase(
      db,
      { kind: "atlas", key: "atlas:series:test-a", rows: 1 },
      assert.ok,
    );
    assert.throws(() =>
      verifyDomainDatabase(
        db,
        { kind: "atlas", key: "atlas:series:test-b", rows: 1 },
        assert.ok,
      ),
    );
  } finally {
    db.close();
  }
});
