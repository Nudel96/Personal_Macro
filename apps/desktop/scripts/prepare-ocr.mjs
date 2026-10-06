// Copy reviewed dependencies into the same-origin static build. No remote OCR.
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const engine = dirname(require.resolve("tesseract.js/package.json"));
const engineRequire = createRequire(join(engine, "package.json"));
const core = dirname(engineRequire.resolve("tesseract.js-core/package.json"));
const output = resolve("public/ocr");
await mkdir(output, { recursive: true });
await copyFile(
  join(engine, "dist/worker.min.js"),
  join(output, "worker.min.js"),
);
for (const file of await readdir(core)) {
  if (/^tesseract-core(?:-simd)?(?:-lstm)?\.wasm(?:\.js)?$/.test(file))
    await copyFile(join(core, file), join(output, file));
}
for (const lang of ["eng", "deu"]) {
  const root = dirname(
    require.resolve(`@tesseract.js-data/${lang}/package.json`),
  );
  await copyFile(
    join(root, "4.0.0_best_int", `${lang}.traineddata.gz`),
    join(output, `${lang}.traineddata.gz`),
  );
}
