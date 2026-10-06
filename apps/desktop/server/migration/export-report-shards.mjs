import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  readFile,
  lstat,
  realpath,
  mkdir,
  rename,
  writeFile,
  open,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const schema = JSON.parse(
  await readFile(
    new URL(
      "../../src-tauri/src/cloud_public/report_schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const reportSchema = schema["central-bank-reports"].tables.central_bank_reports;
const columns = Object.keys(reportSchema.columns);
const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const domains = {
  FED: "federalreserve.gov",
  ECB: "ecb.europa.eu",
  BOE: "bankofengland.co.uk",
  BOJ: "boj.or.jp",
  RBA: "rba.gov.au",
  RBNZ: "rbnz.govt.nz",
  BOC: "bankofcanada.ca",
  SNB: "snb.ch",
  PBOC: "pbc.gov.cn",
};
const currencies = {
  FED: "USD",
  ECB: "EUR",
  BOE: "GBP",
  BOJ: "JPY",
  RBA: "AUD",
  RBNZ: "NZD",
  BOC: "CAD",
  SNB: "CHF",
  PBOC: "CNY",
};
export const REPORT_LIMITS = Object.freeze({
  reports: 250,
  textBytes: 1_000_000,
  summaryBytes: 128_000,
  artifactBytes: 64 * 1024 * 1024,
});
function invalid() {
  return new Error(
    "Der Berichts-Snapshot entspricht nicht dem freigegebenen Datenvertrag.",
  );
}
function check(value) {
  if (!value) throw invalid();
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
async function cleanPath(target, file = false) {
  let current = path.parse(target).root;
  const parts = path.relative(current, target).split(path.sep).filter(Boolean);
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    const stat = await lstat(current);
    check(
      !stat.isSymbolicLink() &&
        (i === parts.length - 1 && file ? stat.isFile() : stat.isDirectory()),
    );
    check(path.relative(current, await realpath(current)) === "");
  }
}
async function noJournal(target) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(target + suffix);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw invalid();
  }
}
function text(value, max, optional = false) {
  if (optional && value === null) return null;
  check(
    typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value, "utf8") <= max &&
      !value.includes("\0"),
  );
  return value;
}
function timestamp(value, optional = false) {
  if (optional && value === null) return null;
  text(value, 80);
  check(Number.isFinite(Date.parse(value)));
  return value;
}
export function officialSource(bank, value) {
  try {
    const url = new URL(value),
      domain = domains[bank];
    return Boolean(
      domain &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`)),
    );
  } catch {
    return false;
  }
}
function summary(value) {
  if (value === null) return null;
  text(value, REPORT_LIMITS.summaryBytes);
  const parsed = JSON.parse(value);
  check(
    parsed &&
      typeof parsed === "object" &&
      ["hawkish", "dovish", "neutral", "unclear"].includes(parsed.stance) &&
      Array.isArray(parsed.sections) &&
      parsed.sections.length <= 32,
  );
  const normalized = {
    language: parsed.language == null ? null : text(parsed.language, 16),
    overview: text(parsed.overview, 32_000),
    stance: parsed.stance,
    sections: parsed.sections.map((section) => {
      check(
        section && Array.isArray(section.points) && section.points.length <= 32,
      );
      return {
        key: text(section.key, 80),
        title: text(section.title, 1000),
        points: section.points.map((point) => {
          check(
            point &&
              Array.isArray(point.sourceRefs) &&
              point.sourceRefs.length <= 32,
          );
          return {
            text: text(point.text, 16_000),
            sourceRefs: point.sourceRefs.map((ref) => text(ref, 160)),
          };
        }),
      };
    }),
  };
  return JSON.stringify(normalized);
}
export function sanitizeReport(row) {
  check(
    row &&
      Object.hasOwn(domains, row.bank_code) &&
      row.currency === currencies[row.bank_code],
  );
  const mime =
    row.mime_type === null
      ? null
      : row.mime_type.split(";")[0].trim().toLowerCase();
  check(mime === null || ["application/pdf", "text/html"].includes(mime));
  check(
    [
      "decision",
      "monetary_policy_report",
      "projections",
      "special_notice",
    ].includes(row.report_type),
  );
  check(
    /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) &&
      officialSource(row.bank_code, row.source_url),
  );
  check(
    ["pending", "complete", "partial", "failed", "unavailable"].includes(
      row.extraction_status,
    ),
  );
  check(
    ["pending", "complete", "failed", "local_fallback", "unavailable"].includes(
      row.summary_status,
    ),
  );
  return {
    id: row.id,
    bank_code: row.bank_code,
    currency: row.currency,
    report_type: row.report_type,
    title: text(row.title, 4000),
    source_url: text(row.source_url, 4000),
    published_at: timestamp(row.published_at, true),
    discovered_at: timestamp(row.discovered_at),
    language: text(row.language, 16),
    mime_type: mime,
    extraction_status: row.extraction_status,
    summary_status: row.summary_status,
    summary_provider:
      row.summary_provider === null ? null : text(row.summary_provider, 80),
    summary_model:
      row.summary_model === null ? null : text(row.summary_model, 160),
    summarized_at: timestamp(row.summarized_at, true),
    extracted_text:
      row.extracted_text === null || row.extracted_text === ""
        ? null
        : text(row.extracted_text, REPORT_LIMITS.textBytes),
    summary_json: summary(row.summary_json),
  };
}

/** Offline, explicit completed snapshot only. Never discovers AppData or uploads. */
export async function exportReportShard({ snapshotPath, outputDirectory }) {
  let source, output;
  try {
    check(path.isAbsolute(snapshotPath) && path.isAbsolute(outputDirectory));
    const snapshot = path.resolve(snapshotPath),
      directory = path.resolve(outputDirectory);
    check(
      !inside(repository, directory) &&
        inside(path.resolve(os.tmpdir()), directory) &&
        !inside(path.dirname(snapshot), directory),
    );
    check(
      !/^(?:journal|cache)\.sqlite$/i.test(path.basename(snapshot)) &&
        !/[\\/]PersonalMacro[\\/]/i.test(snapshot),
    );
    await cleanPath(snapshot, true);
    await cleanPath(path.dirname(directory));
    await noJournal(snapshot);
    const before = await lstat(snapshot, { bigint: true });
    check(before.nlink === 1n);
    const sourceHandle = await open(snapshot, "r");
    try {
      const header = Buffer.alloc(100);
      await sourceHandle.read(header, 0, 100, 0);
      check(
        header.toString("ascii", 0, 16) === "SQLite format 3\0" &&
          header[18] === 1 &&
          header[19] === 1,
      );
    } finally {
      await sourceHandle.close();
    }
    source = new DatabaseSync(snapshot, {
      readOnly: true,
      allowExtension: false,
    });
    source.exec(
      "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; BEGIN",
    );
    const object = source
      .prepare(
        "SELECT type FROM sqlite_schema WHERE name='central_bank_reports'",
      )
      .get();
    check(object?.type === "table");
    check(
      Object.values(source.prepare("PRAGMA quick_check").get())[0] === "ok",
    );
    const selectedSql = `SELECT ${columns.map((name) => `"${name}"`).join(",")} FROM central_bank_reports ORDER BY COALESCE(published_at,discovered_at) DESC,id LIMIT ${REPORT_LIMITS.reports}`;
    const sizes = source
      .prepare(
        `WITH selected AS (${selectedSql}) SELECT MAX(COALESCE(length(CAST(extracted_text AS BLOB)),0)) AS max_text,MAX(COALESCE(length(CAST(summary_json AS BLOB)),0)) AS max_summary,COALESCE(SUM(${columns.map((name) => `COALESCE(length(CAST("${name}" AS BLOB)),0)`).join("+")}),0) AS total FROM selected`,
      )
      .get();
    check(
      (sizes.max_text ?? 0) <= REPORT_LIMITS.textBytes &&
        (sizes.max_summary ?? 0) <= REPORT_LIMITS.summaryBytes &&
        sizes.total < REPORT_LIMITS.artifactBytes - 1024 * 1024,
    );
    const rows = source
      .prepare(
        `SELECT ${columns.map((name) => `"${name}"`).join(",")} FROM central_bank_reports ORDER BY COALESCE(published_at,discovered_at) DESC,id LIMIT ?`,
      )
      .all(REPORT_LIMITS.reports)
      .map(sanitizeReport);
    source.exec("COMMIT");
    source.close();
    source = undefined;
    const after = await lstat(snapshot, { bigint: true });
    check(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeNs === after.mtimeNs,
    );
    await cleanPath(snapshot, true);
    await noJournal(snapshot);
    await mkdir(directory, { mode: 0o700 });
    await cleanPath(directory);
    const temporary = path.join(directory, `${randomUUID()}.partial`);
    await writeFile(temporary, "", { flag: "wx", mode: 0o600 });
    output = new DatabaseSync(temporary, { allowExtension: false });
    output.exec(
      `PRAGMA journal_mode=DELETE; PRAGMA trusted_schema=OFF; PRAGMA max_page_count=${REPORT_LIMITS.artifactBytes / 4096}; BEGIN; ${reportSchema.ddl}`,
    );
    const insert = output.prepare(
      `INSERT INTO central_bank_reports(${columns.map((name) => `"${name}"`).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    );
    for (const row of rows) insert.run(...columns.map((name) => row[name]));
    output.exec("COMMIT");
    check(
      Object.values(output.prepare("PRAGMA quick_check").get())[0] === "ok",
    );
    output.close();
    output = undefined;
    await noJournal(temporary);
    const bytes = await readFile(temporary);
    check(bytes.length <= REPORT_LIMITS.artifactBytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex"),
      fileName = `${sha256}.sqlite`;
    await rename(temporary, path.join(directory, fileName));
    const manifest = {
      schemaVersion: 1,
      generation: randomUUID(),
      createdAt: new Date().toISOString(),
      artifacts: [
        {
          kind: "central-bank-reports",
          key: "official:central-bank-reports",
          sha256,
          sizeBytes: bytes.length,
          rows: rows.length,
          fileName,
          format: "sqlite",
          schemaVersion: 1,
        },
      ],
    };
    await writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return manifest;
  } catch {
    throw invalid();
  } finally {
    source?.close();
    output?.close();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const { values } = parseArgs({
      options: { snapshot: { type: "string" }, output: { type: "string" } },
      strict: true,
    });
    const result = await exportReportShard({
      snapshotPath: values.snapshot,
      outputDirectory: values.output,
    });
    process.stdout.write(
      JSON.stringify({
        complete: true,
        artifacts: result.artifacts.length,
        reports: result.artifacts[0].rows,
        bytes: result.artifacts[0].sizeBytes,
      }) + "\n",
    );
  } catch {
    process.stderr.write(
      "Der öffentliche Berichtsexport konnte nicht sicher abgeschlossen werden.\n",
    );
    process.exitCode = 1;
  }
}
