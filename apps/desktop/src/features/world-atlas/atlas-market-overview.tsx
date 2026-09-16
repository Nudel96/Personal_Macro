import { useAtlasDisplayChoice } from "./atlas-display-state";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowUpRight, RefreshCw, Square } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasMarketProxies } from "./atlas-markets";
import type {
  AtlasMarketProxy,
  AtlasMarketResponse,
} from "./atlas-market-types";
import type { AtlasSyncJob } from "./atlas-types";
import {
  atlasMarketBatchId,
  marketOverviewFrame,
  marketOverviewGroup,
  marketOverviewGroups,
  marketOverviewPath,
  marketOverviewReading,
  overviewMonth,
  type MarketOverviewGroup,
} from "./atlas-market-overview-model";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Der lokale Marktstand konnte nicht gelesen werden.";
function MiniWave({
  row,
  frame,
}: {
  row: AtlasMarketResponse;
  frame: ReturnType<typeof marketOverviewFrame>;
}) {
  const picture = marketOverviewPath(row, frame);
  return picture.path ? (
    <svg
      viewBox="0 0 320 120"
      className="atlas-mini-wave"
      role="img"
      aria-label={`${row.proxy.label}: Welle von ${overviewMonth(frame.first)} bis ${overviewMonth(frame.last)}, gemeinsamer Maßstab. Lücken bleiben offen.`}
    >
      <line x1="8" y1="60" x2="312" y2="60" className="atlas-mini-middle" />
      <path d={picture.path} className="atlas-mini-line" />
      {picture.isolated.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r="2.5"
          className="atlas-mini-point"
        />
      ))}
      {picture.current && (
        <circle
          cx={picture.current.x}
          cy={picture.current.y}
          r="4"
          className="atlas-mini-point"
        />
      )}
    </svg>
  ) : (
    <div className="atlas-mini-empty">
      <Activity size={22} aria-hidden="true" />
      <span>
        {row.status === "available"
          ? "Für dieses Fenster fehlt eine nutzbare Welle"
          : "Noch kein lokales Bild"}
      </span>
    </div>
  );
}

export function AtlasMarketOverview({
  showNumbers,
  onNumbersChange,
  job,
  onChoose,
}: {
  showNumbers: boolean;
  onNumbersChange: (show: boolean) => void;
  job: AtlasSyncJob | null | undefined;
  onChoose: (proxy: AtlasMarketProxy) => void;
}) {
  const [filter, setFilter] = useAtlasDisplayChoice<
    MarketOverviewGroup | "all"
  >("marketsGroup", "all", ["all", "countries", "sectors", "themes"]);
  const [horizon, setHorizon] = useAtlasDisplayChoice<number | null>(
    "marketsHorizon",
    20,
    [10, 20, null],
  );
  const client = useQueryClient();
  const queries = useQueries({
    queries: atlasMarketProxies.map((proxy) => ({
      queryKey: ["atlas", "market", proxy.id],
      queryFn: () => api.atlasMarket(proxy.id),
    })),
  });
  const visible = atlasMarketProxies.filter(
    (proxy) => filter === "all" || marketOverviewGroup(proxy) === filter,
  );
  const entries = visible.map((proxy) => ({
    proxy,
    query: queries[atlasMarketProxies.indexOf(proxy)],
  }));
  const rows = entries.flatMap((entry) =>
    entry.query.data ? [entry.query.data] : [],
  );
  const frame = marketOverviewFrame(rows, horizon);
  const sync = useMutation({
    mutationFn: (ids: string[]) => api.syncAtlasMarketBatch(ids),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelAtlasMarketBatch(id),
  });
  const batch = job?.seriesId === atlasMarketBatchId ? job : null;
  const busy = sync.isPending || job?.status === "running";
  const allRecent = entries.every(
    ({ query }) =>
      query.data?.provenance &&
      Date.now() - Date.parse(query.data.provenance.retrievedAt) < 86_400_000,
  );
  return (
    <section className="atlas-overview" aria-labelledby="atlas-overview-title">
      <div className="atlas-overview-heading">
        <div>
          <span className="atlas-kind">Viele Märkte · ein Bildprinzip</span>
          <h2 id="atlas-overview-title">Marktwellen im Überblick</h2>
        </div>
        <label className="atlas-numbers">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(event) => onNumbersChange(event.target.checked)}
          />{" "}
          Zahlen anzeigen
        </label>
      </div>
      <p className="atlas-explanation">
        Die Mitte jedes Bildes ist der eigene langfristige Trend. Oben liegt der
        Markt darüber, unten darunter. Die Karten teilen den Zeitraum und die
        Skala dieser Auswahl. Ein Klick öffnet das große Bild mit Quelle und
        Grenzen.
      </p>
      <div className="atlas-overview-controls">
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Marktgruppe"
        >
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Alle Märkte
          </button>
          {marketOverviewGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={filter === group.id}
              onClick={() => setFilter(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Zeitraum der Marktübersicht"
        >
          {[10, 20, null].map((years) => (
            <button
              key={String(years)}
              type="button"
              aria-pressed={horizon === years}
              onClick={() => setHorizon(years)}
            >
              {years ? `${years} Jahre` : "Gesamte Historie"}
            </button>
          ))}
        </div>
      </div>
      <div className="atlas-chart-label">
        <span>
          {overviewMonth(frame.first)} bis {overviewMonth(frame.last)} ·
          abgeschlossene Monate
        </span>
        <span>
          {showNumbers
            ? `Gemeinsamer Maßstab: ±${frame.extent} % Trendabstand`
            : "Gemeinsamer Maßstab · USD-Perspektive"}
        </span>
      </div>
      {isTauri() ? (
        <div className="atlas-overview-download">
          <Button
            disabled={Boolean(busy || allRecent)}
            onClick={() => {
              cancel.reset();
              sync.mutate(visible.map((p) => p.id));
            }}
          >
            <RefreshCw size={15} />
            {busy
              ? "Abruf läuft …"
              : allRecent
                ? "Auswahl heute bereits geladen"
                : "Auswahl laden / aktualisieren"}
          </Button>
          <span>
            Vorhandenes EODHD · aktuelle Daten werden übersprungen · ein Abruf
            je Fonds
          </span>
          {batch?.status === "running" && (
            <Button
              variant="default"
              disabled={
                cancel.isPending ||
                (cancel.isSuccess && cancel.variables === batch.id)
              }
              onClick={() => cancel.mutate(batch.id)}
            >
              <Square size={13} />
              {cancel.isSuccess && cancel.variables === batch.id
                ? "Stoppen vorgemerkt"
                : "Nach aktuellem Fonds stoppen"}
            </Button>
          )}
        </div>
      ) : (
        <p className="atlas-notice">
          Die Übersicht liest lokale Marktgeschichten in der Desktop-App. Im
          Browser werden keine Marktwerte simuliert.
        </p>
      )}
      {job?.status === "running" && (
        <div className="atlas-batch-progress">
          <progress
            max={job.pages || 1}
            value={job.page}
            aria-label="Fortschritt des Atlas-Abrufs"
          />
          <p role="status">{job.message}</p>
        </div>
      )}
      {batch && batch.status !== "running" && (
        <p
          className="atlas-job"
          role={batch.status === "failed" ? "alert" : "status"}
        >
          {batch.message}
        </p>
      )}
      {(sync.error || cancel.error) && (
        <p className="atlas-notice" role="alert">
          {errorText(sync.error ?? cancel.error)}
        </p>
      )}
      {entries.some(({ query }) => query.error) && (
        <p className="atlas-notice" role="alert">
          Einzelne lokale Marktgeschichten konnten nicht gelesen werden. Die
          betroffenen Karten zeigen den Fehler.{" "}
          <Button
            size="sm"
            onClick={() =>
              void client.invalidateQueries({ queryKey: ["atlas", "market"] })
            }
          >
            Lokalen Stand erneut prüfen
          </Button>
        </p>
      )}
      {marketOverviewGroups
        .filter((group) => filter === "all" || filter === group.id)
        .map((group) => (
          <section
            className="atlas-overview-group"
            key={group.id}
            aria-label={group.label}
          >
            <div className="atlas-overview-group-title">
              <h3>{group.label}</h3>
              <span>{group.description}</span>
            </div>
            <div className="atlas-wave-grid">
              {entries
                .filter(({ proxy }) => marketOverviewGroup(proxy) === group.id)
                .map(({ proxy, query }) => {
                  const row = query.data;
                  const reading = query.error
                    ? "Lokaler Lesefehler"
                    : marketOverviewReading(row);
                  const latest = row?.analysis.points.find(
                    (p) => p.month === overviewMonth(frame.last),
                  );
                  return (
                    <button
                      type="button"
                      key={proxy.id}
                      className={`atlas-wave-card${row?.analysis.stale ? " is-stale" : ""}`}
                      onClick={() => onChoose(proxy)}
                      aria-label={`${proxy.label}. ${proxy.scope}. ${reading}. Details öffnen.`}
                    >
                      <span className="atlas-wave-card-scope">
                        {proxy.scope}
                      </span>
                      <strong>
                        {proxy.label}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </strong>
                      {row ? (
                        <MiniWave row={row} frame={frame} />
                      ) : (
                        <div className="atlas-mini-empty">
                          <span>
                            {query.error
                              ? "Bild nicht lesbar"
                              : "Lokaler Stand wird geprüft …"}
                          </span>
                        </div>
                      )}
                      <span className="atlas-wave-card-reading">{reading}</span>
                      {row?.status === "available" && (
                        <span className="atlas-wave-card-meta">
                          Daten bis{" "}
                          {row.analysis.lastObservation ?? "unbekannt"}
                          {row.analysis.parameterSensitive
                            ? " · Zeitfenster prüfen"
                            : ""}
                          {row.analysis.missingMonths ? " · Datenlücken" : ""}
                        </span>
                      )}
                      {query.error && (
                        <span className="atlas-wave-card-meta">
                          {errorText(query.error)}
                        </span>
                      )}
                      {showNumbers && latest?.wave != null && (
                        <span className="atlas-wave-card-number">
                          {latest.wave.toLocaleString("de", {
                            maximumFractionDigits: 1,
                            signDisplay: "exceptZero",
                          })}{" "}
                          % Trendabstand
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      <p className="atlas-comparison-note">
        Die Fonds vertreten die jeweils genannte Region oder Branche. Globale
        Energieunternehmen bilden keinen einzelnen afrikanischen oder
        asiatischen Sektor ab. Die Wellen beschreiben geglättete Kurslage;
        fundamentale Bewertung und ein künftiger Wendepunkt lassen sich daraus
        allein nicht bestimmen.
      </p>
    </section>
  );
}
