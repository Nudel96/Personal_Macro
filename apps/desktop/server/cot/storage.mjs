import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const MAX_COT_GZIP_BYTES = 3 * 1024 * 1024;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const OBJECT =
  /^public-cache\/v1\/([a-f0-9-]{36})\/([a-f0-9]{64})\.sqlite\.gz$/;
const KEYS = [
  "leaseId",
  "generation",
  "objectPath",
  "transferSha256",
  "transferBytes",
  "dataBase64",
];
const fail = () => new Error("COT_STORAGE_UNAVAILABLE");
function check(value) {
  if (!value) throw fail();
}

function prepared(value) {
  check(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === KEYS.length &&
      Object.keys(value).every((key) => KEYS.includes(key)),
  );
  check(
    UUID.test(value.leaseId) &&
      UUID.test(value.generation) &&
      typeof value.objectPath === "string" &&
      value.objectPath.match(OBJECT)?.[1] === value.generation &&
      HASH.test(value.transferSha256) &&
      Number.isSafeInteger(value.transferBytes) &&
      value.transferBytes > 0 &&
      value.transferBytes <= MAX_COT_GZIP_BYTES &&
      typeof value.dataBase64 === "string" &&
      value.dataBase64.length <= Math.ceil(MAX_COT_GZIP_BYTES / 3) * 4,
  );
  const bytes = Buffer.from(value.dataBase64, "base64");
  check(
    bytes.length === value.transferBytes &&
      bytes.toString("base64") === value.dataBase64 &&
      bytes[0] === 0x1f &&
      bytes[1] === 0x8b &&
      createHash("sha256").update(bytes).digest("hex") === value.transferSha256,
  );
  return bytes;
}

async function verifyStored(sdk, value, bytes, token, signal) {
  check(!signal.aborted);
  const response = await sdk.get(value.objectPath, {
    token,
    access: "private",
    useCache: false,
    abortSignal: signal,
  });
  if (response === null) return false;
  if (
    response.statusCode !== 200 ||
    response.blob?.pathname !== value.objectPath ||
    response.blob?.size !== bytes.length ||
    response.blob?.contentType !== "application/gzip" ||
    !response.stream
  ) {
    await response.stream?.cancel().catch(() => {});
    throw fail();
  }
  const reader = response.stream.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const hash = createHash("sha256");
  let count = 0;
  try {
    for (;;) {
      check(!signal.aborted);
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      check(
        count + chunk.length <= bytes.length &&
          chunk.equals(bytes.subarray(count, count + chunk.length)),
      );
      count += chunk.length;
      hash.update(chunk);
    }
    check(
      !signal.aborted &&
        count === bytes.length &&
        hash.digest("hex") === value.transferSha256,
    );
    return true;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Immutable private upload, including readback after an uncertain put response. */
export async function storePreparedCot(value, dependencies, signal) {
  try {
    const bytes = prepared(value);
    const token = dependencies.env.BLOB_READ_WRITE_TOKEN;
    check(
      typeof token === "string" &&
        token.length >= 20 &&
        token.length <= 4096 &&
        !signal.aborted,
    );
    const sdk = dependencies.blob ?? (await import("@vercel/blob"));
    if (!(await verifyStored(sdk, value, bytes, token, signal))) {
      try {
        const uploaded = await sdk.put(value.objectPath, bytes, {
          token,
          access: "private",
          contentType: "application/gzip",
          addRandomSuffix: false,
          allowOverwrite: false,
          abortSignal: signal,
        });
        check(
          uploaded?.pathname === value.objectPath &&
            uploaded?.contentType === "application/gzip",
        );
      } catch {
        // No overwrite or deletion: the following read resolves concurrent puts/timeouts.
      }
      check(await verifyStored(sdk, value, bytes, token, signal));
    }
    check(!signal.aborted);
    return value.leaseId;
  } catch {
    // Provider exceptions can contain URLs or tokens; only this fixed code escapes.
    throw fail();
  }
}
