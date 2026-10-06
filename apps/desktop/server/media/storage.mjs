import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { MAX_MEDIA_BYTES, MediaError } from "./image.mjs";

const PATH =
  /^media\/v1\/[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/[a-f0-9]{64}\.(png|jpg|webp)$/;
export function blobOptions(env, signal) {
  if (
    typeof env.BLOB_READ_WRITE_TOKEN !== "string" ||
    !env.BLOB_READ_WRITE_TOKEN
  )
    throw new MediaError("MEDIA_NOT_CONFIGURED");
  return { token: env.BLOB_READ_WRITE_TOKEN, abortSignal: signal };
}
function checkReference(reference) {
  if (
    !reference ||
    !PATH.test(reference.blobPathname) ||
    reference.blobPathname.includes("\n") ||
    reference.blobPathname.includes("\r") ||
    !Number.isSafeInteger(reference.sizeBytes) ||
    reference.sizeBytes < 1 ||
    reference.sizeBytes > MAX_MEDIA_BYTES ||
    reference.sha256?.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(reference.sha256) ||
    !["image/png", "image/jpeg", "image/webp"].includes(reference.mimeType)
  )
    throw new MediaError("MEDIA_INTEGRITY_ERROR");
}
export async function readOriginal(reference, env, signal, sdk = { get }) {
  checkReference(reference);
  const result = await sdk.get(reference.blobPathname, {
    ...blobOptions(env, signal),
    access: "private",
    // A pre-upload miss can be cached. The immediate integrity readback must
    // observe the authoritative object, including after an uncertain upload.
    useCache: false,
  });
  if (!result) throw new MediaError("MEDIA_NOT_FOUND");
  if (
    result.statusCode !== 200 ||
    result.blob.pathname !== reference.blobPathname ||
    result.blob.size !== reference.sizeBytes ||
    result.blob.contentType !== reference.mimeType
  ) {
    await result.stream?.cancel().catch(() => {});
    throw new MediaError("MEDIA_INTEGRITY_ERROR");
  }
  const reader = result.stream.getReader(),
    parts = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new MediaError("MEDIA_UNAVAILABLE");
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > reference.sizeBytes || size > MAX_MEDIA_BYTES)
        throw new MediaError("MEDIA_INTEGRITY_ERROR");
      parts.push(Buffer.from(part.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(parts, size);
  if (
    size !== reference.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== reference.sha256
  )
    throw new MediaError("MEDIA_INTEGRITY_ERROR");
  return bytes;
}
export async function storeOriginal(
  bytes,
  reference,
  env,
  signal,
  sdk = { get, put },
) {
  checkReference(reference);
  const options = blobOptions(env, signal);
  // Reusing an operation always selects the same unguessable immutable key.
  // This read also resolves an uncertain earlier successful upload safely.
  try {
    await readOriginal(reference, env, signal, sdk);
    return { created: false };
  } catch (error) {
    if (!(error instanceof MediaError && error.code === "MEDIA_NOT_FOUND"))
      throw error;
  }
  try {
    const blob = await sdk.put(reference.blobPathname, bytes, {
      ...options,
      access: "private",
      contentType: reference.mimeType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    if (
      blob.pathname !== reference.blobPathname ||
      blob.contentType !== reference.mimeType
    )
      throw new MediaError("MEDIA_INTEGRITY_ERROR");
    return { created: true };
  } catch {
    // Another retry may have completed the same immutable upload meanwhile.
    try {
      await readOriginal(reference, env, signal, sdk);
      return { created: false };
    } catch {
      throw new MediaError("MEDIA_UPLOAD_PENDING");
    }
  }
}
