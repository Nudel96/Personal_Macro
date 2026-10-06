import { QueueClient } from "@vercel/queue";
export const providerQueue = new QueueClient({ region: "fra1" });
export const PROVIDER_TOPIC = "personal-macro-providers";
