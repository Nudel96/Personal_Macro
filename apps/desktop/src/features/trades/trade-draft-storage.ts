import {
  getPrivateWebClientState,
  subscribePrivateWebClient,
} from "../../services/private-web-client";
import { isPrivateWeb } from "../../services/runtime-mode";

const privateDrafts = new Map<string, string>();
let privateWorkspace: string | null = null;
let subscribed = false;

function syncPrivateScope() {
  const state = getPrivateWebClientState();
  const workspace = state.status === "ready" ? state.workspaceId : null;
  if (workspace === null || workspace !== privateWorkspace) {
    privateDrafts.clear();
    privateWorkspace = workspace;
  }
  return workspace;
}

function privateDraftKey(key: string, accountId: string): string | null {
  if (!subscribed) {
    // The subscription belongs to this page's store. Logout, denied access,
    // and a required reload discard drafts before another session can use it.
    subscribePrivateWebClient(syncPrivateScope);
    subscribed = true;
  }
  if (!syncPrivateScope() || !accountId.trim()) return null;
  return JSON.stringify([accountId, key]);
}

export function readTradeDraft(key: string, accountId: string): string | null {
  if (!isPrivateWeb()) return localStorage.getItem(key);
  const scopedKey = privateDraftKey(key, accountId);
  return scopedKey === null ? null : (privateDrafts.get(scopedKey) ?? null);
}

export function writeTradeDraft(
  key: string,
  accountId: string,
  value: string,
): void {
  if (!isPrivateWeb()) {
    localStorage.setItem(key, value);
    return;
  }
  const scopedKey = privateDraftKey(key, accountId);
  if (scopedKey === null) {
    throw new Error("Die private Sitzung ist nicht aktiv.");
  }
  privateDrafts.set(scopedKey, value);
}

export function removeTradeDraft(key: string, accountId: string): void {
  if (!isPrivateWeb()) {
    localStorage.removeItem(key);
    return;
  }
  const scopedKey = privateDraftKey(key, accountId);
  if (scopedKey !== null) privateDrafts.delete(scopedKey);
}
