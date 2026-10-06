import { providerQueue } from "./queue.mjs";
import { processProviderMessage, providerRetry } from "./index.mjs";
export default {
  fetch: providerQueue.handleCallback(processProviderMessage, {
    visibilityTimeoutSeconds: 240,
    retry: providerRetry,
  }),
};
