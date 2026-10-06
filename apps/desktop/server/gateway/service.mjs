import { URL } from "node:url";
import { handleGatewayRequest, gatewayJsonResponse } from "./index.mjs";
import { handleMediaRequest } from "../media/index.mjs";
import { handleCotCronRequest } from "../cot/index.mjs";
import { handleProviderCronRequest } from "../providers/index.mjs";

/**
 * Explicit Node service entrypoint. Vercel Services does not automatically build
 * a neighbouring api/ directory. Keep the original public request paths so the
 * existing origin, cookie, CSRF and signature checks run unchanged.
 */
export async function handleServiceRequest(request, dependencies = {}) {
  const path = new URL(request.url).pathname;
  switch (path) {
    case "/api/cron/providers":
      return handleProviderCronRequest(request, dependencies);
    case "/api/cron/cot":
      return handleCotCronRequest(request, dependencies);
    case "/api/session":
      return handleGatewayRequest(request, "session", dependencies);
    case "/api/commands":
      return handleGatewayRequest(request, "commands", dependencies);
    case "/api/media":
      return handleMediaRequest(request, dependencies);
    default:
      return gatewayJsonResponse(
        {
          ok: false,
          error: {
            code: "ROUTE_NOT_FOUND",
            message: "Diese private Schnittstelle ist nicht verfügbar.",
          },
        },
        404,
      );
  }
}

export default {
  fetch(request) {
    return handleServiceRequest(request);
  },
};
