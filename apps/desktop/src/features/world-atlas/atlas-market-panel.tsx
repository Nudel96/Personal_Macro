import { useAtlasDisplayChoice } from "./atlas-display-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasCatalog } from "./atlas-catalog";
import {
  atlasMarketProxies,
  atlasMarketReading,
  atlasMarketsFor,
} from "./atlas-markets";
import { AtlasMarketChart } from "./atlas-market-chart";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Marktgeschichte konnte nicht geladen werden.";

export function AtlasMarketPanel({
  topicId,
  geography,
  compareId,
  showNumbers,
  job,
  proxyId,
  onProxyChange,
  onAreaChange,
}: {
  topicId: string;
  geography: AtlasGeography;
  compareId?: string;
  showNumbers: boolean;
  job: AtlasSyncJob | null | undefined;
  proxyId?: string;
  onProxyChange: (id: string) => void;
  onAreaChange: (area: AtlasGeography) => void;
}) {
  const [horizon, setHorizon] = useAtlasDisplayChoice<number | null>(
    "marketHorizon",
    20,
    [10, 20, null],
  );
  const choices = atlasMarketsFor(topicId, geography.id);
  const proxy = choices.find((proxy) => proxy.id === proxyId) ?? choices[0];
  const compare = compareId
    ? atlasMarketsFor(topicId, compareId).find(
        (item) =>
          !proxy ||
          !topicId.endsWith("sector_equities") ||
          item.topicIds.some(
            (id) =>
              id.startsWith("market_context:sector_") &&
              id !== topicId &&
              proxy.topicIds.includes(id),
          ),
      )
    : undefined;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "market", proxy?.id],
    queryFn: () => api.atlasMarket(proxy!.id),
    enabled: Boolean(proxy),
  });
  const comparison = useQuery({
    queryKey: ["atlas", "market", compare?.id],
    queryFn: () => api.atlasMarket(compare!.id),
    enabled: Boolean(proxy && compare),
  });
  const sync = useMutation({
    mutationFn: (id: string) => api.syncAtlasMarket(id),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const data = query.data;
  const latest = data?.analysis.points[data.analysis.points.length - 1];
  const busy = sync.isPending || job?.status === "running";
  const currentJob =
    job?.seriesId === proxy?.id || job?.seriesId === compare?.id ? job : null;
  const fresh =
    data?.provenance &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  if (!proxy) {
    const contexts = [
      ...new Set(
        atlasMarketProxies
          .filter((p) => p.topicIds.includes(topicId))
          .map((p) => p.geographyId),
      ),
    ].map((id) => atlasCatalog.geographies.find((area) => area.id === id)!);
    return (
      <div className="atlas-empty">
        <Activity size={32} aria-hidden="true" />
        <h3>Für {geography.label} fehlt eine passende Marktreihe</h3>
        <p>
          Der Atlas hat hierfür noch keinen geeigneten Länder-Sektor-Fonds
          zugeordnet. Verfügbare Marktgebiete kannst du gezielt öffnen:
        </p>
        <div className="atlas-context-choices">
          {contexts.map((area) => (
            <Button
              key={area.id}
              variant="default"
              onClick={() => onAreaChange(area)}
            >
              {area.id === "world"
                ? "Globales Themenbild öffnen"
                : `${area.label} öffnen`}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="atlas-market-scope">
        <Activity size={18} aria-hidden="true" />
        <div>
          <strong>{proxy.scope}</strong>
          <span>
            Fonds als Marktstellvertreter · {proxy.currency}-Perspektive
          </span>
        </div>
      </div>
      {choices.length > 1 && (
        <label className="atlas-market-picker">
          Markt auswählen
          <select
            className="input"
            value={proxy.id}
            onChange={(event) => onProxyChange(event.target.value)}
          >
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {query.isPending && (
        <p role="status">Lokale Marktgeschichte wird geladen …</p>
      )}
      {query.error && (
        <div className="atlas-notice" role="alert">
          {errorText(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </div>
      )}
      {data?.status === "desktop_required" && (
        <div className="atlas-empty">
          <h3>Marktwellen in der Desktop-App laden</h3>
          <p>
            Die vorhandene EODHD-Konfiguration lädt die Geschichte dieses Fonds
            einmalig in den lokalen Atlas. Ein zusätzliches Datenabonnement ist
            dafür nicht vorgesehen; die Freigabe des vorhandenen Pakets wird
            beim Abruf geprüft.
          </p>
        </div>
      )}
      {data?.status === "not_downloaded" && (
        <div className="atlas-empty">
          <h3>Die Marktgeschichte ist noch nicht lokal gespeichert</h3>
          <p>
            Ein Abruf lädt die verfügbare bereinigte Historie dieses Fonds.
            Danach funktioniert die Ansicht auch offline.
          </p>
        </div>
      )}
      {data?.status === "available" && (
        <>
          {data.analysis.parameterSensitive && (
            <p className="atlas-notice">
              Die Lage hängt hier vom Zeitfenster ab: Andere lange Trend- oder
              Glättungsfenster liegen auf der jeweils anderen Seite der Mitte.
              Das Bild ist derzeit nicht eindeutig.
            </p>
          )}
          <div className="atlas-reading">
            <strong>{atlasMarketReading[data.analysis.state]}</strong>
            <span>
              Beobachtungen bis {data.analysis.lastObservation ?? "unbekannt"}
              {data.analysis.missingMonths ? " · Datenlücken vorhanden" : ""}
            </span>
          </div>
          {data.analysis.waveMonths > 0 ? (
            <>
              <div
                className="atlas-wave-horizons"
                role="group"
                aria-label="Zeitraum der Marktwelle"
              >
                {[10, 20, null].map((years) => (
                  <button
                    key={String(years)}
                    type="button"
                    aria-pressed={horizon === years}
                    onClick={() => setHorizon(years)}
                  >
                    {years ? `${years} Jahre` : "Gesamte Welle"}
                  </button>
                ))}
              </div>
              <AtlasMarketChart
                rows={[
                  data,
                  ...(compare &&
                  comparison.data?.status === "available" &&
                  comparison.data.analysis.waveMonths > 0
                    ? [comparison.data]
                    : []),
                ]}
                showNumbers={showNumbers}
                horizon={horizon}
              />
            </>
          ) : (
            <div className="atlas-notice">
              Die Quelle ist gespeichert. Eine Welle benötigt mindestens 71
              zusammenhängende abgeschlossene Monate seit Auflage oder dem
              letzten Datenbruch. Diese Vorlaufzeit wird nicht aufgefüllt.
            </div>
          )}
          {data.analysis.waveMonths > 0 && latest?.percentile == null && (
            <p className="atlas-comparison-note">
              Explorative Trendansicht: Für die Einordnung in die eigene
              Wellenhistorie fehlen noch genügend vergleichbare Monate oder eine
              messbare Schwankung.
            </p>
          )}
          {showNumbers && latest?.percentile != null && (
            <p className="atlas-comparison-note">
              Eigene historische Einordnung:{" "}
              {Math.round(latest.percentile * 100)}. Perzentil der
              vorangegangenen Wellenwerte. Dies ist kein Bewertungsrang zwischen
              Märkten.
            </p>
          )}
        </>
      )}
      {compareId && !compare && (
        <p className="atlas-notice">
          Für das gewählte Vergleichsland ist in diesem Thema kein gleichartiger
          Marktstellvertreter zugeordnet.
        </p>
      )}
      {compare && comparison.isPending && (
        <p role="status">Vergleichsmarkt wird geladen …</p>
      )}
      {compare && comparison.error && (
        <p role="alert">Vergleich: {errorText(comparison.error)}</p>
      )}
      {compare && comparison.data?.status === "not_downloaded" && (
        <div className="atlas-download">
          <Button
            disabled={busy}
            variant="default"
            onClick={() => sync.mutate(compare.id)}
          >
            Vergleichsmarkt laden
          </Button>
          <span>{compare.scope}</span>
        </div>
      )}
      {compare && comparison.data?.status === "available" && (
        <p className="atlas-comparison-note">
          {compare.label}: {atlasMarketReading[comparison.data.analysis.state]}.
          {comparison.data.analysis.parameterSensitive
            ? " Einordnung abhängig vom Zeitfenster."
            : ""}
          Daten bis {comparison.data.analysis.lastObservation}.{" "}
          {comparison.data.analysis.waveMonths > 0
            ? "Beide Wellen verwenden den gemeinsamen Zeitraum und denselben Maßstab."
            : "Für eine vergleichbare Welle fehlt noch genügend Historie."}
        </p>
      )}
      {isTauri() && (
        <div className="atlas-download">
          <Button
            disabled={Boolean(busy || fresh)}
            onClick={() => sync.mutate(proxy.id)}
          >
            <RefreshCw
              size={15}
              className={busy ? "atlas-loading-icon" : undefined}
            />
            {busy
              ? "Abruf läuft …"
              : fresh
                ? "Lokal auf dem heutigen Stand"
                : data?.provenance
                  ? "Marktgeschichte aktualisieren"
                  : "Marktgeschichte laden"}
          </Button>
          <span>
            Vorhandenes EODHD · ein Abruf je Fonds · frühestens nach 24 Stunden
            erneut
          </span>
        </div>
      )}
      {currentJob && (
        <p role={currentJob.status === "failed" ? "alert" : "status"}>
          {currentJob.message}
        </p>
      )}
      {!currentJob && job?.status === "running" && (
        <p role="status">Eine andere Atlas-Reihe wird gerade geladen.</p>
      )}
      {sync.error && <p role="alert">{errorText(sync.error)}</p>}
      <details className="atlas-details">
        <summary>Quelle, Reichweite und Berechnung</summary>
        <p>{proxy.limits}</p>
        <p>
          Der Verlauf beginnt mit der verfügbaren Fondshistorie. Einzelne Aktien
          werden hier nicht angezeigt. Die Gewichtung kann große Unternehmen
          stark betonen.
        </p>
        <p>
          Aus bereinigten Monatsschlusskursen wird ein logarithmischer linearer
          Trend der jeweils letzten 60 Monate berechnet. Der Abstand am
          jeweiligen Monatsende wird über zwölf Monate rückblickend geglättet.
          Lücken und dokumentierte Strukturbrüche starten diese Vorlaufzeit neu.
          Die Kurve wird nicht in die Zukunft verlängert.
        </p>
        <p>
          Eine zusätzliche historische Einordnung verwendet höchstens 120
          vorherige Wellenwerte, mindestens 60. Alle Zeitpunkte beruhen auf dem
          heutigen Datenstand der Quelle; rückwirkende Datenrevisionen bleiben
          möglich.
        </p>
        <p>
          Zur Empfindlichkeitsprüfung werden zusätzlich Trendfenster von 48 und
          84 Monaten sowie Glättungen von sechs und 18 Monaten berechnet.
          Widersprechen sie der Seite der Mitte im Standardbild, zeigt der Atlas
          eine zeitfensterabhängige Lage. Gleiche Richtungen belegen keine
          Prognosefähigkeit.
        </p>
        {proxy.breaks.length > 0 && (
          <p>
            Dokumentierte Unterbrechungen der Vergleichbarkeit:{" "}
            {proxy.breaks.join(", ")}.
          </p>
        )}
        {data?.provenance && (
          <p>
            {data.provenance.adjustment} Lokal abgerufen am{" "}
            {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
            Rezept: {data.analysis.recipe}.
          </p>
        )}
        <a
          href={proxy.issuerUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (isTauri()) {
              event.preventDefault();
              void openUrl(proxy.issuerUrl);
            }
          }}
        >
          Fondsbeschreibung bei der Originalquelle öffnen
        </a>
      </details>
    </>
  );
}
