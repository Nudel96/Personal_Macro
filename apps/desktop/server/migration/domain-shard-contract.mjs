// Trusted source definitions shared with Rust include_str!, never supplied by a
// caller or copied from sqlite_schema in a personal database.
import { readFileSync } from "node:fs";
import { URL } from "node:url";
const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../src-tauri/src/cloud_public/${name}`, import.meta.url),
      "utf8",
    ),
  );
const macro = read("macro_schema.json");
const atlas = read("atlas_schema.json");
const reports = read("report_schema.json");
const fixed = {
  macro: "eodhd:macro",
  cot: "cftc:legacy",
  technicals: "eodhd:technicals",
  regime: "eodhd:aud-china-cpi",
  bonds: "bonds:all",
  "central-bank-reports": "official:central-bank-reports",
};
export function domainSchema(kind, key) {
  if (
    typeof key !== "string" ||
    key.length > 256 ||
    /[^A-Za-z0-9:._-]/.test(key)
  )
    return null;
  if (Object.hasOwn(fixed, kind)) {
    if (key !== fixed[kind]) return null;
    if (kind === "bonds") return atlas.bonds;
    if (kind === "central-bank-reports") return reports["central-bank-reports"];
    return macro[kind];
  }
  if (kind !== "atlas" || !key.startsWith("atlas:")) return null;
  const segments = key.split(":");
  const family = segments[1];
  if (!["series", "market", "public", "valuation"].includes(family))
    return segments.length === 2 &&
      Object.hasOwn(atlas, family) &&
      family !== "bonds"
      ? atlas[family]
      : null;
  return segments.length >= 3 && segments.slice(2).join(":").length > 0
    ? atlas[family]
    : null;
}
export function domainMaxRows(schema) {
  return Object.values(schema.tables).reduce(
    (sum, table) => sum + table.maxRows,
    0,
  );
}
const normalize = (value) =>
  typeof value === "string"
    ? value.replace(/[\t\n\f\r "]/g, "").toUpperCase()
    : null;
const identifier = (value) => /^[a-z][a-z0-9_]*$/.test(value);
export function verifyDomainDatabase(db, artifact, check) {
  const definition = domainSchema(artifact.kind, artifact.key);
  check(Boolean(definition), "SHARD_INVALID");
  const expected = Object.entries(definition.tables).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const actual = db
    .prepare(
      "SELECT name,type,sql FROM sqlite_schema WHERE NOT(type='index' AND name GLOB 'sqlite_autoindex_*' AND sql IS NULL) ORDER BY name",
    )
    .all();
  check(actual.length === expected.length, "SHARD_INVALID");
  let total = 0;
  for (const [index, [table, schema]] of expected.entries()) {
    check(
      identifier(table) &&
        actual[index]?.name === table &&
        actual[index]?.type === "table" &&
        normalize(actual[index]?.sql) === normalize(schema.ddl),
      "SHARD_INVALID",
    );
    const columns = db
      .prepare("SELECT name,type,hidden FROM pragma_table_xinfo(?)")
      .all(table);
    const strict = db
      .prepare(
        "SELECT strict FROM pragma_table_list WHERE schema='main' AND name=? AND type='table'",
      )
      .get(table);
    check(
      strict?.strict === 1 && columns.every((column) => column.hidden === 0),
      "SHARD_INVALID",
    );
    if (schema.columns)
      check(
        columns.length === Object.keys(schema.columns).length &&
          columns.every(
            (column) => schema.columns[column.name] === column.type,
          ),
        "SHARD_INVALID",
      );
    const count = db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .get().count;
    check(
      Number.isSafeInteger(count) &&
        count >= (schema.minRows ?? 0) &&
        count <= schema.maxRows,
      "SHARD_INVALID",
    );
    total += count;
    if (schema.identity) {
      const rule = schema.identity;
      check(
        identifier(rule.column) &&
          columns.some((column) => column.name === rule.column),
        "SHARD_INVALID",
      );
      const value = rule.valueFromKeyPrefix
        ? artifact.key.slice(rule.valueFromKeyPrefix.length)
        : rule.value;
      check(
        !rule.valueFromKeyPrefix ||
          artifact.key.startsWith(rule.valueFromKeyPrefix),
        "SHARD_INVALID",
      );
      check(
        typeof value === "string" || Number.isSafeInteger(value),
        "SHARD_INVALID",
      );
      check(
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM "${table}" WHERE "${rule.column}" IS NOT ?`,
          )
          .get(value).count === 0,
        "SHARD_INVALID",
      );
    }
  }
  check(
    total === artifact.rows &&
      Object.values(db.prepare("PRAGMA quick_check(1)").get())[0] === "ok",
    "SHARD_INVALID",
  );
}
