import { cotQueue } from "./queue.mjs";
import { cotRetry, processCotMessage } from "./index.mjs";

// This entire service is a private Queue consumer, never a browser endpoint.
export default {
  fetch: cotQueue.handleCallback(processCotMessage, {
    visibilityTimeoutSeconds: 180,
    retry: cotRetry,
  }),
};
