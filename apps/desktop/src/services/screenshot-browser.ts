import type {
  TradeScreenshotInput,
  TradeScreenshotAnalysis,
} from "../types/domain";
import { isPrivateWeb } from "./runtime-mode";
import { getPrivateWebClientState } from "./private-web-client";

let queue: Promise<unknown> = Promise.resolve();
export function screenshotFile(input: TradeScreenshotInput): File {
  if (
    !/\.(png|jpe?g)$/i.test(input.filename) ||
    /[\\/]/.test(input.filename) ||
    Array.from(input.filename).some(
      (c) =>
        c.charCodeAt(0) < 32 ||
        (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
    ) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64) ||
    input.base64.length > 16 * 1024 * 1024
  ) {
    throw {
      code: "VALIDATION_ERROR",
      message: "Die Screenshot-Datei ist ungültig.",
    };
  }
  let decoded: string;
  try {
    decoded = atob(input.base64);
  } catch {
    throw {
      code: "VALIDATION_ERROR",
      message: "Die Screenshot-Datei ist ungültig.",
    };
  }
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const png =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!bytes.length || (!png && !jpeg))
    throw {
      code: "VALIDATION_ERROR",
      message: "Bitte ein PNG- oder JPEG-Original verwenden.",
    };
  return new File([bytes], input.filename, {
    type: png ? "image/png" : "image/jpeg",
  });
}

/** One worker at a time; all image bytes and OCR results stay in browser memory. */
export function analyzeBrowserScreenshot(
  input: TradeScreenshotInput,
): Promise<TradeScreenshotAnalysis> {
  const task = queue.then(async () => {
    if (isPrivateWeb() && getPrivateWebClientState().status !== "ready") {
      throw {
        code: "WEB_AUTH_REQUIRED",
        message: "Öffne zuerst deinen privaten Workspace.",
      };
    }
    const file = screenshotFile(input);
    const url = URL.createObjectURL(file);
    const image = new Image();
    let worker: import("tesseract.js").Worker | undefined;
    try {
      image.src = url;
      await image.decode();
      if (
        !image.naturalWidth ||
        image.naturalWidth > 8192 ||
        image.naturalHeight > 8192 ||
        image.naturalWidth * image.naturalHeight > 16_000_000
      ) {
        throw {
          code: "VALIDATION_ERROR",
          message: "Der Screenshot ist für die Browser-Erkennung zu groß.",
        };
      }
      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker(["eng", "deu"], 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        workerBlobURL: false,
        cacheMethod: "none",
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const lines = (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map((line) => ({
            text: line.text.trim(),
            words: line.words.map((word) => ({
              text: word.text,
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
              height: word.bbox.y1 - word.bbox.y0,
            })),
          })),
        ),
      );
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        language: "eng+deu",
        lines,
      };
    } finally {
      URL.revokeObjectURL(url);
      await worker?.terminate();
    }
  });
  queue = task.catch(() => {});
  return task;
}
