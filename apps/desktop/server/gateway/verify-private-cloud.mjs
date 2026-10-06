// Read-only acceptance check of an explicitly configured imported workspace.
// The Rust service is reachable only on loopback and still requires HMAC.
// It does not expose a browser gateway or modify personal journal records.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { parseEnv } from "node:util";
import { URL } from "node:url";
import { handleGatewayRequest } from "./index.mjs";
import { handleMediaRequest } from "../media/index.mjs";
const { fetch, Request, AbortSignal } = globalThis;

async function reservePort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done, fail) =>
    server.close((error) => (error ? fail(error) : done())),
  );
  return port;
}

let running;
let stage = "configuration";
async function main() {
  assert.ok(
    process.env.MACRO_VERIFY_ENV_FILE && process.env.MACRO_VERIFY_RUNTIME_FILE,
  );
  const database = parseEnv(
    readFileSync(process.env.MACRO_VERIFY_ENV_FILE, "utf8"),
  );
  const runtime = parseEnv(
    readFileSync(process.env.MACRO_VERIFY_RUNTIME_FILE, "utf8"),
  );
  const origin = runtime.MACRO_WEB_ORIGINS;
  assert.ok(origin.startsWith("https://") && !origin.includes(","));
  const port = await reservePort();
  const loopback = `http://127.0.0.1:${port}`;
  const backend = "https://private-runtime-acceptance.invalid";
  const osEnv = Object.fromEntries(
    ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG"]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  let startFailed = false;
  stage = "service-start";
  running = spawn(
    resolve("src-tauri/target/debug/personal-macro-cloud.exe"),
    [],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...osEnv,
        DATABASE_URL: database.DATABASE_URL,
        BLOB_READ_WRITE_TOKEN: database.BLOB_READ_WRITE_TOKEN,
        ...runtime,
        MACRO_BIND_HOST: "127.0.0.1",
        PORT: String(port),
      },
    },
  );
  running.once("error", () => {
    startFailed = true;
  });
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    assert.ok(!startFailed && running.exitCode === null);
    try {
      const response = await fetch(`${loopback}/session`, {
        redirect: "manual",
        signal: AbortSignal.timeout(500),
      });
      ready = response.status === 401;
      await response.body?.cancel();
      if (ready) break;
    } catch {
      /* bounded startup readiness polling */
    }
    await delay(150);
  }
  assert.ok(ready);
  const env = {
    ...runtime,
    BLOB_READ_WRITE_TOKEN: database.BLOB_READ_WRITE_TOKEN,
    VERCEL: "1",
    MACRO_BACKEND_ORIGIN: backend,
  };
  const dependencies = {
    env,
    fetch: async (url, init) => {
      const target = new URL(url);
      assert.equal(target.origin, backend);
      assert.ok(
        ["/session", "/commands", "/media/commands"].includes(target.pathname),
      );
      return fetch(loopback + target.pathname, { ...init, redirect: "manual" });
    },
  };
  stage = "signed-session";
  const sessionResponse = await handleGatewayRequest(
    new Request(`${origin}/api/session`),
    "session",
    dependencies,
  );
  assert.equal(sessionResponse.status, 200);
  const cookie = sessionResponse.headers.get("set-cookie").split(";")[0];
  const session = await sessionResponse.json();
  assert.equal(session.authenticated, true);
  assert.equal(session.workspaceId, runtime.MACRO_WORKSPACE_ID);
  assert.ok(session.capabilities.includes("upload_private_media"));
  const initialRevision = session.revision;
  async function read(command, args = {}) {
    const response = await handleGatewayRequest(
      new Request(`${origin}/api/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookie,
          "Sec-Fetch-Site": "same-origin",
          "X-Macro-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({
          workspaceId: session.workspaceId,
          command,
          args,
        }),
      }),
      "commands",
      dependencies,
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.revision, initialRevision);
    return result.data;
  }
  stage = "bootstrap";
  const bootstrap = await read("get_bootstrap_data");
  assert.ok(bootstrap.accounts.length > 0);
  stage = "private-images";
  const media = await read("list_media");
  let verifiedImages = 0;
  for (const row of media) {
    assert.equal(row.absolutePath, `/api/media?id=${row.id}`);
    const denied = await handleMediaRequest(
      new Request(`${origin}${row.absolutePath}`),
      dependencies,
    );
    assert.equal(denied.status, 401);
    const response = await handleMediaRequest(
      new Request(`${origin}${row.absolutePath}`, {
        headers: { Cookie: cookie, "Sec-Fetch-Site": "same-origin" },
      }),
      dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.arrayBuffer()).byteLength, row.sizeBytes);
    verifiedImages++;
  }
  let marketVerified;
  if (process.env.MACRO_VERIFY_REQUIRE_MARKET === "1") {
    stage = "rates-snapshot";
    assert.ok(session.capabilities.includes("get_policy_rates"));
    const rates = await read("get_policy_rates");
    assert.equal(rates.automation.enabled, false);
    assert.equal(rates.automation.nextRefreshAt, null);
    assert.ok(rates.rates.length > 0);
    stage = "seasonality-index";
    const dashboard = await read("get_seasonality");
    assert.ok(dashboard.assets.length > 0 && dashboard.cloudGeneration);
    const categories = [
      ...new Set(dashboard.assets.map((row) => row.category)),
    ];
    const representatives = categories.map(
      (category) =>
        dashboard.assets
          .filter((row) => row.category === category)
          .sort((left, right) => right.completeYears - left.completeYears)[0],
    );
    let maximumAnalysisMs = 0;
    for (const selected of representatives) {
      stage = "seasonality-analysis";
      const started = Date.now();
      const analysis = await read("analyze_seasonality", {
        generation: dashboard.cloudGeneration,
        input: {
          symbol: selected.symbol,
          referenceDate: "09-25",
          yearFilter: { endingDigits: [], includeYears: [], excludeYears: [] },
          windowTradingDays: 20,
        },
      });
      assert.equal(analysis.symbol, selected.symbol);
      maximumAnalysisMs = Math.max(maximumAnalysisMs, Date.now() - started);
    }
    assert.equal(rates.cloudGeneration, dashboard.cloudGeneration);
    marketVerified = {
      rates: rates.rates.length,
      seasonalityAssets: dashboard.assets.length,
      analysesVerified: representatives.length,
      maximumAnalysisMs,
    };
  }
  console.log(
    JSON.stringify({
      signedServiceVerified: true,
      unauthenticatedServiceDenied: true,
      accounts: bootstrap.accounts.length,
      imagesVerified: verifiedImages,
      unauthenticatedImagesDenied: true,
      journalRevisionUnchanged: true,
      marketVerified,
    }),
  );
}
try {
  await main();
} catch {
  console.error(JSON.stringify({ ok: false, stage }));
  process.exitCode = 1;
} finally {
  running?.kill();
}
