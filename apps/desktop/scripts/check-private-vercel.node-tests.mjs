import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectProject,
  parseArguments,
  runPreflight,
} from "./check-private-vercel.mjs";

const ids = { projectId: "prj_testProject", teamId: "team_testTeam" };
const args = ["--project-id", ids.projectId, "--team-id", ids.teamId];
const env = { VERCEL_TOKEN: "synthetic-test-token" };
const owner = { uid: "testUser", role: "OWNER", confirmed: true };
const project = () => ({
  id: ids.projectId,
  accountId: ids.teamId,
  ssoProtection: { deploymentType: "all" },
  publicSource: false,
  directoryListing: false,
  protectionBypass: {},
  passwordProtection: null,
  trustedIps: null,
  optionsAllowlist: { paths: [] },
  trustedSources: {
    enableVercelCiSameRepository: false,
    projects: {},
    oidcProviders: {},
  },
});
const page = (members = [owner], next = null) => ({
  members,
  emailInviteCodes: [],
  pagination: {
    count: members.length,
    hasNext: next !== null,
    next,
    prev: null,
  },
});
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

function fixture({
  settings = project(),
  pages = [page()],
  user = { user: { id: owner.uid } },
} = {}) {
  const requests = [];
  let memberPage = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const path = new URL(url).pathname;
    if (path === "/v2/user") return json(user);
    if (path === `/v9/projects/${ids.projectId}`) return json(settings);
    if (path === `/v3/teams/${ids.teamId}/members`)
      return json(pages[memberPage++]);
    throw new Error("Unexpected request");
  };
  return { requests, fetchImpl };
}

test("requires explicit immutable IDs and rejects CLI credentials, duplicate flags, and path injection", () => {
  assert.deepEqual(parseArguments(args), ids);
  for (const invalid of [
    [],
    ["--project-id", "my-project", "--team-id", ids.teamId],
    [...args, "--token", "secret"],
    [...args, "--team-id", ids.teamId],
    ["--project-id", "prj_x/../../user", "--team-id", ids.teamId],
    ["--help", ...args],
  ]) {
    assert.throws(() => parseArguments(invalid));
  }
});

test("makes only fixed-origin GETs with redirect refusal and never returns authentication or provider payloads", async () => {
  const settings = project();
  settings.env = [{ value: "synthetic-provider-secret" }];
  const mock = fixture({
    settings,
    user: { user: { id: owner.uid, email: "private@example.invalid" } },
  });
  const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
  assert.equal(mock.requests.length, 3);
  for (const { url, options } of mock.requests) {
    assert.equal(new URL(url).origin, "https://api.vercel.com");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${env.VERCEL_TOKEN}`);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.body, undefined);
  }
  const output = JSON.stringify(result);
  for (const value of [
    env.VERCEL_TOKEN,
    "synthetic-provider-secret",
    "private@example.invalid",
    owner.uid,
  ]) {
    assert.ok(!output.includes(value));
  }
});

test("even complete selected API checks leave alias, sharing, and real access review open", async () => {
  const mock = fixture();
  const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
  assert.equal(result.exitCode, 2);
  assert.equal(result.report.status, "review-required");
  assert.equal(result.report.readyForDeployment, false);
  assert.ok(result.report.checks.every((check) => check.status === "passed"));
  assert.equal(result.report.remainingReview.length, 3);
  assert.ok(
    result.report.remainingReview.every(
      (check) => check.status === "unverified",
    ),
  );
  assert.deepEqual(result.report.membership, { count: 1, pagesRead: 1 });
});

test("missing publicSource and bypass proof cannot become a successful check", () => {
  const settings = project();
  delete settings.publicSource;
  delete settings.protectionBypass;
  const checks = inspectProject(settings, ids);
  for (const id of ["public_source", "automation_bypass"]) {
    assert.equal(checks.find((check) => check.id === id).status, "unverified");
  }
});

test("fails restricted protection, public sources, wrong ownership, and every configured alternative access path", () => {
  const cases = [
    [
      "authentication_all",
      "ssoProtection",
      { deploymentType: "prod_deployment_urls_and_all_previews" },
    ],
    ["public_source", "publicSource", true],
    ["directory_listing", "directoryListing", true],
    ["project_scope", "accountId", "team_otherTeam"],
    ["project_scope", "id", "prj_otherProject"],
    [
      "automation_bypass",
      "protectionBypass",
      { syntheticBypass: { scope: "automation-bypass" } },
    ],
    ["password_access", "passwordProtection", {}],
    [
      "trusted_ips",
      "trustedIps",
      { deploymentType: "all", protectionMode: "exclusive", addresses: [] },
    ],
    ["options_allowlist", "optionsAllowlist", { paths: [{ value: "/api" }] }],
    [
      "trusted_sources",
      "trustedSources",
      { enableVercelCiSameRepository: true, projects: {}, oidcProviders: {} },
    ],
    [
      "trusted_sources",
      "trustedSources",
      {
        enableVercelCiSameRepository: false,
        projects: { prj_other: {} },
        oidcProviders: {},
      },
    ],
    [
      "trusted_sources",
      "trustedSources",
      {
        enableVercelCiSameRepository: false,
        projects: {},
        oidcProviders: { issuer: [] },
      },
    ],
  ];
  for (const [id, key, value] of cases) {
    const checks = inspectProject({ ...project(), [key]: value }, ids);
    assert.equal(checks.find((check) => check.id === id).status, "failed", id);
  }
});

test("omitted trusted source configuration is not evidence that default CI access is disabled", () => {
  for (const value of [
    undefined,
    null,
    {},
    { projects: {}, oidcProviders: {} },
  ]) {
    const check = inspectProject(
      { ...project(), trustedSources: value },
      ids,
    ).find((entry) => entry.id === "trusted_sources");
    assert.equal(check.status, "unverified");
  }
});

test("follows all pages without role filters and detects an additional pending member", async () => {
  const mock = fixture({
    pages: [
      page([owner], 1000),
      page([{ uid: "pendingUser", role: "MEMBER", confirmed: false }]),
    ],
  });
  const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
  assert.equal(result.exitCode, 1);
  assert.equal(
    result.report.checks.find((check) => check.id === "sole_owner").status,
    "failed",
  );
  assert.deepEqual(result.report.membership, { count: 2, pagesRead: 2 });
  const memberRequests = mock.requests.slice(2).map(({ url }) => new URL(url));
  assert.equal(memberRequests[1].searchParams.get("until"), "1000");
  assert.ok(
    memberRequests.every(
      (url) => !url.searchParams.has("role") && !url.searchParams.has("search"),
    ),
  );
});

test("requires sole owner identity and explicit confirmation", async () => {
  for (const members of [
    [],
    [{ ...owner, uid: "someoneElse" }],
    [{ ...owner, role: "MEMBER" }],
    [{ ...owner, confirmed: false }],
    [{ uid: owner.uid, role: "OWNER" }],
  ]) {
    const mock = fixture({ pages: [page(members)] });
    const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
    assert.equal(result.exitCode, 1);
    assert.equal(
      result.report.checks.find((check) => check.id === "sole_owner").status,
      "failed",
    );
  }
});

test("email invitations block review; missing invitation data remains unverified", async () => {
  for (const invites of [
    [{ email: "invite@example.invalid", id: "syntheticInvitation" }],
    undefined,
  ]) {
    const mock = fixture({ pages: [{ ...page(), emailInviteCodes: invites }] });
    const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
    assert.equal(result.exitCode, invites ? 1 : 2);
    assert.equal(
      result.report.checks.find((check) => check.id === "team_invitations")
        .status,
      invites ? "failed" : "unverified",
    );
    assert.ok(!JSON.stringify(result).includes("invite@example.invalid"));
  }
});

test("incomplete, cyclic, duplicate, and contradictory pagination all fail closed", async () => {
  const malformed = [
    [{ ...page(), pagination: undefined }],
    [{ ...page(), pagination: { count: 1, hasNext: false } }],
    [{ ...page(), pagination: { count: 2, hasNext: false, next: null } }],
    [{ ...page(), pagination: { count: 1, hasNext: false, next: 1000 } }],
    [page([owner], 1000), page([{ uid: "other" }], 1000)],
    [page([owner], 1000), page([owner])],
    [page([], 1000)],
  ];
  for (const pages of malformed) {
    const mock = fixture({ pages });
    const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
    assert.equal(result.exitCode, 1);
    assert.ok(result.report.errorCode.startsWith("MEMBERS_"));
    assert.equal(result.report.membership, undefined);
  }
});

test("accepts the live counted single-page shape while leaving absent invitations unverified", async () => {
  const mock = fixture({
    pages: [{ members: [owner], pagination: {}, totalCount: 1 }],
  });
  const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.report.membership, { count: 1, pagesRead: 1 });
  assert.equal(
    result.report.checks.find((check) => check.id === "sole_owner").status,
    "passed",
  );
  assert.equal(
    result.report.checks.find((check) => check.id === "team_invitations")
      .status,
    "unverified",
  );
});

test("never infers complete membership from empty pagination without an exact bounded total", async () => {
  const members = [owner];
  for (const data of [
    { members, pagination: {} },
    { members, pagination: {}, totalCount: 0 },
    { members, pagination: {}, totalCount: 2 },
    { members, pagination: {}, totalCount: "1" },
    { members, pagination: { next: 1000 }, totalCount: 1 },
    {
      members: Array.from({ length: 100 }, (_, i) => ({
        ...owner,
        uid: `member${i}`,
      })),
      pagination: {},
      totalCount: 100,
    },
  ]) {
    const mock = fixture({ pages: [data] });
    const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.errorCode, "MEMBERS_PAGINATION_UNPROVEN");
    assert.equal(result.report.membership, undefined);
  }
});

test("bounds pagination and does not treat the page limit as a completed membership inventory", async () => {
  const pages = Array.from({ length: 20 }, (_, i) =>
    page([{ ...owner, uid: `member${i}` }], 1000 - i),
  );
  const mock = fixture({ pages });
  const result = await runPreflight({ args, env, fetchImpl: mock.fetchImpl });
  assert.equal(result.report.errorCode, "MEMBERS_PAGE_LIMIT_REACHED");
  assert.equal(result.exitCode, 1);
  assert.equal(mock.requests.length, 22);
});

test("does not contact Vercel without credentials, and redacts network/provider/JSON errors", async () => {
  let requests = 0;
  const unavailable = await runPreflight({
    args,
    env: {},
    fetchImpl: () => {
      requests += 1;
    },
  });
  assert.equal(requests, 0);
  assert.equal(unavailable.report.errorCode, "VERCEL_TOKEN_REQUIRED");
  const sensitive = "synthetic-sensitive-provider-error";
  for (const fetchImpl of [
    async () => {
      throw new Error(sensitive);
    },
    async () => new Response(sensitive, { status: 403 }),
    async () =>
      new Response(sensitive, {
        headers: { "Content-Type": "application/json" },
      }),
    async () => new Response(sensitive),
    async () => json({ user: { email: sensitive } }),
  ]) {
    const result = await runPreflight({ args, env, fetchImpl });
    assert.equal(result.exitCode, 1);
    assert.ok(!JSON.stringify(result).includes(sensitive));
    assert.ok(!JSON.stringify(result).includes(env.VERCEL_TOKEN));
  }
});

test("rejects oversized response bodies before parsing", async () => {
  const fetchImpl = async () => json({ payload: "x".repeat(1024 * 1024) });
  const result = await runPreflight({ args, env, fetchImpl });
  assert.equal(result.report.errorCode, "API_RESPONSE_TOO_LARGE");
  assert.equal(result.exitCode, 1);
});

test("CLI uses nonzero process exit and safe structured output when explicit input is missing", () => {
  const command = fileURLToPath(
    new URL("./check-private-vercel.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [command], {
    encoding: "utf8",
    env: {},
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.errorCode, "EXPLICIT_IDS_REQUIRED");
  assert.equal(report.readyForDeployment, false);
});
