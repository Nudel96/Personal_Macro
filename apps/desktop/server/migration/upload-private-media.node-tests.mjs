import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  symlink,
  access,
  copyFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { URL, fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { inspectImage, objectPath } from "../media/image.mjs";
import { runUpload } from "./upload-private-media.mjs";

function chunk(type, data) {
  const value = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const prefix = Buffer.alloc(4),
    suffix = Buffer.alloc(4);
  prefix.writeUInt32BE(data.length);
  suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([prefix, value, suffix]);
}
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
  chunk("IDAT", deflateSync(Buffer.from([0, 100, 120, 140, 255]))),
  chunk("IEND", Buffer.alloc(0)),
]);
const IMAGE = inspectImage(PNG, "image/png");
function row(overrides = {}) {
  const id = randomUUID();
  return {
    id,
    relative_path: `media/${id}.png`,
    original_filename: "Prüfung.png",
    mime_type: "image/png",
    size_bytes: PNG.length,
    sha256: IMAGE.sha256,
    ...overrides,
  };
}
async function fixture(t, rows = [row()]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "macro-media-fixture-"));
  t.after(async () => {
    // Only this fresh, explicitly verified fixture directory is removed.
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^macro-media-fixture-/);
    await rm(root, { recursive: true, force: true });
  });
  const options = {
    snapshot: path.join(root, "snapshot.sqlite"),
    mediaRoot: path.join(root, "media"),
    envFile: path.join(root, "fixture.env"),
    output: path.join(root, "descriptor.json"),
  };
  await mkdir(options.mediaRoot);
  const db = new DatabaseSync(options.snapshot);
  db.exec(
    "PRAGMA journal_mode=DELETE; CREATE TABLE media_files(id TEXT PRIMARY KEY,relative_path TEXT,original_filename TEXT,mime_type TEXT,size_bytes INTEGER,sha256 TEXT)",
  );
  const insert = db.prepare("INSERT INTO media_files VALUES(?,?,?,?,?,?)");
  for (const value of rows)
    insert.run(
      value.id,
      value.relative_path,
      value.original_filename,
      value.mime_type,
      value.size_bytes,
      value.sha256,
    );
  db.close();
  await writeFile(
    options.envFile,
    'BLOB_READ_WRITE_TOKEN="synthetic-only-token"\nDATABASE_URL="must-never-be-forwarded"\nMIGRATION_SYNTHETIC_SENTINEL="unchanged"\n',
  );
  for (const value of rows) {
    // Never let a malformed fixture path itself escape the test media root.
    if (/^media\/[a-z0-9-]+\.png$/.test(value.relative_path))
      await writeFile(
        path.join(options.mediaRoot, value.relative_path.slice(6)),
        PNG,
      );
  }
  return {
    root,
    rows,
    options,
    activeWorkspace: path.join(root, "ActiveWorkspace"),
  };
}
function memoryBlob({ failPut = 0, beforePut } = {}) {
  const files = new Map(),
    calls = [];
  let puts = 0;
  const check = (options) => {
    assert.equal(options.token, "synthetic-only-token");
    assert.equal(options.access, "private");
    assert.equal(Object.hasOwn(options, "DATABASE_URL"), false);
  };
  return {
    files,
    calls,
    async get(key, options) {
      check(options);
      calls.push({ method: "get", key });
      const saved = files.get(key);
      if (!saved) return null;
      return {
        statusCode: 200,
        blob: {
          pathname: key,
          size: saved.bytes.length,
          contentType: saved.mime,
        },
        stream: new globalThis.ReadableStream({
          start(controller) {
            controller.enqueue(saved.bytes);
            controller.close();
          },
        }),
      };
    },
    async put(key, bytes, options) {
      check(options);
      puts++;
      calls.push({ method: "put", key });
      assert.equal(options.allowOverwrite, false);
      assert.equal(options.addRandomSuffix, false);
      await beforePut?.(puts);
      if (puts === failPut)
        throw new Error("synthetic-private-error-do-not-print");
      files.set(key, { bytes: Buffer.from(bytes), mime: options.contentType });
      return { pathname: key, contentType: options.contentType };
    },
  };
}
async function rejectsBeforeUpload(
  options,
  code,
  activeWorkspace = path.join(
    os.tmpdir(),
    "macro-migration-nonexistent-fixture-workspace",
  ),
) {
  const blob = memoryBlob();
  await assert.rejects(
    runUpload(options, { blob, activeWorkspace }),
    (error) => error.code === code,
  );
  assert.equal(blob.calls.length, 0);
}

test("valid explicit snapshot uploads exact originals and persists only registration descriptors", async (t) => {
  const value = await fixture(t, [row(), row()]);
  const snapshotBefore = await readFile(value.options.snapshot);
  const blob = memoryBlob({
    beforePut: async (count) => {
      const progress = JSON.parse(await readFile(value.options.output, "utf8"));
      assert.equal(progress.complete, false);
      assert.equal(progress.media.length, count - 1);
      assert.equal(progress.totalBytes, PNG.length * 2);
    },
  });
  assert.deepEqual(
    await runUpload(value.options, {
      blob,
      activeWorkspace: value.activeWorkspace,
    }),
    {
      status: "complete",
      files: 2,
      totalBytes: PNG.length * 2,
    },
  );
  const descriptor = JSON.parse(await readFile(value.options.output, "utf8"));
  assert.deepEqual(Object.keys(descriptor), [
    "version",
    "complete",
    "totalBytes",
    "media",
  ]);
  assert.equal(descriptor.version, 1);
  assert.equal(descriptor.complete, true);
  assert.equal(descriptor.media.length, 2);
  for (const item of descriptor.media) {
    assert.deepEqual(item, {
      id: item.id,
      blobPathname: objectPath(item.id, IMAGE),
      originalFilename: "Prüfung.png",
      ...IMAGE,
    });
    assert.ok(value.rows.some((source) => source.id === item.id));
    assert.deepEqual(blob.files.get(item.blobPathname).bytes, PNG);
    assert.deepEqual(
      await readFile(path.join(value.options.mediaRoot, `${item.id}.png`)),
      PNG,
    );
  }
  assert.deepEqual(await readFile(value.options.snapshot), snapshotBefore);
  assert.equal(
    JSON.stringify(descriptor).includes("synthetic-only-token"),
    false,
  );
  assert.equal(JSON.stringify(descriptor).includes(value.root), false);
  assert.equal(globalThis.process.env.MIGRATION_SYNTHETIC_SENTINEL, undefined);
  if (os.platform() !== "win32")
    assert.equal((await stat(value.options.output)).mode & 0o077, 0);
  for (const suffix of ["-wal", "-shm", "-journal"])
    await assert.rejects(access(`${value.options.snapshot}${suffix}`));
});

test("empty snapshot produces a completed empty descriptor without Blob calls", async (t) => {
  const value = await fixture(t, []),
    blob = memoryBlob();
  assert.deepEqual(
    await runUpload(value.options, {
      blob,
      activeWorkspace: value.activeWorkspace,
    }),
    {
      status: "complete",
      files: 0,
      totalBytes: 0,
    },
  );
  assert.deepEqual(JSON.parse(await readFile(value.options.output, "utf8")), {
    version: 1,
    complete: true,
    totalBytes: 0,
    media: [],
  });
  assert.equal(blob.calls.length, 0);
});

for (const storedPath of [
  "../image.png",
  "media/../image.png",
  "media/sub/../../image.png",
  "media//image.png",
  "media/./image.png",
  "media\\image.png",
  "media/https://example.invalid/a.png",
  "https://example.invalid/a.png",
  "/media/image.png",
  "media/C:/image.png",
  "media/image.png:stream",
  "media/CON.png",
  "media/image.png ",
  "media/",
]) {
  test(`rejects stored path before upload: ${storedPath}`, async (t) => {
    const value = await fixture(t, [row({ relative_path: storedPath })]);
    await rejectsBeforeUpload(value.options, "MEDIA_PATH_UNSAFE");
  });
}

test("rejects a media directory junction instead of following it", async (t) => {
  const value = await fixture(t, [
    row({ relative_path: "media/link/image.png" }),
  ]);
  const other = path.join(value.root, "other");
  await mkdir(other);
  await writeFile(path.join(other, "image.png"), PNG);
  await symlink(
    other,
    path.join(value.options.mediaRoot, "link"),
    os.platform() === "win32" ? "junction" : "dir",
  );
  await rejectsBeforeUpload(value.options, "MEDIA_PATH_UNSAFE");
});

test("rejects a snapshot reached through a directory junction", async (t) => {
  const value = await fixture(t);
  const linked = path.join(value.root, "linked");
  const original = path.join(value.root, "snapshot-dir");
  await mkdir(original);
  await copyFile(
    value.options.snapshot,
    path.join(original, "snapshot.sqlite"),
  );
  await symlink(
    original,
    linked,
    os.platform() === "win32" ? "junction" : "dir",
  );
  await rejectsBeforeUpload(
    { ...value.options, snapshot: path.join(linked, "snapshot.sqlite") },
    "SNAPSHOT_UNSAFE",
  );
});

for (const suffix of ["-wal", "-shm", "-journal"]) {
  test(`rejects closed-looking snapshot with ${suffix}`, async (t) => {
    const value = await fixture(t);
    await writeFile(`${value.options.snapshot}${suffix}`, "");
    await rejectsBeforeUpload(value.options, "SNAPSHOT_NOT_CLOSED");
  });
}

test("rejects WAL-mode header without opening SQLite or creating companions", async (t) => {
  const value = await fixture(t);
  const bytes = await readFile(value.options.snapshot);
  bytes[18] = 2;
  bytes[19] = 2;
  await writeFile(value.options.snapshot, bytes);
  await rejectsBeforeUpload(value.options, "SNAPSHOT_NOT_CLOSED");
  await assert.rejects(access(`${value.options.snapshot}-wal`));
  await assert.rejects(access(`${value.options.snapshot}-shm`));
});

test("rejects a live AppData PersonalMacro path even without companions", async (t) => {
  const value = await fixture(t);
  const target = path.join(
    value.root,
    "AppData",
    "Roaming",
    "com.personal-macro.app",
    "PersonalMacro",
    "database",
  );
  await mkdir(target, { recursive: true });
  const snapshot = path.join(target, "journal.sqlite");
  await copyFile(value.options.snapshot, snapshot);
  await rejectsBeforeUpload(
    { ...value.options, snapshot },
    "SNAPSHOT_UNSAFE",
    path.dirname(target),
  );
});

test("validates every hash before uploading the first original", async (t) => {
  const value = await fixture(t, [row(), row({ sha256: "0".repeat(64) })]);
  await rejectsBeforeUpload(value.options, "MEDIA_INVALID");
  await assert.rejects(access(value.options.output));
});

test("rejects changed file size and unsupported MIME before upload", async (t) => {
  const size = await fixture(t, [row({ size_bytes: PNG.length + 1 })]);
  await rejectsBeforeUpload(size.options, "MEDIA_PATH_UNSAFE");
  const mime = await fixture(t, [row({ mime_type: "image/svg+xml" })]);
  await rejectsBeforeUpload(mime.options, "MEDIA_INVALID");
});

for (const [label, rows] of [
  ["count", Array.from({ length: 101 }, () => row())],
  ["individual size", [row({ size_bytes: 3 * 1024 * 1024 + 1 })]],
  [
    "combined size",
    Array.from({ length: 34 }, () => row({ size_bytes: 3 * 1024 * 1024 })),
  ],
]) {
  test(`rejects excessive ${label} before reading or uploading originals`, async (t) => {
    const value = await fixture(t, rows);
    await rejectsBeforeUpload(value.options, "LIMIT_EXCEEDED");
  });
}

test("rejects repository and active workspace output destinations", async (t) => {
  const value = await fixture(t);
  await rejectsBeforeUpload(
    {
      ...value.options,
      output: fileURLToPath(
        new URL("./never-write-descriptor.json", import.meta.url),
      ),
    },
    "OUTPUT_UNSAFE",
  );
  await rejectsBeforeUpload(
    {
      ...value.options,
      output: path.join(value.activeWorkspace, "descriptor.json"),
    },
    "OUTPUT_UNSAFE",
    value.activeWorkspace,
  );
});

test("allows an explicit closed backup and descriptor in the exact active workspace backup folder", async (t) => {
  const value = await fixture(t),
    blob = memoryBlob();
  const backups = path.join(value.activeWorkspace, "backups");
  const mediaRoot = path.join(value.activeWorkspace, "media");
  await mkdir(backups, { recursive: true });
  await mkdir(mediaRoot);
  const snapshot = path.join(backups, "closed-snapshot.sqlite");
  await copyFile(value.options.snapshot, snapshot);
  for (const item of value.rows)
    await copyFile(
      path.join(value.options.mediaRoot, `${item.id}.png`),
      path.join(mediaRoot, `${item.id}.png`),
    );
  const output = path.join(backups, "descriptor.json");
  assert.deepEqual(
    await runUpload(
      { ...value.options, snapshot, mediaRoot, output },
      { blob, activeWorkspace: value.activeWorkspace },
    ),
    { status: "complete", files: 1, totalBytes: PNG.length },
  );
  assert.equal(JSON.parse(await readFile(output, "utf8")).complete, true);
});

test("a similarly named folder inside the active workspace is not treated as its backup folder", async (t) => {
  const value = await fixture(t);
  await rejectsBeforeUpload(
    {
      ...value.options,
      output: path.join(
        value.activeWorkspace,
        "backups-copy",
        "descriptor.json",
      ),
    },
    "OUTPUT_UNSAFE",
    value.activeWorkspace,
  );
});

test("rejects output through a directory junction", async (t) => {
  const value = await fixture(t),
    target = path.join(value.root, "output-dir"),
    link = path.join(value.root, "output-link");
  await mkdir(target);
  await symlink(target, link, os.platform() === "win32" ? "junction" : "dir");
  await rejectsBeforeUpload(
    { ...value.options, output: path.join(link, "descriptor.json") },
    "OUTPUT_UNSAFE",
  );
});

test("never overwrites an existing output", async (t) => {
  const value = await fixture(t);
  await writeFile(value.options.output, "preserve-existing");
  await rejectsBeforeUpload(value.options, "OUTPUT_EXISTS");
  assert.equal(
    await readFile(value.options.output, "utf8"),
    "preserve-existing",
  );
});

test("partial upload preserves successful descriptors and originals with sanitized error", async (t) => {
  const value = await fixture(t, [row(), row()]),
    blob = memoryBlob({ failPut: 2 });
  await assert.rejects(
    runUpload(value.options, { blob, activeWorkspace: value.activeWorkspace }),
    (error) => {
      assert.equal(error.code, "UPLOAD_FAILED");
      assert.equal(error.message.includes("synthetic-private-error"), false);
      assert.equal(error.message.includes(value.root), false);
      return true;
    },
  );
  const descriptor = JSON.parse(await readFile(value.options.output, "utf8"));
  assert.equal(descriptor.complete, false);
  assert.equal(descriptor.totalBytes, PNG.length * 2);
  assert.equal(descriptor.media.length, 1);
  assert.equal(blob.files.size, 1);
  assert.deepEqual(blob.files.get(descriptor.media[0].blobPathname).bytes, PNG);
});

test("failed remote readback leaves the descriptor incomplete without claiming a verified image", async (t) => {
  const value = await fixture(t),
    blob = memoryBlob();
  const put = blob.put.bind(blob);
  blob.put = async (key, bytes, options) => {
    const result = await put(key, bytes, options);
    blob.files.get(key).bytes[0] ^= 1;
    return result;
  };
  await assert.rejects(
    runUpload(value.options, { blob, activeWorkspace: value.activeWorkspace }),
    (error) => error.code === "UPLOAD_FAILED",
  );
  const descriptor = JSON.parse(await readFile(value.options.output, "utf8"));
  assert.deepEqual(descriptor, {
    version: 1,
    complete: false,
    totalBytes: PNG.length,
    media: [],
  });
  assert.equal(blob.files.size, 1);
});

test("requires every explicit absolute argument", async (t) => {
  const value = await fixture(t);
  for (const key of ["snapshot", "mediaRoot", "envFile", "output"]) {
    await rejectsBeforeUpload(
      { ...value.options, [key]: undefined },
      "ARGUMENTS_INVALID",
    );
    await rejectsBeforeUpload(
      { ...value.options, [key]: "relative-file" },
      "ARGUMENTS_INVALID",
    );
  }
});

test("malformed or missing token file is rejected without output or upload", async (t) => {
  const value = await fixture(t);
  await writeFile(value.options.envFile, "OTHER_FIXTURE_KEY=synthetic");
  await rejectsBeforeUpload(value.options, "ENV_INVALID");
  await assert.rejects(access(value.options.output));
});
