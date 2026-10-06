import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { argv, env as processEnv, stdout, stderr } from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import {
  inspectImage,
  isMediaId,
  MAX_MEDIA_BYTES,
  objectPath,
  validateFilename,
} from "../media/image.mjs";
import { uploadExistingMedia } from "../media/migrate.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ENV_BYTES = 64 * 1024;
const ERRORS = {
  ARGUMENTS_INVALID:
    "Alle vier Pfade müssen ausdrücklich und absolut angegeben werden.",
  SNAPSHOT_UNSAFE:
    "Der Snapshotpfad ist nicht zulässig. Verwende eine separate geschlossene Kopie.",
  SNAPSHOT_NOT_CLOSED:
    "Der Snapshot ist nicht geschlossen oder benötigt Journaldateien.",
  SNAPSHOT_INVALID:
    "Der Snapshot konnte nicht konsistent und schreibgeschützt geprüft werden.",
  MEDIA_PATH_UNSAFE:
    "Ein Medienpfad ist nicht zulässig oder wurde während der Prüfung verändert.",
  MEDIA_INVALID:
    "Ein Originalbild stimmt nicht mit seinem Speichernachweis überein.",
  LIMIT_EXCEEDED:
    "Erlaubt sind höchstens 100 Bilder mit insgesamt 100 MiB und höchstens 3 MiB je Bild.",
  ENV_INVALID:
    "Die ausdrücklich angegebene Konfigurationsdatei enthält keinen nutzbaren Bildspeicherzugang.",
  OUTPUT_UNSAFE:
    "Der Ausgabepfad muss außerhalb des Repositorys liegen und darf keine Verknüpfung sein.",
  OUTPUT_EXISTS:
    "Die Ausgabedatei existiert bereits und wird nicht überschrieben.",
  OUTPUT_WRITE_FAILED:
    "Der Importnachweis konnte nicht sicher gespeichert werden.",
  UPLOAD_FAILED:
    "Der Bildimport ist unvollständig. Bereits hochgeladene Originale bleiben erhalten.",
  MIGRATION_FAILED: "Der Bildimport konnte nicht abgeschlossen werden.",
};

export class MediaMigrationError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : "MIGRATION_FAILED";
    super(ERRORS[safeCode]);
    this.code = safeCode;
  }
}
const fail = (code) => new MediaMigrationError(code);
function safe(error, fallback) {
  return error instanceof MediaMigrationError ? error : fail(fallback);
}
async function closeSafely(handle, code) {
  try {
    await handle?.close();
  } catch {
    throw fail(code);
  }
}
function samePath(left, right) {
  const normalize = (value) => {
    const normalized = path.resolve(value);
    return path.sep === "\\" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
function absolute(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  )
    throw fail("ARGUMENTS_INVALID");
  // Windows rooted paths such as \\folder still depend on the current drive.
  if (path.sep === "\\" && path.parse(value).root === "\\")
    throw fail("ARGUMENTS_INVALID");
  const resolved = path.resolve(value);
  if (path.relative(path.parse(resolved).root, resolved).includes(":"))
    throw fail("ARGUMENTS_INVALID");
  return resolved;
}
function identity(left, right, contents = false) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    (!contents ||
      (left.size === right.size &&
        left.mtimeNs === right.mtimeNs &&
        left.ctimeNs === right.ctimeNs))
  );
}
async function existingPath(target, type, code) {
  try {
    const root = path.parse(target).root;
    const components = path
      .relative(root, target)
      .split(path.sep)
      .filter(Boolean);
    const checked = [];
    let current = root;
    for (let index = -1; index < components.length; index++) {
      if (index >= 0) current = path.join(current, components[index]);
      const stat = await lstat(current, { bigint: true });
      const final = index === components.length - 1;
      if (
        stat.isSymbolicLink() ||
        !(final && type === "file" ? stat.isFile() : stat.isDirectory())
      )
        throw fail(code);
      if (!samePath(await realpath(current), current)) throw fail(code);
      checked.push({ path: current, stat });
    }
    return checked;
  } catch (error) {
    throw safe(error, code);
  }
}
async function unchangedPath(checked, code, contents = false) {
  for (let index = 0; index < checked.length; index++) {
    const previous = checked[index];
    let stat;
    try {
      stat = await lstat(previous.path, { bigint: true });
      if (
        stat.isSymbolicLink() ||
        !samePath(await realpath(previous.path), previous.path)
      )
        throw fail(code);
    } catch (error) {
      throw safe(error, code);
    }
    if (
      !identity(previous.stat, stat, contents && index === checked.length - 1)
    )
      throw fail(code);
  }
}
async function readVerified(target, maximum, code, expectedSize) {
  const checked = await existingPath(target, "file", code);
  const before = checked.at(-1).stat;
  if (
    before.size > BigInt(maximum) ||
    before.size < 1n ||
    (expectedSize !== undefined && before.size !== BigInt(expectedSize))
  )
    throw fail(code);
  let handle;
  try {
    handle = await open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    if (!identity(before, await handle.stat({ bigint: true }), true))
      throw fail(code);
    await unchangedPath(checked, code, true);
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(
        bytes,
        count,
        bytes.length - count,
        count,
      );
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    if (
      count !== Number(before.size) ||
      !identity(before, await handle.stat({ bigint: true }), true)
    )
      throw fail(code);
    await unchangedPath(checked, code, true);
    return bytes.subarray(0, count);
  } catch (error) {
    throw safe(error, code);
  } finally {
    await closeSafely(handle, code);
  }
}
async function activeWorkspacePaths(dependencies) {
  const configured =
    dependencies.activeWorkspace ??
    (processEnv.APPDATA
      ? path.join(processEnv.APPDATA, "com.personal-macro.app", "PersonalMacro")
      : undefined);
  if (!configured) return [];
  const workspace = absolute(configured);
  try {
    return [workspace, await realpath(workspace)];
  } catch (error) {
    if (error?.code === "ENOENT") return [workspace];
    throw fail("SNAPSHOT_UNSAFE");
  }
}
function activeWorkingFile(target, workspacePaths) {
  return workspacePaths.some(
    (workspace) =>
      inside(workspace, target) &&
      !inside(path.join(workspace, "backups"), target),
  );
}
async function noJournal(snapshot) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      await lstat(`${snapshot}${suffix}`);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw fail("SNAPSHOT_NOT_CLOSED");
    }
    throw fail("SNAPSHOT_NOT_CLOSED");
  }
}
async function snapshotRecords(snapshot, workspacePaths) {
  if (activeWorkingFile(snapshot, workspacePaths))
    throw fail("SNAPSHOT_UNSAFE");
  const checked = await existingPath(snapshot, "file", "SNAPSHOT_UNSAFE");
  await noJournal(snapshot);
  let handle, db;
  try {
    handle = await open(
      snapshot,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    if (
      !identity(checked.at(-1).stat, await handle.stat({ bigint: true }), true)
    )
      throw fail("SNAPSHOT_INVALID");
    const header = Buffer.alloc(100);
    if (
      (await handle.read(header, 0, 100, 0)).bytesRead !== 100 ||
      header.toString("ascii", 0, 16) !== "SQLite format 3\0"
    )
      throw fail("SNAPSHOT_INVALID");
    // Even read-only SQLite may create WAL/SHM for a WAL-mode header.
    if (header[18] !== 1 || header[19] !== 1) throw fail("SNAPSHOT_NOT_CLOSED");
    await unchangedPath(checked, "SNAPSHOT_INVALID", true);
    db = new DatabaseSync(snapshot, { readOnly: true, allowExtension: false });
    db.exec(
      "PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; BEGIN",
    );
    const integrity = db.prepare("PRAGMA quick_check").all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok")
      throw fail("SNAPSHOT_INVALID");
    const table = db
      .prepare("SELECT type,sql FROM sqlite_schema WHERE name='media_files'")
      .get();
    if (
      table?.type !== "table" ||
      /\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(table.sql ?? "")
    )
      throw fail("SNAPSHOT_INVALID");
    const rows = db
      .prepare(
        "SELECT id,relative_path,original_filename,mime_type,size_bytes,sha256 FROM media_files ORDER BY id LIMIT 101",
      )
      .all();
    db.exec("ROLLBACK");
    db.close();
    db = undefined;
    await noJournal(snapshot);
    if (
      !identity(checked.at(-1).stat, await handle.stat({ bigint: true }), true)
    )
      throw fail("SNAPSHOT_INVALID");
    await unchangedPath(checked, "SNAPSHOT_INVALID", true);
    return rows;
  } catch (error) {
    throw safe(error, "SNAPSHOT_INVALID");
  } finally {
    try {
      db?.close();
    } finally {
      await handle?.close();
    }
  }
}
function originalPath(mediaRoot, storedPath) {
  if (
    typeof storedPath !== "string" ||
    !storedPath.startsWith("media/") ||
    storedPath.includes("\\") ||
    path.posix.normalize(storedPath) !== storedPath ||
    path.posix.isAbsolute(storedPath)
  )
    throw fail("MEDIA_PATH_UNSAFE");
  const components = storedPath.slice(6).split("/");
  if (
    !components.length ||
    components.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        Array.from(part).some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || code === 127 || character === ":";
        }) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw fail("MEDIA_PATH_UNSAFE");
  const resolved = path.resolve(mediaRoot, ...components);
  if (!inside(mediaRoot, resolved) || samePath(mediaRoot, resolved))
    throw fail("MEDIA_PATH_UNSAFE");
  return resolved;
}
async function validateOriginals(rows, mediaRoot) {
  if (rows.length > MAX_FILES) throw fail("LIMIT_EXCEEDED");
  let totalBytes = 0;
  const ids = new Set();
  for (const row of rows) {
    if (!isMediaId(row.id) || ids.has(row.id)) throw fail("MEDIA_INVALID");
    ids.add(row.id);
    if (
      !Number.isSafeInteger(row.size_bytes) ||
      row.size_bytes < 1 ||
      row.size_bytes > MAX_MEDIA_BYTES
    )
      throw fail("LIMIT_EXCEEDED");
    totalBytes += row.size_bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw fail("LIMIT_EXCEEDED");
  }
  const originals = [];
  for (const row of rows) {
    const target = originalPath(mediaRoot, row.relative_path);
    const bytes = await readVerified(
      target,
      MAX_MEDIA_BYTES,
      "MEDIA_PATH_UNSAFE",
      row.size_bytes,
    );
    const record = {
      id: row.id,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
    };
    try {
      const image = inspectImage(bytes, record.mimeType);
      validateFilename(record.originalFilename);
      objectPath(record.id, image);
      if (
        image.sha256 !== record.sha256 ||
        image.sizeBytes !== record.sizeBytes
      )
        throw fail("MEDIA_INVALID");
    } catch (error) {
      throw safe(error, "MEDIA_INVALID");
    }
    originals.push({ bytes, record });
  }
  return { originals, totalBytes };
}
async function outputDestination(output, workspacePaths) {
  if (inside(REPOSITORY, output) || activeWorkingFile(output, workspacePaths))
    throw fail("OUTPUT_UNSAFE");
  const parent = await existingPath(
    path.dirname(output),
    "directory",
    "OUTPUT_UNSAFE",
  );
  if (inside(await realpath(REPOSITORY), await realpath(path.dirname(output))))
    throw fail("OUTPUT_UNSAFE");
  try {
    await lstat(output);
  } catch (error) {
    if (error?.code === "ENOENT") return parent;
    throw fail("OUTPUT_UNSAFE");
  }
  throw fail("OUTPUT_EXISTS");
}
async function persist(handle, output, parent, document) {
  try {
    await unchangedPath(parent, "OUTPUT_UNSAFE");
    const target = await existingPath(output, "file", "OUTPUT_UNSAFE");
    const stat = await handle.stat({ bigint: true });
    if (stat.nlink !== 1n || !identity(stat, target.at(-1).stat))
      throw fail("OUTPUT_UNSAFE");
    const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
    await handle.truncate(0);
    let offset = 0;
    while (offset < bytes.length) {
      const written = await handle.write(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!written.bytesWritten) throw fail("OUTPUT_WRITE_FAILED");
      offset += written.bytesWritten;
    }
    await handle.sync();
    await unchangedPath(parent, "OUTPUT_UNSAFE");
    if (
      !identity(
        await handle.stat({ bigint: true }),
        await lstat(output, { bigint: true }),
      )
    )
      throw fail("OUTPUT_UNSAFE");
  } catch (error) {
    throw safe(error, "OUTPUT_WRITE_FAILED");
  }
}

/** Explicit local inputs only. Tests inject a memory Blob SDK; no environment mutation. */
export async function runUpload(options, dependencies = {}) {
  let outputHandle;
  try {
    const snapshot = absolute(options?.snapshot);
    const mediaRoot = absolute(options?.mediaRoot);
    const envFile = absolute(options?.envFile);
    const output = absolute(options?.output);
    const workspacePaths = await activeWorkspacePaths(dependencies);
    const parent = await outputDestination(output, workspacePaths);
    await existingPath(mediaRoot, "directory", "MEDIA_PATH_UNSAFE");
    const rows = await snapshotRecords(snapshot, workspacePaths);
    const { originals, totalBytes } = await validateOriginals(rows, mediaRoot);
    let configuration;
    try {
      configuration = parseEnv(
        new globalThis.TextDecoder("utf-8", { fatal: true }).decode(
          await readVerified(envFile, MAX_ENV_BYTES, "ENV_INVALID"),
        ),
      );
    } catch (error) {
      throw safe(error, "ENV_INVALID");
    }
    const token = configuration.BLOB_READ_WRITE_TOKEN;
    if (typeof token !== "string" || !token || token !== token.trim())
      throw fail("ENV_INVALID");
    const env = { BLOB_READ_WRITE_TOKEN: token };
    await unchangedPath(parent, "OUTPUT_UNSAFE");
    try {
      outputHandle = await open(output, "wx", 0o600);
    } catch (error) {
      throw fail(
        error?.code === "EEXIST" ? "OUTPUT_EXISTS" : "OUTPUT_WRITE_FAILED",
      );
    }
    const document = { version: 1, complete: false, totalBytes, media: [] };
    await persist(outputHandle, output, parent, document);
    for (const original of originals) {
      let result;
      try {
        if (dependencies.signal?.aborted) throw fail("UPLOAD_FAILED");
        result = await uploadExistingMedia({
          ...original,
          env,
          signal: dependencies.signal ?? globalThis.AbortSignal.timeout(90_000),
          blob: dependencies.blob,
        });
      } catch {
        throw fail("UPLOAD_FAILED");
      }
      document.media.push(result.input);
      await persist(outputHandle, output, parent, document);
    }
    document.complete = true;
    await persist(outputHandle, output, parent, document);
    return { status: "complete", files: document.media.length, totalBytes };
  } catch (error) {
    throw safe(error, "MIGRATION_FAILED");
  } finally {
    await closeSafely(outputHandle, "OUTPUT_WRITE_FAILED");
  }
}

async function main() {
  try {
    let values;
    try {
      ({ values } = parseArgs({
        args: argv.slice(2),
        strict: true,
        allowPositionals: false,
        options: {
          snapshot: { type: "string" },
          "media-root": { type: "string" },
          "env-file": { type: "string" },
          output: { type: "string" },
        },
      }));
    } catch {
      throw fail("ARGUMENTS_INVALID");
    }
    const result = await runUpload({
      snapshot: values.snapshot,
      mediaRoot: values["media-root"],
      envFile: values["env-file"],
      output: values.output,
    });
    stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const issue = safe(error, "MIGRATION_FAILED");
    stderr.write(
      `${JSON.stringify({ status: "failed", code: issue.code, message: issue.message })}\n`,
    );
    globalThis.process.exitCode = 1;
  }
}
if (argv[1] && import.meta.url === pathToFileURL(path.resolve(argv[1])).href)
  await main();
