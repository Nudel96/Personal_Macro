import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getPrivateWebClientState,
  refreshPrivateWebMarketGeneration,
} from "../../services/private-web-client";
import { isPrivateWeb } from "../../services/runtime-mode";

const CHECK_INTERVAL_MS = 60_000;

/** Poll small generation metadata; provider jobs run independently on the server. */
export function useCloudCotRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isPrivateWeb()) return;
    let stopped = false;
    let running: AbortController | null = null;
    let lastCheck = Number.NEGATIVE_INFINITY;
    const check = async () => {
      if (
        stopped ||
        running ||
        document.visibilityState !== "visible" ||
        getPrivateWebClientState().status !== "ready" ||
        Date.now() - lastCheck < CHECK_INTERVAL_MS
      )
        return;
      lastCheck = Date.now();
      const request = new AbortController();
      running = request;
      try {
        const changed = await refreshPrivateWebMarketGeneration(request.signal);
        if (changed) {
          // An old generation's in-flight initial read must not replace the new
          // data or leave the page stuck on a generation-conflict error.
          await Promise.all([
            queryClient.cancelQueries({ queryKey: ["cot"] }),
            queryClient.cancelQueries({ queryKey: ["macro"] }),
            queryClient.cancelQueries({ queryKey: ["economic-data"] }),
            queryClient.cancelQueries({ queryKey: ["economic-calendar"] }),
          ]);
          const refetchType =
            !stopped &&
            !request.signal.aborted &&
            document.visibilityState === "visible"
              ? "active"
              : "none";
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["cot"], refetchType }),
            queryClient.invalidateQueries({
              queryKey: ["macro"],
              refetchType,
            }),
            queryClient.invalidateQueries({ queryKey: ["economic-data"], refetchType }),
            queryClient.invalidateQueries({ queryKey: ["economic-calendar"], refetchType }),
          ]);
        }
      } finally {
        if (running === request) running = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") running?.abort();
      else void check();
    };
    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => {
      stopped = true;
      running?.abort();
      clearInterval(interval);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queryClient]);
}
