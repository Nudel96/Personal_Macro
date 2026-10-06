import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { atlasContextParams, atlasSavedContext } from "./atlas-notebook-model";
import type { AtlasSavedContext } from "./atlas-notebook-types";

// Serialize writes across page mounts, so a slow older write cannot win.
let writes: Promise<unknown> = Promise.resolve();
let latestWrite = 0;
const retryDelays = [250, 750, 1500];
function write(context: AtlasSavedContext) {
  const sequence = ++latestWrite;
  const next = writes
    .catch(() => undefined)
    .then(async () => {
      for (let attempt = 0; ; attempt++) {
        // While another write was waiting, newer navigation may have replaced
        // this selection. Never retry or persist a superseded preference.
        if (sequence !== latestWrite) return false;
        try {
          await api.saveAtlasLastContext(context);
          return true;
        } catch (error) {
          if (sequence !== latestWrite) return false;
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "ATLAS_PREFERENCES_BUSY" ||
            attempt >= retryDelays.length
          )
            throw error;
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, retryDelays[attempt]);
          });
        }
      }
    });
  writes = next;
  return next;
}

export function useAtlasLastView(
  params: URLSearchParams,
  restore: (params: URLSearchParams) => void,
) {
  const native = isTauri() || isPrivateWeb();
  const initial = useRef(params.toString());
  const current = useRef(initial.current);
  const restoreRef = useRef(restore);
  const ready = useRef(false);
  const mounted = useRef(false);
  const saved = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = params.toString();
  useLayoutEffect(() => {
    current.current = value;
    restoreRef.current = restore;
  }, [value, restore]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    if (native)
      // A preceding page's flush may still be waiting for a database writer.
      // Read after it settles so a quick return cannot restore an older view.
      void writes
        .catch(() => undefined)
        .then(() => api.atlasLastContext())
        .then((context) => {
          if (cancelled) return;
          const previous = context ? atlasContextParams(context) : null;
          if (context && !previous)
            throw new Error("Unbekannte Ansichtsversion");
          // An explicit link or navigation while loading always takes precedence.
          if (!initial.current && !current.current && previous) {
            current.current = previous.toString();
            saved.current = current.current;
            restoreRef.current(previous);
          }
          ready.current = true;
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled)
            setError(
              "Die letzte Ansicht konnte nicht gelesen werden. Sie wird deshalb nicht überschrieben. Gemerkte Ansichten bleiben separat verfügbar.",
            );
        });
    return () => {
      cancelled = true;
      mounted.current = false;
      if (native && ready.current && current.current !== saved.current) {
        try {
          void write(
            atlasSavedContext(new URLSearchParams(current.current)),
          ).catch(() => undefined);
        } catch {
          /* The visible error remains; never truncate a saved context. */
        }
      }
    };
  }, [native]);
  useEffect(() => {
    if (
      !native ||
      !loaded ||
      !ready.current ||
      current.current !== value ||
      saved.current === value
    )
      return;
    const timer = window.setTimeout(() => {
      try {
        void write(atlasSavedContext(new URLSearchParams(value)))
          .then((written) => {
            if (!written) return;
            saved.current = value;
            if (mounted.current && current.current === value) setError(null);
          })
          .catch(() => {
            if (mounted.current && current.current === value)
              setError(
                "Die letzte Ansicht konnte nicht gesichert werden. Deine gemerkten Ansichten sind davon unabhängig.",
              );
          });
      } catch {
        setError(
          "Die letzte Ansicht wurde wegen eines zu langen Suchtexts nicht gesichert.",
        );
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loaded, native, value]);
  return error;
}
