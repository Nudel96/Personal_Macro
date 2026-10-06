import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

// Measure the static dependency closure of each route. Dynamic imports are
// deliberately excluded: they are fetched only when their action is used.
const buildDirectory = process.argv[2];
if (!buildDirectory) {
  throw new Error(
    "Usage: node scripts/bundle-report.mjs <build-directory> [--check]",
  );
}
const root = path.resolve(buildDirectory);
const manifest = JSON.parse(
  await readFile(path.join(root, ".vite/manifest.json"), "utf8"),
);
const roots = {
  entry: "index.html",
  dashboard: "src/features/dashboard/dashboard-page.tsx",
  imports: "src/features/import-export/import-export-page.tsx",
  charts: Object.keys(manifest).find((key) =>
    manifest[key].file.includes("base-chart-"),
  ),
};

function dependencies(key, visited = new Set()) {
  if (!key || visited.has(key)) return visited;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest entry: ${key}`);
  visited.add(key);
  for (const dependency of chunk.imports ?? [])
    dependencies(dependency, visited);
  return visited;
}

const report = {};
for (const [name, key] of Object.entries(roots)) {
  if (!key) throw new Error(`Missing build root: ${name}`);
  const files = [...dependencies(key)].map(
    (dependency) => manifest[dependency].file,
  );
  const assets = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(path.join(root, file));
      return {
        file,
        bytes: content.length,
        gzipBytes: gzipSync(content).length,
      };
    }),
  );
  report[name] = {
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    assets,
  };
}

if (process.argv.includes("--check")) {
  for (const name of ["entry", "dashboard", "imports"]) {
    if (
      report[name].assets.some(({ file }) =>
        /\/(xlsx|document-exports)-/.test(file),
      )
    ) {
      throw new Error(`${name}: XLSX/PDF must remain behind a dynamic import`);
    }
  }
  const chartAsset = report.charts.assets.find(({ file }) =>
    file.includes("/base-chart-"),
  );
  if (!chartAsset || chartAsset.gzipBytes > 275_000) {
    throw new Error("The shared chart artifact exceeds 275 kB gzip");
  }
}
console.log(JSON.stringify(report, null, 2));
