// Explicit private-store roundtrip using generated fixture bytes only.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { get, del } from "@vercel/blob";
import { inspectImage, objectPath } from "./image.mjs";
import { storeOriginal, readOriginal } from "./storage.mjs";

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

async function main() {
  const config = process.env.MACRO_TEST_ENV_FILE;
  if (!config) throw new Error("EXPLICIT_TEST_CONFIG_REQUIRED");
  const env = parseEnv(readFileSync(config, "utf8"));
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
    chunk("IDAT", deflateSync(Buffer.from([0, 100, 120, 140, 255]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const meta = inspectImage(bytes, "image/png");
  const reference = { ...meta, blobPathname: objectPath(randomUUID(), meta) };
  let attempted = false;
  try {
    attempted = true;
    const first = await storeOriginal(
      bytes,
      reference,
      env,
      AbortSignal.timeout(25000),
    );
    const second = await storeOriginal(
      bytes,
      reference,
      env,
      AbortSignal.timeout(25000),
    );
    const read = await readOriginal(reference, env, AbortSignal.timeout(15000));
    if (!first.created || second.created || !read.equals(bytes))
      throw new Error("ROUNDTRIP_FAILED");
    const result = await get(reference.blobPathname, {
      token: env.BLOB_READ_WRITE_TOKEN,
      access: "private",
    });
    await result?.stream?.cancel();
    const anonymous = await fetch(result.blob.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    await anonymous.body?.cancel();
    if (![401, 403, 404].includes(anonymous.status))
      throw new Error("ANONYMOUS_ACCESS_NOT_DENIED");
    console.log(
      JSON.stringify({
        originalBytesVerified: true,
        repeatedUploadReusedOriginal: true,
        anonymousStatus: anonymous.status,
      }),
    );
  } finally {
    // This unpredictable key belongs solely to this probe, including an
    // uncertain upload result. No listing or deletion of any other object.
    if (attempted) {
      await del(reference.blobPathname, { token: env.BLOB_READ_WRITE_TOKEN });
      console.log(JSON.stringify({ ownTestObjectDeleted: true }));
    }
  }
}
main().catch(() => {
  console.error("PRIVATE_BLOB_SMOKE_FAILED");
  process.exitCode = 1;
});
