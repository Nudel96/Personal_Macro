// Independent Decimal oracle is prepared by evidence/audit_relative_strength.py.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const requireFromVite = createRequire(import.meta.resolve("vite"));
const { build } = requireFromVite("esbuild");
const root = process.cwd();
const out = path.join(root, ".tmp/atlas-remaining-40/relative-audit-module.mjs");
await build({entryPoints:[path.join(root,"src/features/world-atlas/atlas-relative.ts")],outfile:out,bundle:true,platform:"node",format:"esm"});
const { relativePicture, relativeRecipe } = await import(pathToFileURL(out));
const data = JSON.parse(await readFile(path.join(root,".tmp/atlas-remaining-40/relative-original-cache.json"),"utf8"));
let points = 0, maxError = 0;
const checks = [];
for (const e of data.expected) {
  const picture = relativePicture([{market:data.rows[e.proxyId],benchmark:data.rows[e.benchmarkId]}],e.horizon);
  assert(picture, e.proxyId);
  assert.equal(picture.first,e.first);
  assert.equal(picture.last,e.last);
  assert.equal(picture.rows[0].points.length,e.points.length);
  for (const [i,p] of e.points.entries()) {
    const actual=picture.rows[0].points[i];
    assert.equal(actual.month,p.month);
    if (p.value===null) assert.equal(actual.value,null);
    else { assert.notEqual(actual.value,null); const error=Math.abs(actual.value-p.value); maxError=Math.max(maxError,error); assert(error<1e-8,`${e.proxyId} ${p.month}`); }
    points++;
  }
  checks.push({proxyId:e.proxyId,benchmarkId:e.benchmarkId,horizon:e.horizon,first:e.first,last:e.last,points:e.points.length,status:"passed"});
}
const report={checkedAt:new Date().toISOString(),status:"passed",recipe:relativeRecipe,checks,points,maxAbsoluteError:maxError,readOnly:true,newDownloads:0};
await writeFile(path.resolve(root,"../../docs/planning/world-atlas/evidence/relative-strength-original-checks-2026-09-11.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,pairs:checks.length/3,checks:checks.length,points,maxAbsoluteError:maxError}));
