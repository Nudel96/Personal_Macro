import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Square } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import type { AtlasSyncJob } from "./atlas-types";

export const atlasLibraryJobId = "atlas-library";
const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Der Datenbestand konnte nicht ergänzt werden.";

export function AtlasLibraryPanel({
  job,
}: {
  job: AtlasSyncJob | null | undefined;
}) {
  const [markets, setMarkets] = useState(false);
  const client = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.syncAtlasLibrary(markets),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const stop = useMutation({
    mutationFn: (id: string) => api.cancelAtlasLibrary(id),
  });
  const own = job?.seriesId === atlasLibraryJobId ? job : null;
  const busy = job?.status === "running" || sync.isPending;
  if (isPrivateWeb())
    return (
      <p className="atlas-notice">
        Du verwendest den privat übernommenen Quellenstand. Auswahl, Vergleiche
        und gemerkte Ansichten sind verfügbar. Neue Providerabrufe sind hier
        noch nicht freigegeben.
      </p>
    );
  return (
    <details className="atlas-details atlas-library-panel">
      <summary>Lokalen Datenbestand ergänzen</summary>
      <p>
        Ein gemeinsamer Abruf lädt die noch fehlenden, angebundenen Quellen für
        alle verfügbaren Länder: Demografie, Bildung, Gesundheit, Energie,
        Branchen, Rohstoffe, Staatsfinanzen und Bewertungen. Bereits
        gespeicherte Pakete werden beibehalten. Der erste vollständige Abruf
        kann länger dauern.
      </p>
      <label className="atlas-numbers">
        <input
          type="checkbox"
          checked={markets}
          disabled={busy}
          onChange={(event) => setMarkets(event.target.checked)}
        />
        Marktwellen mit dem vorhandenen EODHD-Zugang ergänzen
      </label>
      <div className="atlas-download">
        <Button
          disabled={!isTauri() || busy}
          onClick={() => {
            stop.reset();
            sync.mutate();
          }}
        >
          <Download size={15} /> Fehlende Datenpakete laden
        </Button>
        {own?.status === "running" && (
          <Button
            disabled={
              stop.isPending || (stop.isSuccess && stop.variables === own.id)
            }
            onClick={() => stop.mutate(own.id)}
          >
            <Square size={14} />{" "}
            {stop.isSuccess && stop.variables === own.id
              ? "Stoppen vorgemerkt"
              : "Nach diesem Paket stoppen"}
          </Button>
        )}
        <span>Öffentliche Quellen · lokal und offline nutzbar</span>
      </div>
      {own && (
        <div role="status">
          <p>
            {own.page} von {own.pages} Paketen geprüft · {own.observations} neu
            gespeichert
          </p>
          {own.status === "running" ? (
            <p>{own.message}</p>
          ) : (
            <details open={own.status !== "complete"}>
              <summary>Abrufergebnis</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{own.message}</p>
            </details>
          )}
        </div>
      )}
      {sync.error && <p role="alert">{errorText(sync.error)}</p>}
      {stop.error && <p role="alert">{errorText(stop.error)}</p>}
      {!isTauri() && (
        <p>Das Laden und Speichern ist in der Desktop-App verfügbar.</p>
      )}
    </details>
  );
}
