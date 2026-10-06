import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";

export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const isMediaId = (value) =>
  typeof value === "string" && value.length === 36 && UUID.test(value);
export class MediaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const invalid = () => new MediaError("MEDIA_INVALID_IMAGE");
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function validateFilename(filename) {
  if (
    typeof filename !== "string" ||
    !filename ||
    Buffer.byteLength(filename) > 255 ||
    Array.from(filename).some((character) => {
      const code = character.charCodeAt(0);
      return (
        code < 32 ||
        (code >= 127 && code <= 159) ||
        character === "/" ||
        character === "\\"
      );
    })
  )
    throw new MediaError("MEDIA_INVALID_REQUEST");
  return filename;
}

function dimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 32768 ||
    height > 32768 ||
    width * height > 40_000_000
  )
    throw invalid();
  return { width, height };
}

function png(bytes) {
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return null;
  let offset = 8,
    shape,
    image = false,
    end = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      type = bytes.toString("ascii", offset + 4, offset + 8);
    if (length > bytes.length - offset - 12) throw invalid();
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
      bytes.readUInt32BE(offset + 8 + length)
    )
      throw invalid();
    if (!shape) {
      if (type !== "IHDR" || length !== 13) throw invalid();
      shape = dimensions(
        bytes.readUInt32BE(offset + 8),
        bytes.readUInt32BE(offset + 12),
      );
    } else if (type === "IHDR") throw invalid();
    if (type === "IDAT" && length > 0) image = true;
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0) throw invalid();
      end = true;
      break;
    }
  }
  if (!shape || !image || !end || offset !== bytes.length) throw invalid();
  return shape;
}

function jpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
    throw invalid();
  let offset = 2,
    shape;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (!shape) throw invalid();
      return shape;
    }
    if (marker === 0xd9 || marker === 0 || marker === 0xd8) throw invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw invalid();
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 8) throw invalid();
      shape = dimensions(
        bytes.readUInt16BE(offset + 5),
        bytes.readUInt16BE(offset + 3),
      );
    }
    offset += length;
  }
  throw invalid();
}

function webp(bytes) {
  if (
    bytes.length < 20 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    return null;
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw invalid();
  let offset = 12,
    shape,
    canvas,
    image = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4),
      length = bytes.readUInt32LE(offset + 4),
      start = offset + 8;
    if (length > bytes.length - start) throw invalid();
    if (type === "VP8X") {
      if (length !== 10 || bytes[start] & 2 || canvas || image || offset !== 12)
        throw invalid(); // no animated payloads or duplicate/late canvas
      canvas = dimensions(
        bytes.readUIntLE(start + 4, 3) + 1,
        bytes.readUIntLE(start + 7, 3) + 1,
      );
    } else if (type === "VP8 ") {
      if (
        image ||
        length < 10 ||
        bytes.toString("hex", start + 3, start + 6) !== "9d012a"
      )
        throw invalid();
      shape = dimensions(
        bytes.readUInt16LE(start + 6) & 0x3fff,
        bytes.readUInt16LE(start + 8) & 0x3fff,
      );
      image = true;
    } else if (type === "VP8L") {
      if (image || length < 5 || bytes[start] !== 0x2f) throw invalid();
      const bits = bytes.readUInt32LE(start + 1);
      shape = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      image = true;
    } else if (type === "ANIM" || type === "ANMF") throw invalid();
    offset = start + length + (length % 2);
  }
  if (
    !shape ||
    !image ||
    offset !== bytes.length ||
    (canvas && (shape.width !== canvas.width || shape.height !== canvas.height))
  )
    throw invalid();
  return shape;
}

/** Header, structural boundaries, declared MIME, size and original-byte hash.
 * No decoder output, metadata stripping, recompression, or image transformation.
 */
export function inspectImage(bytes, declaredMime) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1) throw invalid();
  if (bytes.length > MAX_MEDIA_BYTES) throw new MediaError("MEDIA_TOO_LARGE");
  let result;
  try {
    if (declaredMime === "image/png") result = png(bytes);
    else if (declaredMime === "image/jpeg") result = jpeg(bytes);
    else if (declaredMime === "image/webp") result = webp(bytes);
    else throw new MediaError("MEDIA_UNSUPPORTED_TYPE");
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw invalid();
  }
  if (!result) throw invalid();
  return {
    ...result,
    mimeType: declaredMime,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function uploadIdentity(secret, workspace, operationId, image) {
  const bytes = createHmac("sha256", secret)
    .update(`macro-media-upload-v1\n${workspace}\n${operationId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex"),
    id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { id, blobPathname: objectPath(id, image) };
}

export function objectPath(id, image) {
  if (
    !isMediaId(id) ||
    image.sha256?.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(image.sha256)
  )
    throw new MediaError("MEDIA_INVALID_REQUEST");
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[image.mimeType];
  if (!extension) throw new MediaError("MEDIA_UNSUPPORTED_TYPE");
  return `media/v1/${id}/${image.sha256}.${extension}`;
}
