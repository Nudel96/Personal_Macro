// Explicit integration check against an already-built private server binary.
// All state is synthetic and confined to this run's OS temporary directory.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { handleGatewayRequest } from "./index.mjs";

const WEB_ORIGIN = "https://gateway.integration.test";
const BACKEND_ORIGIN = "https://backend.integration.test";
const workspaceId = `integration-${randomUUID()}`;
const secret = randomBytes(32).toString("hex");
const binary = resolve(
  process.env.MACRO_SERVER_BINARY ??
    fileURLToPath(
      new URL(
        `../../src-tauri/target/debug/personal-macro-server${process.platform === "win32" ? ".exe" : ""}`,
        import.meta.url,
      ),
    ),
);
const temporaryParent = resolve(tmpdir());
let temporaryRoot;
let running;
let loopbackOrigin;
let childStartError = false;
let signedSessionReplay;
let stage = "locate the built server";

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function startServer() {
  const port = await reservePort();
  loopbackOrigin = `http://127.0.0.1:${port}`;
  const childEnv = {};
  // Preserve only basic OS runtime lookup, never personal provider credentials.
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "LANG",
  ]) {
    if (process.env[key] !== undefined) childEnv[key] = process.env[key];
  }
  childStartError = false;
  running = spawn(binary, [], {
    windowsHide: true,
    cwd: temporaryRoot,
    env: {
      ...childEnv,
      MACRO_DATA_ROOT: temporaryRoot,
      MACRO_WORKSPACE_ID: workspaceId,
      MACRO_GATEWAY_SECRET: secret,
      MACRO_LISTEN_ADDR: `127.0.0.1:${port}`,
    },
    stdio: "ignore",
  });
  running.once("error", () => {
    childStartError = true;
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (childStartError || running.exitCode !== null)
      throw new Error("Synthetic backend could not start.");
    try {
      const response = await globalThis.fetch(`${loopbackOrigin}/session`, {
        redirect: "manual",
        signal: globalThis.AbortSignal.timeout(500),
      });
      if (response.status === 401) {
        await response.body?.cancel();
        return;
      }
      await response.body?.cancel();
    } catch {
      // The listener may not be ready while migrations initialize.
    }
    await delay(100);
  }
  throw new Error("Synthetic backend startup timed out.");
}

async function stopServer() {
  const child = running;
  running = undefined;
  if (
    !child ||
    !child.pid ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(3_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
  if (child.exitCode === null && child.signalCode === null)
    throw new Error("Synthetic backend did not stop.");
}

const dependencies = {
  env: {
    VERCEL: "1",
    MACRO_BACKEND_ORIGIN: BACKEND_ORIGIN,
    MACRO_WEB_ORIGINS: WEB_ORIGIN,
    MACRO_WORKSPACE_ID: workspaceId,
    MACRO_GATEWAY_SECRET: secret,
  },
  deadlineMs: 15_000,
  async fetch(url, init) {
    // This substitution exists ONLY in the explicit smoke script. Production
    // gateway configuration still rejects every non-HTTPS backend origin.
    const requested = new URL(url);
    assert.equal(requested.origin, BACKEND_ORIGIN);
    assert.ok(["/session", "/commands"].includes(requested.pathname));
    assert.equal(requested.search, "");
    if (requested.pathname === "/session" && !signedSessionReplay) {
      signedSessionReplay = {
        method: init.method,
        headers: { ...init.headers },
        redirect: "manual",
      };
    }
    return globalThis.fetch(`${loopbackOrigin}${requested.pathname}`, init);
  },
};

async function session() {
  const response = await handleGatewayRequest(
    new globalThis.Request(`${WEB_ORIGIN}/api/session`),
    "session",
    dependencies,
  );
  assert.equal(
    response.status,
    200,
    "Gateway must initialize through the actual signed Rust endpoint.",
  );
  const value = await response.json();
  assert.equal(value.workspaceId, workspaceId);
  assert.equal(value.authenticated, true);
  return {
    ...value,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}

async function command(browser, value, headers = {}) {
  const request = new globalThis.Request(`${WEB_ORIGIN}/api/commands`, {
    method: "POST",
    headers: {
      Origin: WEB_ORIGIN,
      "Content-Type": "application/json",
      Cookie: browser.cookie,
      "X-Macro-CSRF-Token": browser.csrfToken,
      ...headers,
    },
    body: JSON.stringify({ workspaceId, ...value }),
  });
  const response = await handleGatewayRequest(
    request,
    "commands",
    dependencies,
  );
  return { status: response.status, value: await response.json() };
}

async function cleanup() {
  await stopServer();
  if (!temporaryRoot) return;
  const target = resolve(temporaryRoot);
  // Never recursively remove a computed path without checking its exact parent
  // and this task's unique mkdtemp prefix first.
  assert.equal(dirname(target), temporaryParent);
  assert.ok(basename(target).startsWith("macro-gateway-smoke-"));
  assert.notEqual(target, temporaryParent);
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

try {
  assert.ok(
    (await stat(binary)).isFile(),
    "Build the private server binary before running this smoke check.",
  );
  temporaryRoot = await mkdtemp(join(temporaryParent, "macro-gateway-smoke-"));
  stage = "start the synthetic server";
  await startServer();

  stage = "initialize browser sessions";
  const firstBrowser = await session();
  const staleBrowser = await session();
  assert.equal(firstBrowser.revision, 0);
  assert.equal(staleBrowser.revision, 0);

  const operation = {
    command: "create_tag",
    args: {
      input: { name: "Synthetic gateway integration", color: "#ffffff" },
    },
    operationId: randomUUID(),
    expectedRevision: 0,
  };
  stage = "reject invalid browser boundaries";
  const forbidden = await command(firstBrowser, operation, {
    Origin: "https://untrusted.integration.test",
  });
  assert.equal(forbidden.status, 403);
  const missingCsrf = await command(firstBrowser, operation, {
    "X-Macro-CSRF-Token": "",
  });
  assert.equal(missingCsrf.status, 403);
  const wrongWorkspace = await command(firstBrowser, {
    ...operation,
    workspaceId: "another-workspace",
  });
  assert.equal(wrongWorkspace.status, 400);

  stage = "write and replay one operation";
  const created = await command(firstBrowser, operation);
  assert.equal(created.status, 200);
  assert.equal(created.value.ok, true);
  assert.equal(created.value.revision, 1);
  const repeated = await command(firstBrowser, operation);
  assert.deepEqual(
    repeated,
    created,
    "Repeating the same operation must return its saved result exactly once.",
  );

  stage = "reject a stale browser";
  const stale = await command(staleBrowser, {
    ...operation,
    operationId: randomUUID(),
    args: { input: { name: "Should not exist" } },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.value.error.code, "REVISION_CONFLICT");
  assert.equal(
    stale.value.revision,
    undefined,
    "An upstream HTTP rejection must not advance the browser revision.",
  );

  stage = "reject an invalid backend signature";
  const invalidSignature = await globalThis.fetch(`${loopbackOrigin}/session`, {
    headers: {
      "X-Macro-Timestamp": String(Math.floor(Date.now() / 1000)),
      "X-Macro-Nonce": randomUUID(),
      "X-Macro-Signature": "00".repeat(32),
    },
    redirect: "manual",
  });
  assert.equal(invalidSignature.status, 401);
  await invalidSignature.body?.cancel();

  stage = "restart the synthetic server";
  await stopServer();
  await startServer();
  stage = "verify durable nonce replay rejection";
  assert.ok(
    Math.abs(
      Math.floor(Date.now() / 1000) -
        Number(signedSessionReplay.headers["X-Macro-Timestamp"]),
    ) < 60,
    "The replay test must stay inside the signature acceptance window.",
  );
  const replayedSignature = await globalThis.fetch(
    `${loopbackOrigin}/session`,
    signedSessionReplay,
  );
  assert.equal(replayedSignature.status, 401);
  await replayedSignature.body?.cancel();
  stage = "verify durable revision, receipt and data";
  const restartedBrowser = await session();
  assert.equal(restartedBrowser.revision, 1);
  assert.deepEqual(
    await command(restartedBrowser, operation),
    created,
    "Idempotency receipt must survive process restart.",
  );
  const bootstrap = await command(restartedBrowser, {
    command: "get_bootstrap_data",
    args: {},
  });
  assert.equal(bootstrap.value.ok, true);
  assert.equal(bootstrap.value.revision, 1);
  const tags = bootstrap.value.data.tags;
  assert.equal(
    tags.filter((tag) => tag.name === "Synthetic gateway integration").length,
    1,
  );
  assert.equal(tags.filter((tag) => tag.name === "Should not exist").length, 0);
  assert.equal(bootstrap.value.data.databasePath, "");
  assert.equal(bootstrap.value.data.appDataPath, "");
  process.stdout.write(
    "Gateway/Rust integration passed: signed session, CSRF and origin rejection, single durable write, stale-device conflict, bad-signature rejection, restart persistence.\n",
  );
} catch (error) {
  // Do not print request objects, process environments, backend output or keys.
  process.stderr.write(
    `Gateway/Rust integration failed during ${stage}: ${error instanceof assert.AssertionError ? "a contract assertion did not match" : "the synthetic test could not complete"}.\n`,
  );
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch {
    process.stderr.write(
      "Synthetic integration cleanup could not finish; temporary files were retained.\n",
    );
    process.exitCode = 1;
  }
}
