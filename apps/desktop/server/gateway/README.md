# Private Vercel gateway

This is a bounded same-origin transport for the existing desktop application's
private browser build. It provides `GET /api/session`, `POST /api/commands` and
the separately bounded private image route `GET/POST /api/media`.
There is no public sign-up flow.

## Vercel Services entrypoint

`server/gateway/service.mjs` is the explicit Node service entrypoint. The
`gateway` service uses `runtime: "node"`, routes `/api/:path*` without stripping
the prefix, and owns the internal binding to `backend`. The static `web` service
does not own that binding. Vercel Services does **not** automatically build the
neighbouring `api/` directory; those standalone wrappers are excluded from the
Services deployment. A successful build must include both the gateway Node
function and the Rust container before assigning the stable alias.

The current runtime resolver accepts the toolchain name `node`, not a Lambda
version such as `nodejs22.x`, despite the generic configuration schema example.
Exact public routes still pass through the existing origin, method, cookie,
CSRF and HMAC checks. Other paths return a bounded, non-cacheable JSON 404.

Vercel Authentication on **all deployments** is the owner identity boundary.
Before enabling this gateway, the project must have only its owner as a member,
with no bypasses, shared links or public aliases. The gateway cookie is a CSRF
session, **not** an independent identity check. Deploying these functions on an
unprotected project would expose the backend to that project's visitors.

The backend must validate each HMAC, expire request timestamps and persist or
otherwise reliably reject reused nonces across every running backend instance.
It must also validate the command allowlist, workspace identity, input, mutation
revision and idempotency identifier. A new gateway nonce does not make repeating a
business operation safe; mutation idempotency belongs in the durable backend.

## Configuration

Only server-side environment variables are used. Never prefix them with `VITE_`.

| Variable               | Required value                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `VERCEL`               | Platform-provided `1`; other environments fail closed.                                                                |
| `MACRO_BACKEND_ORIGIN` | Exact HTTPS origin, no credentials, path, query or fragment.                                                          |
| `MACRO_GATEWAY_SECRET` | 32 random bytes encoded as exactly 64 hexadecimal characters, shared only with the backend.                           |
| `MACRO_WORKSPACE_ID`   | Expected backend workspace identifier, 1–128 ASCII letters, digits, `_` or `-`.                                       |
| `MACRO_WEB_ORIGINS`    | Comma-separated exact HTTPS origins, no wildcard or path. Include only protected deployment aliases that should work. |

Missing or invalid configuration returns a generic `503` without contacting the
backend. There is no HTTP or authentication bypass switch for local development.
Use synthetic dependencies in the automated tests.

The Vercel function duration must exceed the gateway's 90-second deadline.
Incoming command bodies remain limited to 2 MiB; upstream JSON responses are
separately limited to 4 MiB, below Vercel's response payload limit. Larger query
responses require pagination. The separate media route limits
original PNG/JPEG/WebP uploads to 3 MiB and verifies the privately stored bytes.

## Backend contract

The session route maps to `GET /session` and expects:

```json
{
  "authenticated": true,
  "workspaceId": "configured-workspace-id",
  "revision": 0,
  "capabilities": ["get_bootstrap", "create_trade"],
  "writableCommands": ["create_trade"]
}
```

After verifying this response, the gateway adds `csrfToken` and sets the
`__Host-macro-session` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`,
`Path=/` and an eight-hour maximum lifetime. Cookies and CSRF tokens are HMAC-bound
to the workspace and exact browser origin, using separate domain labels from the
backend request signature. Existing valid cookies remain stable across tabs.

The command route requires an exact same-origin `Origin`, the session cookie,
`X-Macro-CSRF-Token` and JSON content type. The command envelope must contain the
configured `workspaceId`. The gateway forwards the exact raw JSON bytes to
`POST /commands`. Successful `{ok:true,data,revision}` responses retain their data
and revision. Error responses are mapped to fixed German messages without copying
backend error text, details or headers. A confirmed `200` business-error envelope
retains its validated revision; other errors carry no trusted revision.

Every backend request includes these headers:

```text
X-Macro-Timestamp: <UTC Unix seconds>
X-Macro-Nonce: <fresh UUID v4>
X-Macro-Signature: <lowercase HMAC-SHA256 hex>
```

Decode `MACRO_GATEWAY_SECRET` from hexadecimal before using it as the HMAC key.
Sign this UTF-8 string without a trailing newline:

```text
v1\n<timestamp>\n<nonce>\n<UPPERCASE_METHOD>\n<backend_path_and_query>\n<SHA256 hex of raw body>
```

The GET body is empty and the path is `/session`; the POST path is `/commands`.
All backend fetches forbid redirects and forward only explicitly constructed
headers. Browser credentials, cookies, forwarded-host metadata and Vercel bypass
headers never go to the backend. Responses prohibit browser and CDN caching.

## Verification

From `apps/desktop`:

```powershell
node --test server/gateway/gateway.node-tests.mjs server/gateway/service.node-tests.mjs server/media/media.node-tests.mjs
pnpm exec eslint server/gateway/service.mjs server/gateway/service.node-tests.mjs
```

The tests use only synthetic sessions, keys and mocked upstream responses. They
cover the signature contract, same-origin and CSRF checks, workspace binding,
cookie expiry and rotation, body limits, redirect rejection, malformed responses,
safe error mapping and deadlines during incoming and outgoing body reads.
They do not replace deployed checks of Vercel access protection, real persistent
backend storage or PC/phone concurrent writes.

For the explicit Node-to-Rust integration check, first build the headless server
and then run the separate smoke script:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --no-default-features --features server --bin personal-macro-server
node server/gateway/gateway.integration-smoke.mjs
```

`MACRO_SERVER_BINARY` can select an already-built server executable. The script
starts only its own hidden child process and a new synthetic workspace beneath
the OS temporary directory. It checks cross-language HMAC signing, CSRF/origin
rejections, stale-device conflicts, idempotency, bad signatures, durable nonce
rejection and journal persistence after process restart. It then stops that
process and removes only the verified temporary workspace. Its loopback fetch
substitution is test-only and does not relax the production HTTPS requirement.
