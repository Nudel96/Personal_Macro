// Explicit initial-import helper. The caller supplies original bytes and the
// matching existing metadata; this module never discovers files or opens a DB.
import { Buffer } from "node:buffer";
import {
  inspectImage,
  objectPath,
  validateFilename,
  MediaError,
} from "./image.mjs";
import { readOriginal, storeOriginal } from "./storage.mjs";

export async function uploadExistingMedia({
  bytes,
  record,
  env,
  signal,
  blob,
}) {
  const original = Buffer.from(bytes);
  const image = inspectImage(original, record.mimeType);
  validateFilename(record.originalFilename);
  if (image.sha256 !== record.sha256 || image.sizeBytes !== record.sizeBytes)
    throw new MediaError("MEDIA_INTEGRITY_ERROR");
  const input = {
    id: record.id,
    blobPathname: objectPath(record.id, image),
    originalFilename: record.originalFilename,
    ...image,
  };
  const saved = await storeOriginal(original, input, env, signal, blob);
  // An initial activation may trust only bytes read back from the private store,
  // including a just-created object; put metadata alone is not an integrity proof.
  const persisted = await readOriginal(input, env, signal, blob);
  if (!persisted.equals(original))
    throw new MediaError("MEDIA_INTEGRITY_ERROR");
  // Pass this descriptor to media::register in the import transaction. It does
  // not modify original relative paths, dates, dimensions, or annotation data.
  return { input, created: saved.created };
}
