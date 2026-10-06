import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import {
  exportReportShard,
  officialSource,
  sanitizeReport,
} from "./export-report-shards.mjs";

function row() {
  return {
    id: "report-1",
    bank_code: "FED",
    currency: "USD",
    report_type: "decision",
    title: "Synthetic official report",
    source_url: "https://www.federalreserve.gov/report.htm",
    published_at: null,
    discovered_at: "2026-09-01T00:00:00Z",
    language: "en",
    mime_type: "text/html",
    extraction_status: "complete",
    summary_status: "complete",
    summary_provider: "openai",
    summary_model: "synthetic",
    summarized_at: "2026-09-01T00:00:00Z",
    extracted_text: "Synthetic public report text",
    summary_json: JSON.stringify({
      language: "de",
      overview: "Geprüfte Zusammenfassung",
      stance: "unclear",
      sections: [],
    }),
    local_path: "C:\\private\\report.pdf",
    read_at: "personal-read-state",
    api_key: "private-secret",
  };
}
test("public report projection never copies local paths, read markers, or unknown fields", () => {
  const result = sanitizeReport(row());
  assert.equal(result.extracted_text, "Synthetic public report text");
  assert.ok(!("local_path" in result));
  assert.ok(!("read_at" in result));
  assert.ok(!("api_key" in result));
});
test("unsafe sources and excessive original text fail closed", () => {
  assert.equal(
    officialSource("FED", "https://federalreserve.gov.evil.test/file"),
    false,
  );
  assert.equal(
    officialSource("FED", "https://secret@federalreserve.gov/file"),
    false,
  );
  assert.throws(() =>
    sanitizeReport({ ...row(), source_url: "https://example.test" }),
  );
  assert.throws(() =>
    sanitizeReport({ ...row(), extracted_text: "x".repeat(1_000_001) }),
  );
});
test("exports a fresh bounded artifact with no personal columns", async () => {
  const sourceDir = await mkdtemp(
    path.join(os.tmpdir(), "macro-report-source-"),
  );
  const parent = await mkdtemp(path.join(os.tmpdir(), "macro-report-export-"));
  const snapshot = path.join(sourceDir, "synthetic-snapshot.sqlite"),
    output = path.join(parent, "fresh");
  try {
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../src-tauri/src/cloud_public/report_schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const spec = schema["central-bank-reports"].tables.central_bank_reports;
    const db = new DatabaseSync(snapshot);
    db.exec(spec.ddl);
    db.exec(
      "ALTER TABLE central_bank_reports ADD COLUMN local_path TEXT; ALTER TABLE central_bank_reports ADD COLUMN read_at TEXT",
    );
    const value = row(),
      columns = [...Object.keys(spec.columns), "local_path", "read_at"];
    db.prepare(
      `INSERT INTO central_bank_reports(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    ).run(...columns.map((key) => value[key]));
    db.close();
    const manifest = await exportReportShard({
      snapshotPath: snapshot,
      outputDirectory: output,
    });
    assert.equal(manifest.artifacts[0].rows, 1);
    const exported = new DatabaseSync(
      path.join(output, manifest.artifacts[0].fileName),
      { readOnly: true },
    );
    const actual = exported
      .prepare("PRAGMA table_info(central_bank_reports)")
      .all()
      .map((v) => v.name);
    assert.deepEqual(actual, Object.keys(spec.columns));
    assert.equal(
      exported.prepare("SELECT extracted_text FROM central_bank_reports").get()
        .extracted_text,
      "Synthetic public report text",
    );
    exported.close();
    await assert.rejects(
      exportReportShard({ snapshotPath: snapshot, outputDirectory: output }),
    );
  } finally {
    // Both targets are the exact mkdtemp directories created above.
    for (const target of [sourceDir, parent]) {
      const relative = path.relative(
        path.resolve(os.tmpdir()),
        path.resolve(target),
      );
      assert.ok(
        relative && !relative.startsWith("..") && !path.isAbsolute(relative),
      );
    }
    await rm(sourceDir, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});
