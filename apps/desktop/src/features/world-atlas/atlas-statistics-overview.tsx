import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, Square } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import { atlasQuality, atlasUnits } from "./atlas-analysis";
import { atlasCatalog } from "./atlas-catalog";
import { atlasSeriesComparable } from "./atlas-source-series";
import type {
  AtlasGeography,
  AtlasSeriesDefinition,
  AtlasSyncJob,
} from "./atlas-types";
import {
  atlasStatisticsBatchId,
  statisticsFrame,
  statisticsGroup,
  statisticsGroups,
  statisticsPicture,
  statisticsReading,
} from "./atlas-statistics-overview-model";

const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Der lokale Statistikstand konnte nicht gelesen werden.";

export function AtlasStatisticsOverview({
  geography,
  comparison,
  showNumbers,
  onNumbersChange,
  job,
  filters,
  onFilters,
  onChoose,
}: {
  geography: AtlasGeography;
  comparison?: AtlasGeography;
  showNumbers: boolean;
  onNumbersChange: (show: boolean) => void;
  job: AtlasSyncJob | null | undefined;
  filters: {
    domain: string | null;
    group: string | null;
    horizon: string | null;
  };
  onFilters: (values: Record<string, string>) => void;
  onChoose: (definition: AtlasSeriesDefinition) => void;
}) {
  const catalog = atlasCatalog;
  const domains = catalog.domains.filter(
    (domain) => statisticsGroups(catalog, domain.id).length,
  );
  const domain =
    filters.domain === "all" ||
    domains.some((item) => item.id === filters.domain)
      ? filters.domain!
      : "people";
  const groups = statisticsGroups(catalog, domain);
  const group = groups.some((item) => item.id === filters.group)
    ? filters.group!
    : "all";
  const visibleGroups = groups.filter(
    (item) => group === "all" || item.id === group,
  );
  const definitions = visibleGroups.flatMap((group) =>
    catalog.topics
      .filter((topic) => topic.groupId === group.id)
      .flatMap((topic) =>
        catalog.series.filter((series) => series.topicId === topic.id),
      ),
  );
  const horizon =
    filters.horizon === "all" ? null : filters.horizon === "20" ? 20 : 40;
  const frame = statisticsFrame(horizon);
  const client = useQueryClient();
  const inputs = definitions.flatMap((definition) =>
    [geography, ...(comparison ? [comparison] : [])].map((area) => ({
      seriesId: definition.id,
      geographyId: area.id,
    })),
  );
  const queries = useQueries({
    queries: inputs.map((input) => ({
      queryKey: ["atlas", "series", input.seriesId, input.geographyId],
      queryFn: () => api.atlasSeries(input),
    })),
  });
  const entries = definitions.map((definition, index) => ({
    definition,
    query: queries[index * (comparison ? 2 : 1)],
    comparisonQuery: comparison ? queries[index * 2 + 1] : undefined,
  }));
  const sync = useMutation({
    mutationFn: (ids: string[]) => api.syncAtlasStatisticsBatch(ids),
    onSuccess: (job) => client.setQueryData(["atlas", "job"], job),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelAtlasStatisticsBatch(id),
  });
  const batch = job?.seriesId === atlasStatisticsBatchId ? job : null;
  const busy = sync.isPending || job?.status === "running";
  const allRecent =
    entries.length > 0 &&
    entries.every(
      ({ query }) =>
        query.data?.provenance &&
        Date.now() - Date.parse(query.data.provenance.retrievedAt) < 86_400_000,
    );
  const ready = entries.filter(
    ({ query }) => query.data?.status === "available",
  ).length;

  return (
    <section
      className="atlas-overview atlas-statistics-overview"
      aria-labelledby="atlas-statistics-title"
    >
      <div className="atlas-overview-heading">
        <div>
          <span className="atlas-kind">Länderbilder nach Themen</span>
          <h2 id="atlas-statistics-title">{geography.label} im Überblick</h2>
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
        Alle Bilder teilen denselben Zeitraum. Jede Statistik hat ihre eigene
        Einheit und Skala; zwei Länder verwenden innerhalb einer Karte denselben
        Maßstab. Höher bedeutet mehr von der jeweiligen Größe. Ein Klick öffnet
        das große Bild mit seiner Bedeutung.
      </p>
      <nav
        className="atlas-statistics-domains atlas-wave-horizons"
        aria-label="Felder der Länderübersicht"
      >
        <button
          type="button"
          aria-pressed={domain === "all"}
          onClick={() => onFilters({ statDomain: "all", statGroup: "" })}
        >
          Alle Themenfelder
        </button>
        {domains.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={domain === item.id}
            onClick={() => onFilters({ statDomain: item.id, statGroup: "" })}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="atlas-overview-controls">
        <label>
          Gruppe eingrenzen
          <select
            className="input"
            value={group}
            onChange={(event) => onFilters({ statGroup: event.target.value })}
          >
            <option value="all">Alle Gruppen dieses Feldes</option>
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div
          className="atlas-wave-horizons"
          role="group"
          aria-label="Zeitraum der Länderübersicht"
        >
          {[20, 40, null].map((years) => (
            <button
              type="button"
              key={String(years)}
              aria-pressed={horizon === years}
              onClick={() =>
                onFilters({ statHorizon: years ? String(years) : "all" })
              }
            >
              {years ? `${years} Jahre` : "Seit 1960"}
            </button>
          ))}
        </div>
      </div>
      <div className="atlas-chart-label">
        <span>
          {frame.first}–{frame.last} · Jahreswerte bis zum Vorjahr
        </span>
        <span>Eigener Maßstab je Statistik</span>
      </div>
      {comparison && (
        <div
          className="atlas-statistics-legend"
          aria-label="Länder im Vergleich"
        >
          <span>
            <i />
            {geography.label}
          </span>
          <span>
            <i />
            {comparison.label} · gestrichelt
          </span>
        </div>
      )}
      <p className="atlas-statistics-coverage" role="status">
        {showNumbers
          ? `${ready} von ${entries.length} Statistiken mit lokalen Werten für ${geography.label}.`
          : ready === entries.length
            ? "Die Auswahl enthält lokale Zeitreihen."
            : ready
              ? "Ein Teil der Auswahl enthält lokale Zeitreihen. Weitere Karten zeigen ihren Datenstatus."
              : "Die Karten zeigen, welche Daten noch fehlen oder geladen werden müssen."}{" "}
        Eine vorhandene Reihe kann ältere Werte oder Lücken enthalten.
      </p>
      {isTauri() ? (
        <div className="atlas-overview-download">
          <Button
            disabled={Boolean(busy || allRecent || !entries.length)}
            onClick={() => {
              cancel.reset();
              sync.mutate(definitions.map((definition) => definition.id));
            }}
          >
            <RefreshCw size={15} />
            {busy
              ? "Abruf läuft …"
              : allRecent
                ? "Auswahl innerhalb von 24 Stunden geladen"
                : "Auswahl laden / aktualisieren"}
          </Button>
          <span>
            Öffentliche Quellen · gewählte Statistiken für alle verfügbaren
            Länder · kürzlich Geladenes wird übersprungen
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
                : "Nach aktueller Statistik stoppen"}
            </Button>
          )}
        </div>
      ) : (
        <p className="atlas-notice">
          In der Desktop-App lassen sich die gewählten Statistiken gemeinsam
          laden und anschließend offline ansehen.
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
      {queries.some((query) => query.error) && (
        <p className="atlas-notice" role="alert">
          Einzelne lokale Daten konnten nicht gelesen werden.{" "}
          <Button
            size="sm"
            onClick={() =>
              void client.invalidateQueries({ queryKey: ["atlas", "series"] })
            }
          >
            Lokalen Stand erneut prüfen
          </Button>
        </p>
      )}
      {visibleGroups.map((group) => (
        <section
          className="atlas-overview-group"
          key={group.id}
          aria-label={group.label}
        >
          <div className="atlas-overview-group-title">
            <h3>{group.label}</h3>
            <span>Statistische Entwicklung</span>
          </div>
          <div className="atlas-wave-grid">
            {entries
              .filter(
                ({ definition }) =>
                  statisticsGroup(catalog, definition.topicId) === group.id,
              )
              .map(({ definition, query, comparisonQuery }) => {
                const row = query.data;
                const other = atlasSeriesComparable(definition)
                  ? comparisonQuery?.data
                  : undefined;
                const rows =
                  row?.status === "available"
                    ? [row, ...(other?.status === "available" ? [other] : [])]
                    : [];
                const picture = rows.length
                  ? statisticsPicture(rows, frame)
                  : null;
                const quality = row ? atlasQuality(row) : null;
                const reading = query.error
                  ? "Lokaler Lesefehler"
                  : picture
                    ? picture.quality!.trend
                    : row?.status === "available"
                      ? "Keine gemeinsame Datengrundlage in diesem Zeitraum"
                      : statisticsReading(row);
                const unit = atlasUnits[definition.unit] ?? definition.unit;
                return (
                  <button
                    type="button"
                    className="atlas-wave-card"
                    key={definition.id}
                    onClick={() => onChoose(definition)}
                    aria-label={`${definition.label}. ${geography.label}. ${reading}. Statistik öffnen.`}
                  >
                    <strong>
                      {definition.label}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </strong>
                    <span className="atlas-wave-card-scope">{unit}</span>
                    {picture ? (
                      <svg
                        viewBox="0 0 320 120"
                        className="atlas-mini-wave"
                        role="img"
                        aria-label={`${definition.label}: ${picture.rows.map((row) => row.name).join(" und ")}, ${frame.first} bis ${frame.last}. Eigener Maßstab je Statistik, gleiche Skala für beide Länder. Lücken bleiben offen.`}
                      >
                        <line
                          x1="8"
                          y1={picture.zeroY}
                          x2="312"
                          y2={picture.zeroY}
                          className="atlas-mini-middle"
                        />
                        {picture.rows.map((line, index) => (
                          <g
                            key={line.name}
                            className={
                              index ? "atlas-statistics-comparison" : undefined
                            }
                          >
                            <path d={line.path} className="atlas-mini-line" />
                            {line.isolated.map((point, index) => (
                              <circle
                                key={index}
                                cx={point.x}
                                cy={point.y}
                                r="3"
                                className="atlas-mini-point"
                              />
                            ))}
                          </g>
                        ))}
                      </svg>
                    ) : (
                      <div className="atlas-mini-empty">
                        <span>{reading}</span>
                      </div>
                    )}
                    {picture && (
                      <>
                        <span className="atlas-statistics-period">
                          <span>{frame.first}</span>
                          <span>{frame.last}</span>
                        </span>
                        <span className="atlas-wave-card-reading">
                          {reading}
                        </span>
                        <span className="atlas-wave-card-meta">
                          {picture.rows.length > 1
                            ? "Gemeinsames Bild"
                            : "Gezeigte Daten"}
                          : {picture.first}–{picture.last}
                        </span>
                      </>
                    )}
                    {quality?.extent && (
                      <span className="atlas-wave-card-meta">
                        {geography.label}: Daten bis {quality.extent.last}
                        {quality.old ? " · älterer Stand" : ""}
                        {quality.gaps.length ? " · mit Lücken" : ""}
                      </span>
                    )}
                    {definition.observationKind === "modeled_estimate" && (
                      <span className="atlas-wave-card-meta">
                        Modellschätzungen
                        {definition.throughYear != null
                          ? ` · Ausschnitt bis ${definition.throughYear}`
                          : ""}
                      </span>
                    )}
                    {definition.sourceId === "unsdg" && (
                      <span className="atlas-wave-card-meta">
                        UN-SDG · Erhebungen und Schätzungen
                      </span>
                    )}
                    {comparison && (
                      <span className="atlas-wave-card-meta">
                        {comparison.label}:{" "}
                        {!atlasSeriesComparable(definition)
                          ? "Nationale Definition · nur Erstland angezeigt"
                          : comparisonQuery?.error
                            ? "Lokaler Lesefehler"
                            : other?.status === "available"
                              ? (() => {
                                  const quality = atlasQuality(other);
                                  return `Daten bis ${quality.extent?.last ?? "unbekannt"}${quality.old ? " · älterer Stand" : ""}${quality.gaps.length ? " · mit Lücken" : ""}`;
                                })()
                              : statisticsReading(other)}
                      </span>
                    )}
                    {query.error && (
                      <span className="atlas-wave-card-meta">
                        {errorText(query.error)}
                      </span>
                    )}
                    {showNumbers &&
                      picture?.rows.map((line) => (
                        <span
                          key={line.name}
                          className="atlas-wave-card-number"
                        >
                          {line.name}:{" "}
                          {line.latest.value.toLocaleString("de", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          ({line.latest.year})
                        </span>
                      ))}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
      <p className="atlas-comparison-note">
        Die Übersicht zeigt die angebundenen Länderstatistiken.
        UN-Altersprofile, Stromwirtschaft, Jahrhundertperspektiven und
        Börsenwellen sind unter „Länder & Themen“ zusätzlich verfügbar. Die Höhe
        einer Statistik ist keine automatische Unter- oder Überbewertung.
      </p>
    </section>
  );
}
