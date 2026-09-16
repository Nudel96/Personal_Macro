// Run from apps/desktop: node scripts/audit-atlas-topic-routes.mjs
// Uses the existing Vite/esbuild dependency; no network, provider calls or user data.
import assert from "node:assert/strict";
import { log } from "node:console";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromVite = createRequire(import.meta.resolve("vite"));
const { build } = requireFromVite("esbuild");
const temporary = path.join(
  root,
  ".tmp/atlas-validation/topic-route-audit-module.mjs",
);
await mkdir(path.dirname(temporary), { recursive: true });
await build({
  stdin: {
    contents: `export { atlasCatalog } from './atlas-catalog';
      export { coverageOptions } from './atlas-coverage';
      export { atlasContextGuides } from './atlas-context-guides';
      export { cycleHypothesis } from './atlas-cycle-hypotheses';
      export { atlasTopicResearch, topicResearchSources, topicResearchReviewedAt } from './atlas-topic-research';`,
    resolveDir: path.join(root, "src/features/world-atlas"),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: temporary,
});
const {
  atlasCatalog: catalog,
  coverageOptions,
  atlasContextGuides,
  cycleHypothesis,
  atlasTopicResearch,
  topicResearchSources,
  topicResearchReviewedAt,
} = await import(pathToFileURL(temporary));
const options = new Map();
const blank = {
  series: {},
  demography: {},
  history: {},
  energy: {},
  markets: {},
};
for (const area of catalog.geographies) {
  for (const option of coverageOptions(area.id, blank)) {
    const families = options.get(option.topicId) ?? new Set();
    families.add(option.family);
    options.set(option.topicId, families);
  }
}
const topics = catalog.topics.map((topic) => {
  const guide = atlasContextGuides.find((guide) => guide.topicId === topic.id);
  const families = [...(options.get(topic.id) ?? [])].sort();
  return {
    id: topic.id,
    label: topic.label,
    groupId: topic.groupId,
    families,
    route: families.length
      ? "numeric_perspective"
      : guide?.research
        ? "source_review"
        : guide
          ? "context_guide"
          : cycleHypothesis(topic.id)
            ? "theory"
            : "unresolved",
    researchSourceIds: guide?.research?.sourceIds ?? [],
    contextTargets: guide?.links.map((link) => link.target) ?? [],
  };
});
assert.deepEqual(
  topics.filter((topic) => topic.route === "unresolved"),
  [],
);
assert.equal(
  new Set(catalog.topics.map((topic) => topic.id)).size,
  topics.length,
);
for (const topic of atlasTopicResearch)
  assert(
    !options.has(topic.topicId),
    `Source review masks numeric route: ${topic.topicId}`,
  );
const codeHashes = {};
for (const file of [
  "atlas-topic-research.ts",
  "atlas-context-guides.ts",
  "atlas-context-panel.tsx",
  "atlas-coverage.ts",
  "atlas-findex.ts",
  "world-atlas-page.tsx",
  "data/catalog.json",
  "data/findex-catalog.json",
]) {
  codeHashes[file] = createHash("sha256")
    .update(await readFile(path.join(root, "src/features/world-atlas", file)))
    .digest("hex");
}
const report = {
  checkedAt: new Date().toISOString(),
  catalogVersion: catalog.version,
  scope:
    "Routing and editorial source review, not a proof of numeric availability in every area or completed native acceptance.",
  geographyCount: catalog.geographies.length,
  topicCount: topics.length,
  counts: Object.fromEntries(
    [
      "numeric_perspective",
      "context_guide",
      "source_review",
      "theory",
      "unresolved",
    ].map((route) => [
      route,
      topics.filter((topic) => topic.route === route).length,
    ]),
  ),
  groups: catalog.groups.map((group) => ({
    id: group.id,
    label: group.label,
    topics: topics
      .filter((topic) => topic.groupId === group.id)
      .map((topic) => topic.id),
  })),
  sourceReviewDate: topicResearchReviewedAt,
  sources: topicResearchSources,
  codeHashes,
  topics,
};
await writeFile(
  path.resolve(
    root,
    "../../docs/planning/world-atlas/evidence/topic-route-audit.json",
  ),
  JSON.stringify(report, null, 2) + "\n",
);
log(
  JSON.stringify({
    topics: topics.length,
    groups: report.groups.length,
    sources: Object.keys(report.sources).length,
    contextLinks: topics.reduce(
      (count, topic) => count + topic.contextTargets.length,
      0,
    ),
    ...report.counts,
  }),
);
