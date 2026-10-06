import { QueueClient } from "@vercel/queue";

// Both producer and private consumer use the deployment's Frankfurt queue.
export const cotQueue = new QueueClient({ region: "fra1" });
export const COT_TOPIC = "personal-macro-cot";
export const MAX_DELIVERIES = 8;
