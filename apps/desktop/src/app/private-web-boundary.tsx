import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  clearPrivateWebSession,
  connectPrivateWebSession,
  getPrivateWebClientState,
  subscribePrivateWebClient,
} from "../services/private-web-client";
import type { CommandError } from "../types/domain";
import "./private-web-setup.css";

interface PrivateWebBoundaryProps {
  children: ReactNode;
  /** List every command needed by the child workspace before enabling it. */
  requiredCommands: readonly string[];
  /** The caller clears its query cache and any other personal memory here. */
  onSessionEnd?: () => void;
}

/** Validates access and capabilities before importing the private workspace. */
export function PrivateWebBoundary({
  children,
  requiredCommands,
  onSessionEnd,
}: PrivateWebBoundaryProps) {
  const client = useSyncExternalStore(
    subscribePrivateWebClient,
    getPrivateWebClientState,
  );
  const [attempt, setAttempt] = useState(0);
  const [handshake, setHandshake] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [failure, setFailure] = useState<CommandError | null>(null);
  const [waitingLong, setWaitingLong] = useState(false);
  const [validatedRequirements, setValidatedRequirements] = useState<
    string | null
  >(null);
  const callback = useRef(onSessionEnd);
  const wasReady = useRef(false);
  const request = useRef<AbortController | null>(null);
  const requirements = requiredCommands.join("\0");
  useEffect(() => {
    callback.current = onSessionEnd;
  }, [onSessionEnd]);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const startedAt = Date.now();
    setHandshake("loading");
    setFailure(null);
    setWaitingLong(false);
    const updateWaiting = () => {
      if (!controller.signal.aborted && Date.now() - startedAt >= 8_000)
        setWaitingLong(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") updateWaiting();
    };
    const hintTimer = setTimeout(updateWaiting, 8_000);
    window.addEventListener("pageshow", updateWaiting);
    document.addEventListener("visibilitychange", onVisible);
    const stopWaiting = () => {
      clearTimeout(hintTimer);
      window.removeEventListener("pageshow", updateWaiting);
      document.removeEventListener("visibilitychange", onVisible);
    };
    void connectPrivateWebSession(
      requirements ? requirements.split("\0") : [],
      controller.signal,
    )
      .then(() => {
        stopWaiting();
        if (!controller.signal.aborted) {
          setValidatedRequirements(requirements);
          setHandshake("ready");
        }
      })
      .catch((cause: CommandError) => {
        stopWaiting();
        if (!controller.signal.aborted) {
          setFailure(cause);
          setHandshake("failed");
        }
      });
    return () => {
      stopWaiting();
      controller.abort();
      if (request.current === controller) request.current = null;
      clearPrivateWebSession();
      if (wasReady.current) {
        wasReady.current = false;
        callback.current?.();
      }
    };
  }, [attempt, requirements]);

  const ready =
    handshake === "ready" &&
    client.status === "ready" &&
    validatedRequirements === requirements;
  useEffect(() => {
    if (ready) wasReady.current = true;
    else if (wasReady.current) {
      wasReady.current = false;
      callback.current?.();
    }
  }, [ready]);
  if (ready) return children;

  const reload = client.status === "reload-required";
  const loading = handshake === "loading" && !reload;
  const unauthorized =
    failure?.code === "WEB_AUTH_REQUIRED" ||
    (handshake === "ready" && client.status === "unauthenticated");
  const title = reload
    ? "Datenstand erneut prüfen"
    : loading
      ? "Private Verbindung wird geprüft"
      : unauthorized
        ? "Private Anmeldung erforderlich"
        : "Private Browser-Version wird eingerichtet";
  const message = reload
    ? client.error?.message
    : loading
      ? waitingLong
        ? "Die Verbindung wird weiterhin geprüft. Das kann einen Moment dauern. Du kannst kurz weiter warten oder die Prüfung erneut starten."
        : "Dein persönlicher Workspace wird erst nach erfolgreicher Anmeldung und Prüfung der Datenanbindung geöffnet."
      : unauthorized
        ? "Die private Verbindung wurde beendet oder der Zugriff wurde verweigert. Lade die Seite neu und melde dich mit deinem Besitzerkonto an."
        : (failure?.message ??
          "Die private Datenanbindung ist noch nicht bereit.");
  return (
    <main
      className="private-web-setup"
      aria-labelledby="private-web-boundary-title"
    >
      <section className="private-web-setup-card">
        <p className="private-web-brand">Personal Macro</p>
        <h1 id="private-web-boundary-title">{title}</h1>
        <p className="private-web-status" role={loading ? "status" : "alert"}>
          {message}
        </p>
        {(!loading || waitingLong) && (
          <button
            className="button"
            type="button"
            onClick={() => {
              if (reload || unauthorized) window.location.reload();
              else {
                request.current?.abort();
                setHandshake("loading");
                setWaitingLong(false);
                setAttempt((value) => value + 1);
              }
            }}
          >
            {reload || unauthorized
              ? "Seite neu laden"
              : "Verbindung erneut prüfen"}
          </button>
        )}
      </section>
    </main>
  );
}
