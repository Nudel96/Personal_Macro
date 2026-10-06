#!/usr/bin/env node
import { pathToFileURL } from "node:url";

// Read-only audit, not a deployment command or an exhaustive privacy guarantee.
// Schema reviewed 2026-09-24: https://openapi.vercel.sh
// https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name
// https://vercel.com/docs/rest-api/teams/list-team-members
// https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MEMBER_PAGES = 20;
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const emptyObject = (value) => object(value) && Object.keys(value).length === 0;
const owns = (value, key) => object(value) && Object.hasOwn(value, key);

class AuditError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const HELP = `Rein lesende Vercel-Prüfung für ein persönliches Projekt.
Aufruf: node scripts/check-private-vercel.mjs --project-id prj_… --team-id team_…
Authentifizierung ausschließlich über VERCEL_TOKEN in der Prozessumgebung.
Keine Dateien, Einstellungen oder Deployments werden verändert.
Exitcodes: 1 = Prüfung fehlgeschlagen, 2 = Nachweise/Abnahme noch offen.
Die Ausgabe ist keine vollständige Datenschutz- oder Deploymentfreigabe.`;

export function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key =
      args[i] === "--project-id"
        ? "projectId"
        : args[i] === "--team-id"
          ? "teamId"
          : null;
    if (!key || options[key] || !args[i + 1])
      throw new AuditError("INVALID_ARGUMENTS");
    options[key] = args[i + 1];
  }
  if (
    !/^prj_[A-Za-z0-9]{1,100}$/.test(options.projectId ?? "") ||
    !/^team_[A-Za-z0-9]{1,100}$/.test(options.teamId ?? "")
  ) {
    throw new AuditError("EXPLICIT_IDS_REQUIRED");
  }
  return options;
}

async function readJson(response) {
  if (!response.ok) throw new AuditError("API_ACCESS_FAILED");
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    throw new AuditError("API_RESPONSE_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AuditError("API_RESPONSE_INVALID");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new AuditError("API_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof AuditError) throw error;
    throw new AuditError("API_RESPONSE_INVALID");
  } finally {
    reader.releaseLock();
  }
}

function addCheck(checks, id, title, condition, known = true) {
  checks.push({
    id,
    title,
    status: !known ? "unverified" : condition ? "passed" : "failed",
  });
}

export function inspectProject(project, { projectId, teamId }) {
  const checks = [];
  addCheck(
    checks,
    "project_scope",
    "Projekt gehört zum ausdrücklich gewählten Team",
    project?.id === projectId && project?.accountId === teamId,
  );
  addCheck(
    checks,
    "authentication_all",
    "Vercel-Anmeldung schützt alle Deployments einschließlich Produktionsdomains",
    project?.ssoProtection?.deploymentType === "all",
    owns(project?.ssoProtection, "deploymentType"),
  );
  // publicSource is absent from the current v9 GET schema. Do not turn an omitted
  // field (or a future API change) into a false claim that source/logs are private.
  addCheck(
    checks,
    "public_source",
    "Öffentliche Quelltexte und Logs ausdrücklich deaktiviert",
    project?.publicSource === false,
    owns(project, "publicSource"),
  );
  addCheck(
    checks,
    "directory_listing",
    "Verzeichnisauflistung deaktiviert",
    project?.directoryListing === false,
    owns(project, "directoryListing"),
  );
  addCheck(
    checks,
    "automation_bypass",
    "Keine Automation- oder Integrations-Bypass-Schlüssel",
    emptyObject(project?.protectionBypass),
    owns(project, "protectionBypass"),
  );
  addCheck(
    checks,
    "password_access",
    "Kein alternativer Zugriff über geteiltes Passwort",
    project?.passwordProtection === null,
    owns(project, "passwordProtection"),
  );
  addCheck(
    checks,
    "trusted_ips",
    "Keine alternative IP-Zugriffskonfiguration",
    project?.trustedIps === null,
    owns(project, "trustedIps"),
  );
  addCheck(
    checks,
    "options_allowlist",
    "Keine ungeschützten OPTIONS-Pfade",
    project?.optionsAllowlist === null ||
      (object(project?.optionsAllowlist) &&
        Array.isArray(project.optionsAllowlist.paths) &&
        project.optionsAllowlist.paths.length === 0 &&
        Object.keys(project.optionsAllowlist).every((key) => key === "paths")),
    owns(project, "optionsAllowlist"),
  );
  const trusted = project?.trustedSources;
  // Official schema: omitted enableVercelCiSameRepository defaults to enabled.
  addCheck(
    checks,
    "trusted_sources",
    "Keine vertrauensbasierten Projekt-, OIDC- oder CI-Zugriffe",
    object(trusted) &&
      trusted.enableVercelCiSameRepository === false &&
      emptyObject(trusted.projects) &&
      emptyObject(trusted.oidcProviders) &&
      Object.keys(trusted).every((key) =>
        ["enableVercelCiSameRepository", "projects", "oidcProviders"].includes(
          key,
        ),
      ),
    owns(project, "trustedSources") &&
      object(trusted) &&
      ["enableVercelCiSameRepository", "projects", "oidcProviders"].every(
        (key) => owns(trusted, key),
      ),
  );
  return checks;
}

export async function inspectMembers(get, teamId, userId) {
  const members = new Map();
  let until;
  let invitationsProven = true;
  let hasInvitations = false;
  for (let page = 0; page < MAX_MEMBER_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (until !== undefined) params.set("until", String(until));
    const data = await get(`/v3/teams/${teamId}/members?${params}`);
    const pagination = data?.pagination;
    // The live v3 API also returns a complete single page as
    // { members, pagination: {}, totalCount }. Accept only a bounded, exact
    // total, never infer completeness from an omitted next cursor alone.
    const completeCountedPage =
      page === 0 &&
      Array.isArray(data?.members) &&
      emptyObject(pagination) &&
      Number.isSafeInteger(data.totalCount) &&
      data.totalCount >= 0 &&
      data.totalCount < 100 &&
      data.totalCount === data.members.length;
    if (
      !completeCountedPage &&
      (!Array.isArray(data?.members) ||
        !object(pagination) ||
        !Number.isSafeInteger(pagination.count) ||
        pagination.count < 0 ||
        pagination.count !== data.members.length ||
        typeof pagination.hasNext !== "boolean" ||
        !owns(pagination, "next"))
    )
      throw new AuditError("MEMBERS_PAGINATION_UNPROVEN");
    for (const member of data.members) {
      if (
        !object(member) ||
        typeof member.uid !== "string" ||
        !member.uid ||
        members.has(member.uid)
      ) {
        throw new AuditError("MEMBERS_RESPONSE_INCONSISTENT");
      }
      members.set(member.uid, {
        uid: member.uid,
        role: member.role,
        confirmed: member.confirmed,
      });
    }
    if (!Array.isArray(data.emailInviteCodes)) invitationsProven = false;
    else if (data.emailInviteCodes.length > 0) hasInvitations = true;
    if (completeCountedPage || !pagination.hasNext) {
      if (!completeCountedPage && pagination.next !== null)
        throw new AuditError("MEMBERS_PAGINATION_UNPROVEN");
      const soleMember = members.get(userId);
      const checks = [];
      addCheck(
        checks,
        "sole_owner",
        "Authentifizierter Benutzer ist einziges bestätigtes OWNER-Mitglied",
        members.size === 1 &&
          soleMember?.role === "OWNER" &&
          soleMember?.confirmed === true,
      );
      addCheck(
        checks,
        "team_invitations",
        "Keine offenen oder gespeicherten E-Mail-Einladungen",
        !hasInvitations,
        hasInvitations || invitationsProven,
      );
      return { checks, memberCount: members.size, pagesRead: page + 1 };
    }
    if (
      !Number.isSafeInteger(pagination.next) ||
      pagination.next < 0 ||
      data.members.length === 0 ||
      (until !== undefined && pagination.next >= until)
    ) {
      throw new AuditError("MEMBERS_PAGINATION_UNPROVEN");
    }
    until = pagination.next;
  }
  throw new AuditError("MEMBERS_PAGE_LIMIT_REACHED");
}

const REMAINING_REVIEW = [
  {
    id: "alias_and_external_access",
    status: "unverified",
    title:
      "Alle Deployments/Aliase im Dashboard auf Freigabelinks, externe Zugriffsfreigaben und Deployment-Protection-Ausnahmen prüfen",
  },
  {
    id: "team_access_paths",
    status: "unverified",
    title:
      "Team-Einladungslinks, automatische Teamaufnahme und zusätzliche Projekt-/Organisationszugriffe prüfen",
  },
  {
    id: "live_access",
    status: "unverified",
    title:
      "Produktions-, Preview- und benutzerdefinierte Domains samt Daten/Assets unangemeldet und mit fremdem Konto prüfen; eigener Zugang muss funktionieren",
  },
];

export async function runPreflight({
  args,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const checks = [];
  let memberSummary;
  let errorCode;
  try {
    const options = parseArguments(args);
    if (options.help) return { exitCode: 0, help: HELP };
    const token = env.VERCEL_TOKEN;
    if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token)) {
      throw new AuditError("VERCEL_TOKEN_REQUIRED");
    }
    const signal = AbortSignal.timeout(30_000);
    const get = async (path) => {
      try {
        // IDs and pagination are validated; the origin cannot be overridden.
        return await readJson(
          await fetchImpl(`https://api.vercel.com${path}`, {
            method: "GET",
            redirect: "error",
            signal,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }),
        );
      } catch (error) {
        if (error instanceof AuditError) throw error;
        throw new AuditError("API_REQUEST_FAILED");
      }
    };
    const identity = await get("/v2/user");
    const userId = identity?.user?.id;
    if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
      throw new AuditError("USER_IDENTITY_UNPROVEN");
    }
    const project = await get(
      `/v9/projects/${options.projectId}?teamId=${options.teamId}`,
    );
    checks.push(...inspectProject(project, options));
    memberSummary = await inspectMembers(get, options.teamId, userId);
    checks.push(...memberSummary.checks);
  } catch (error) {
    // Never serialize provider errors, identity data, bypass map keys, or tokens.
    errorCode = error instanceof AuditError ? error.code : "AUDIT_FAILED";
  }
  const failed =
    Boolean(errorCode) || checks.some((check) => check.status === "failed");
  return {
    exitCode: failed ? 1 : 2,
    report: {
      status: failed ? "blocked" : "review-required",
      readOnly: true,
      readyForDeployment: false,
      scope:
        "Zeitpunktprüfung ausgewählter Vercel-Einstellungen; keine vollständige Datenschutzfreigabe",
      ...(errorCode ? { errorCode } : {}),
      ...(memberSummary
        ? {
            membership: {
              count: memberSummary.memberCount,
              pagesRead: memberSummary.pagesRead,
            },
          }
        : {}),
      checks,
      remainingReview: REMAINING_REVIEW,
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runPreflight({ args: process.argv.slice(2) });
  process.stdout.write(
    `${result.help ?? JSON.stringify(result.report, null, 2)}\n`,
  );
  process.exitCode = result.exitCode;
}
