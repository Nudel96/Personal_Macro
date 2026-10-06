// Static audit of this Dockerfile's deliberately limited ignore syntax.
// This is not a substitute for a real Docker/Linux build. Matching follows
// Docker's last-matching-rule and parent-directory semantics for *, ** and !.
import assert from "node:assert/strict";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ignorePath = path.join(
  root,
  "src-tauri/Dockerfile.private-server.dockerignore",
);
const rules = (await readFile(ignorePath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const include = line.startsWith("!");
    const glob = (include ? line.slice(1) : line).replace(/^\/+|\/+$/g, "");
    assert(
      ![...glob].some((character) => ["?", "[", "]", "\\"].includes(character)),
      "Audit does not implement this ignore syntax",
    );
    let expression = "^";
    for (let i = 0; i < glob.length; i++) {
      if (glob[i] === "*" && glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          expression += "(?:.*/)?";
          i++;
        } else expression += ".*";
      } else if (glob[i] === "*") expression += "[^/]*";
      else expression += glob[i].replace(/[.+^${}()|]/g, "\\$&");
    }
    return { include, pattern: new RegExp(`${expression}$`) };
  });

function ignored(relative) {
  const parts = relative.replaceAll("\\", "/").split("/");
  const candidates = parts.map((_, index) =>
    parts.slice(0, index + 1).join("/"),
  );
  let excluded = false;
  for (const rule of rules) {
    if (candidates.some((candidate) => rule.pattern.test(candidate)))
      excluded = !rule.include;
  }
  return excluded;
}

const allowedFile =
  /^(?:src-tauri\/(?:Cargo\.(?:toml|lock)|build\.rs|src\/(?:[^/]+\/)*[^/]+\.rs|(?:migrations|atlas-migrations|bond-migrations)\/[^/]+\.sql|connectors\/mt5_account_connector\.py)|src\/features\/(?:world-atlas|government-bonds)\/data\/[^/]+\.json)$/;
const admitted = [];
async function inventory(relative = "") {
  for (const entry of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (ignored(name)) continue;
    assert(
      !entry.isSymbolicLink(),
      "A build input must not be a symbolic link",
    );
    if (entry.isDirectory()) await inventory(name);
    else {
      assert(allowedFile.test(name), `Unexpected build input: ${name}`);
      const resolved = await realpath(path.join(root, name));
      const relativeResolved = path.relative(await realpath(root), resolved);
      assert(
        !relativeResolved.startsWith("..") &&
          !path.isAbsolute(relativeResolved),
      );
      admitted.push({ name, bytes: (await lstat(resolved)).size });
    }
  }
}
await inventory();
const included = new Set(admitted.map((item) => item.name));

async function requireInputs(directory, extension) {
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await requireInputs(name, extension);
    else if (entry.name.endsWith(extension))
      assert(included.has(name), `Missing build input: ${name}`);
  }
}
await requireInputs("src-tauri/src", ".rs");
for (const directory of ["migrations", "atlas-migrations", "bond-migrations"]) {
  await requireInputs(`src-tauri/${directory}`, ".sql");
}
for (const directory of ["world-atlas", "government-bonds"]) {
  await requireInputs(`src/features/${directory}/data`, ".json");
}
for (const name of [
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/build.rs",
  "src-tauri/connectors/mt5_account_connector.py",
]) {
  assert(included.has(name), `Missing build input: ${name}`);
}

// The production include_str! contracts must resolve inside the audited context.
let embeddedCatalogues = 0;
for (const file of admitted.filter((item) => item.name.endsWith(".rs"))) {
  const source = await readFile(path.join(root, file.name), "utf8");
  for (const match of source.matchAll(/include_str!\(\s*"([^"]+)"\s*\)/g)) {
    if (
      !match[1].includes("src/features/") &&
      !match[1].includes("connectors/")
    )
      continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file.name), match[1]),
    );
    assert(
      included.has(resolved),
      `Embedded catalogue is missing: ${resolved}`,
    );
    embeddedCatalogues++;
  }
}

const forbidden = [
  ".env",
  ".env.local",
  ".vercel/project.json",
  "node_modules/package/index.js",
  "dist/assets/app.js",
  "dist-private-web/index.html",
  "src-tauri/target/release/server.exe",
  "src-tauri/src/commands/.env.local",
  "src-tauri/src/commands/password.key",
  "src-tauri/src/commands/personal.db",
  "src-tauri/src/commands/personal.db-wal",
  "src-tauri/src/commands/personal.sqlite",
  "src-tauri/src/commands/personal.sqlite-shm",
  "src-tauri/src/commands/personal.sqlite3",
  "src-tauri/src/commands/personal.sqlite3-wal",
  "src-tauri/src/commands/export.json",
  "src-tauri/src/commands/export.csv",
  "src-tauri/src/commands/secret",
  "src-tauri/src/commands/backup.zip",
  "src/features/world-atlas/data/.env.local.json",
  "src/features/world-atlas/data/personal.sqlite",
  "src/features/world-atlas/data/credentials.pem",
  "src/features/world-atlas/data/export.csv",
  "src-tauri/src/commands/node_modules/private.rs",
  "src-tauri/src/commands/target/private.rs",
  "src-tauri/src/commands/backups/private.rs",
  "src-tauri/src/commands/exports/private.rs",
  "src-tauri/src/commands/imports/private.rs",
  "src-tauri/src/commands/.tmp/private.rs",
  "server/deployment/server.env.example",
  "server/deployment/actual-secrets.env",
];
for (const candidate of forbidden)
  assert(ignored(candidate), `Unsafe context rule: ${candidate}`);

console.log(
  JSON.stringify(
    {
      staticAuditPassed: true,
      dockerEngineValidated: false,
      files: admitted.length,
      bytes: admitted.reduce((total, item) => total + item.bytes, 0),
      embeddedCatalogues,
      forbiddenProbes: forbidden.length,
    },
    null,
    2,
  ),
);
