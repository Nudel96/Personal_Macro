import { useEffect, useRef } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { supportsPrivateWebCommand } from "../../services/private-web-client";

export function refreshMyfxbookJournal(client: QueryClient) {
  return Promise.all(
    [
      "myfxbook-connections",
      "bootstrap",
      "trades",
      "trade",
      "dashboard",
      "calendar",
      "analytics",
      "account-cashflows",
      "import-runs",
      "backups",
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}

// A background import must refresh the journal even when Settings is closed.
export function MyfxbookEvents() {
  const client = useQueryClient();
  const cloud =
    isPrivateWeb() && supportsPrivateWebCommand("myfxbook_connections");
  const connections = useQuery({
    queryKey: ["myfxbook-connections"],
    queryFn: () => api.myfxbookConnections(),
    enabled: cloud,
    refetchInterval: cloud ? 60_000 : false,
    refetchOnWindowFocus: true,
  });
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (!cloud || !connections.data) return;
    const current = JSON.stringify(
      connections.data.map((c) => [c.accountId, c.lastSyncAt, c.status]),
    );
    const changed = previous.current !== null && previous.current !== current;
    previous.current = current;
    if (changed) void refreshMyfxbookJournal(client);
  }, [client, cloud, connections.data]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("myfxbook-updated", () => {
          void refreshMyfxbookJournal(client);
        }),
      )
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* Queries still refresh on mounting their pages. */
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [client]);
  return null;
}
