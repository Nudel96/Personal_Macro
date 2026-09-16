import { useAtlasDisplayText } from "./atlas-display-state";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowUpRight, RefreshCw, Square } from "lucide-react";
import { Button } from "../../components/ui/button";
import { api, isTauri } from "../../services/commands";
import type { AtlasGeography, AtlasSyncJob } from "./atlas-types";
import { AtlasValuationChart } from "./atlas-valuation-chart";
import {
  valuationComparisonRegion,
  valuationRegionalComparison,
  regionalComparisonMessage,
  valuationYearRanges,
} from "./atlas-valuation-regions";
import {
  atlasValuationCatalog,
  atlasValuationJobPrefix,
  valuationDataset,
  valuationFrame,
  valuationGroups,
  valuationGroupIndustries,
  valuationTopicSelection,
  valuationMetricChoices,
  valuationReading,
} from "./atlas-valuation";
import type {
  ValuationSeries,
  ValuationSubject,
} from "./atlas-valuation-types";
import "./atlas-valuation.css";

const message = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Die Bewertungsgrundlage konnte nicht geladen werden.";

function SourceLink({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        if (isTauri()) {
          event.preventDefault();
          void openUrl(url);
        }
      }}
    >
      {children}
    </a>
  );
}

function Reading({ series }: { series: ValuationSeries | undefined }) {
  const point = series?.points[series.points.length - 1];
  return (
    <div className="atlas-valuation-reading">
      <strong>{valuationReading(series)}</strong>
      {point && <span>Veröffentlicht {point.year}</span>}
    </div>
  );
}

export default function AtlasValuationPanel({
  geography,
  comparison,
  showNumbers,
  onNumbersChange,
  job,
  filters,
  onNavigate,
}: {
  geography: AtlasGeography;
  comparison?: AtlasGeography;
  showNumbers: boolean;
  onNumbersChange: (show: boolean) => void;
  job: AtlasSyncJob | null | undefined;
  filters: {
    mode: string | null;
    basis: string | null;
    scope: string | null;
    metric: string | null;
    group: string | null;
    subject: string | null;
    compare: string | null;
    compareScope?: string | null;
    page: string | null;
    topic?: string | null;
  };
  onNavigate: (values: Record<string, string>) => void;
}) {
  const [search, setSearch] = useAtlasDisplayText("valSearch");
  const industries = filters.mode === "industries";
  const dataset = valuationDataset(filters.mode, filters.basis, filters.scope);
  const metrics = valuationMetricChoices(dataset);
  const defaultMetric = industries
    ? dataset.id.startsWith("pe-")
      ? "industry_pe_trailing"
      : "industry_pbv"
    : "country_median_pbv";
  const metric =
    metrics.find((m) => m.id === filters.metric) ??
    metrics.find((m) => m.id === defaultMetric)!;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["atlas", "valuation", dataset.id],
    queryFn: () => api.atlasValuation(dataset.id),
  });
  const sync = useMutation({
    mutationFn: (id: string) => api.syncAtlasValuation(id),
    onSuccess: (next) => client.setQueryData(["atlas", "job"], next),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelAtlasValuation(id),
  });
  const data = query.data?.data;
  const busy = sync.isPending || job?.status === "running";
  const fresh =
    query.data?.status === "available" &&
    data &&
    Date.now() - Date.parse(data.provenance.retrievedAt) < 86_400_000;
  const group =
    valuationGroups.find((g) => g.id === filters.group) ?? valuationGroups[0];
  const topicSelection = industries
    ? valuationTopicSelection(filters.topic)
    : null;
  const options = valuationGroupIndustries(
    group.id,
    search,
    topicSelection?.topicId,
  ).filter(
    (industry) =>
      topicSelection ||
      !data ||
      data.subjects.some((s) => s.id === industry.id),
  );
  const parsedPage = Number(filters.page ?? 0);
  const page =
    Number.isInteger(parsedPage) && parsedPage >= 0
      ? Math.min(parsedPage, Math.max(0, Math.ceil(options.length / 6) - 1))
      : 0;
  const cards = options.slice(page * 6, page * 6 + 6);
  const selectedIndustry = atlasValuationCatalog.industries.find(
    (i) =>
      i.id === filters.subject &&
      i.active &&
      (!topicSelection ||
        topicSelection.providerLabels.includes(i.providerLabel)),
  );
  const selectedId = industries ? selectedIndustry?.id : geography.id;
  const selected = data?.subjects.find((s) => s.id === selectedId);
  const regionalRequested = Boolean(
    industries && selectedIndustry && filters.compareScope,
  );
  const regionalDataset = regionalRequested
    ? valuationComparisonRegion(dataset, filters.compareScope)
    : null;
  const regionQuery = useQuery({
    queryKey: ["atlas", "valuation", regionalDataset?.id],
    queryFn: () => api.atlasValuation(regionalDataset!.id),
    enabled: Boolean(regionalDataset),
  });
  const regionalResult =
    regionalDataset && selectedId
      ? valuationRegionalComparison(
          query.data,
          regionQuery.data,
          dataset,
          regionalDataset,
          selectedId,
          metric,
        )
      : null;
  const regionFresh =
    regionQuery.data?.status === "available" &&
    regionQuery.data.data &&
    Date.now() - Date.parse(regionQuery.data.data.provenance.retrievedAt) <
      86400000;
  const currentJob = [dataset.id, regionalDataset?.id].some(
    (id) => id && job?.seriesId === `${atlasValuationJobPrefix}${id}`,
  )
    ? job
    : null;
  const comparisonId = industries
    ? regionalRequested
      ? null
      : filters.compare
    : comparison?.id;
  const second = data?.subjects.find(
    (s) => s.id === comparisonId && s.id !== selectedId,
  );
  const getSeries = (subject: ValuationSubject | undefined) =>
    subject?.series.find((s) => s.metricId === metric.id);
  const localRows = [selected, second].flatMap((s) =>
    s && getSeries(s) ? [{ label: s.label, series: getSeries(s)! }] : [],
  );
  const rows = regionalRequested
    ? [
        ...(selected && getSeries(selected)
          ? [
              {
                label: `${selected.label} · ${dataset.scopeLabel}`,
                series: getSeries(selected)!,
              },
            ]
          : []),
        ...(regionalResult?.status === "available"
          ? [
              {
                label: `${selectedIndustry!.label} · ${regionalDataset!.scopeLabel}`,
                series: regionalResult.series,
              },
            ]
          : []),
      ]
    : localRows;
  const years = dataset.files
    .filter((f) => f.fields.some((field) => field.metricId === metric.id))
    .map((f) => f.publicationYear);
  const cardSeries = cards.flatMap((i) => {
    const series = getSeries(data?.subjects.find((s) => s.id === i.id));
    return series ? [series] : [];
  });
  const frame = valuationFrame(cardSeries, metric, years);
  const latestYear = years[years.length - 1];
  const chartYears =
    regionalResult?.status === "available"
      ? [
          ...new Set([
            ...years,
            ...regionalDataset!.files
              .filter((f) => f.fields.some((v) => v.metricId === metric.id))
              .map((f) => f.publicationYear),
          ]),
        ].sort((a, b) => a - b)
      : years;
  const singleSnapshot = chartYears.length === 1;
  const modeTitle = industries ? dataset.scopeLabel : geography.label;
  return (
    <section
      className="atlas-overview atlas-valuation"
      aria-labelledby="atlas-valuation-title"
    >
      <div className="atlas-overview-heading">
        <div>
          <span className="atlas-kind">
            Veröffentlichte Unternehmensbewertungen
          </span>
          <h2 id="atlas-valuation-title">Bewertungsbilder · {modeTitle}</h2>
        </div>
        <label className="atlas-numbers">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => onNumbersChange(e.target.checked)}
          />{" "}
          Zahlen anzeigen
        </label>
      </div>
      <div
        className="atlas-wave-horizons"
        role="group"
        aria-label="Bewertungsperspektive"
      >
        <button
          type="button"
          aria-pressed={!industries}
          onClick={() =>
            onNavigate({
              valMode: "countries",
              valMetric: "",
              valSubject: "",
              valCompare: "",
              valCompareScope: "",
              valTopic: "",
            })
          }
        >
          Länder
        </button>
        <button
          type="button"
          aria-pressed={industries}
          onClick={() =>
            onNavigate({
              valMode: "industries",
              valMetric: "",
              valSubject: "",
              valCompare: "",
              valCompareScope: "",
              valTopic: "",
            })
          }
        >
          Branchen
        </button>
      </div>
      <p className="atlas-explanation">
        {industries
          ? "Eine ruhige Übersicht über veröffentlichte Branchenbewertungen."
          : "Die veröffentlichten Kennzahlen der Unternehmensstichprobe dieses Landes."}{" "}
        Hoch und tief beziehen sich auf die eigene vergleichbare Vorgeschichte.
        Ein fairer Wert lässt sich daraus allein nicht bestimmen.
      </p>
      {topicSelection && (
        <div
          className="atlas-valuation-topic"
          aria-label="Gewählte Themenbranchen"
        >
          <div>
            <strong>Branchen zum Thema {topicSelection.topicLabel}</strong>
            <p>{topicSelection.scopeNote}</p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              onNavigate({
                valTopic: "",
                valSubject: "",
                valCompare: "",
                valCompareScope: "",
                valPage: "",
                valSearch: "",
              })
            }
          >
            Alle Branchenfelder
          </Button>
        </div>
      )}
      <div className="atlas-valuation-controls">
        {industries && (
          <>
            <label>
              Bewertungsgrundlage
              <select
                className="input"
                value={dataset.id.startsWith("pe-") ? "pe" : "pbv"}
                onChange={(e) =>
                  onNavigate({
                    valBasis: e.target.value,
                    valMetric: "",
                  })
                }
              >
                <option value="pbv">
                  {valuationDataset("industries", "pbv", dataset.regionId).files
                    .length > 1
                    ? "Buchwerte · längere Archive"
                    : "Buchwerte · Momentaufnahme"}
                </option>
                <option value="pe" disabled={dataset.regionId === "rest"}>
                  {dataset.regionId === "rest"
                    ? "Gewinne · für diese Gruppe nicht angebunden"
                    : valuationDataset("industries", "pe", dataset.regionId)
                          .files.length > 1
                      ? "Gewinne · längere Archive"
                      : "Gewinne · Momentaufnahme"}
                </option>
              </select>
            </label>
            <label>
              Quellenregion
              <select
                className="input"
                value={dataset.regionId}
                onChange={(e) =>
                  onNavigate({
                    valScope: e.target.value,
                  })
                }
              >
                {atlasValuationCatalog.datasets
                  .filter((d) =>
                    d.id.startsWith(
                      dataset.id.startsWith("pe-") ? "pe-" : "pbv-",
                    ),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.regionId}>
                      {d.scopeLabel}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        <label>
          Kennzahl
          <select
            className="input"
            value={metric.id}
            onChange={(e) => onNavigate({ valMetric: e.target.value })}
          >
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {industries ? (
        <p className="atlas-comparison-note">
          Geltungsbereich: <strong>{dataset.scopeLabel}</strong>. Die Branchen
          umfassen börsennotierte Firmen dieser Quellenregion. Ein Branchenbild
          für ganz Afrika, einzelne afrikanische Länder, Wasserstoff oder
          Kernenergie ist in dieser Quelle nicht separat enthalten.
        </p>
      ) : (
        <p className="atlas-comparison-note">
          Ab 2021 veröffentlicht die Quelle Mediane, davor Mittelwerte. Beide
          bleiben getrennte Bilder. Die Länderstichprobe ist kein
          unveränderlicher Börsenindex.
        </p>
      )}
      {metric.kind === "forecast_valuation" && (
        <p className="atlas-notice">
          Erwartungsgröße aus dem jeweiligen Veröffentlichungsstand. Sie beruht
          auf damaligen Gewinnschätzungen und erhält keine historische
          Hoch-/Tiefeinordnung.
        </p>
      )}
      {metric.kind === "legacy_valuation" && (
        <p className="atlas-notice">
          Ältere Archivdefinition: Die damalige Tabelle grenzt Verlustfirmen
          nicht ausdrücklich ab. Dieses Bild bleibt eigenständig und erhält
          keine historische Hoch-/Tiefeinordnung.
        </p>
      )}
      {query.isPending && (
        <p role="status">Lokale Bewertungstabellen werden gelesen …</p>
      )}
      {query.error && (
        <div className="atlas-notice" role="alert">
          {message(query.error)}{" "}
          <Button size="sm" onClick={() => void query.refetch()}>
            Erneut prüfen
          </Button>
        </div>
      )}
      {query.data?.status === "previous_catalog" && (
        <p className="atlas-notice">
          Dieser lokale Stand stammt aus einer früheren Quellenzuordnung. Er
          bleibt lesbar; die aktuelle Grundlage kann neu geladen werden.
        </p>
      )}
      {!data && query.data && (
        <div className="atlas-empty">
          <h3>
            {query.data.status === "desktop_required"
              ? "Bewertungsbilder in der Desktop-App laden"
              : "Diese Bewertungsgrundlage ist noch nicht lokal gespeichert"}
          </h3>
          <p>
            Öffentliche NYU-Jahrestabellen von Aswath Damodaran. Ein Abruf lädt
            die ausgewählte Quellenregion mit ihren verfügbaren Branchen
            beziehungsweise alle enthaltenen Länder. Anschließend sind die
            Bilder offline nutzbar.
          </p>
        </div>
      )}
      {data && (
        <>
          <div className="atlas-reading">
            <strong>
              {singleSnapshot
                ? "Momentaufnahme ohne langfristige Welle"
                : "Jährliche veröffentlichte Bewertungen"}
            </strong>
            <span>NYU / Aswath Damodaran · Stand {latestYear}</span>
          </div>
          {latestYear < new Date().getUTCFullYear() && (
            <p className="atlas-notice">
              Diese geprüfte Definition endet {latestYear}.{" "}
              {metric.id.includes("_mean_")
                ? "Neuere Länderstände verwenden Mediane; sie sind über die Kennzahl auswählbar."
                : metric.id.endsWith("_legacy")
                  ? "Neuere Tabellen verwenden genauer bezeichnete Kennzahlen; sie sind über die Kennzahlauswahl erreichbar."
                  : "Ein neuerer Stand ist hier noch nicht enthalten."}
            </p>
          )}
          {industries && !selectedIndustry ? (
            <>
              <div className="atlas-valuation-controls">
                {!topicSelection && (
                  <label>
                    Branchenfeld
                    <select
                      className="input"
                      value={group.id}
                      onChange={(e) => {
                        setSearch("");
                        onNavigate({ valGroup: e.target.value, valPage: "" });
                      }}
                    >
                      {valuationGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Branche suchen
                  <input
                    className="input"
                    type="search"
                    value={search}
                    placeholder={
                      topicSelection
                        ? "In dieser Themenauswahl suchen"
                        : "Zum Beispiel Bildung oder Halbleiter"
                    }
                    onChange={(e) => {
                      setSearch(e.target.value);
                      onNavigate({ valPage: "" });
                    }}
                  />
                </label>
              </div>
              <p className="atlas-comparison-note">
                Alle sichtbaren Karten teilen Zeitraum und Skala.
                Unterschiedliche Branchen haben unterschiedliche typische
                Bewertungsniveaus; die Einordnung unter jeder Karte bezieht sich
                auf ihre eigene Vorgeschichte.
              </p>
              <div className="atlas-valuation-grid">
                {cards.map((industry) => {
                  const subject = data.subjects.find(
                    (s) => s.id === industry.id,
                  );
                  const series = getSeries(subject);
                  return (
                    <button
                      type="button"
                      className="atlas-valuation-card"
                      key={industry.id}
                      onClick={() =>
                        onNavigate({
                          valSubject: industry.id,
                          valCompare: "",
                          valCompareScope: "",
                        })
                      }
                    >
                      <h3>
                        {industry.label}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </h3>
                      <AtlasValuationChart
                        rows={series ? [{ label: industry.label, series }] : []}
                        metric={metric}
                        years={years}
                        showNumbers={showNumbers}
                        compact
                        frame={frame}
                      />
                      <Reading series={series} />
                    </button>
                  );
                })}
              </div>
              {!options.length && (
                <p className="atlas-notice">
                  Keine separat veröffentlichte Branche zu diesem Suchbegriff.
                  {topicSelection
                    ? " Die Suche bleibt auf dieses Thema begrenzt. Über „Alle Branchenfelder“ kannst du die übrigen Branchen öffnen."
                    : " Breitere Quellenbranchen findest du über das Branchenfeld."}
                </p>
              )}
              {options.length > 6 && (
                <div className="atlas-valuation-paging">
                  <Button
                    size="sm"
                    disabled={page === 0}
                    onClick={() => onNavigate({ valPage: String(page - 1) })}
                  >
                    Vorherige Bilder
                  </Button>
                  <span>
                    {showNumbers
                      ? `Seite ${page + 1} von ${Math.ceil(options.length / 6)}`
                      : "Weitere Branchen im gewählten Feld"}
                  </span>
                  <Button
                    size="sm"
                    disabled={(page + 1) * 6 >= options.length}
                    onClick={() => onNavigate({ valPage: String(page + 1) })}
                  >
                    Weitere Bilder
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {industries && (
                <div className="atlas-valuation-controls">
                  <Button
                    size="sm"
                    onClick={() =>
                      onNavigate({
                        valSubject: "",
                        valCompare: "",
                        valCompareScope: "",
                      })
                    }
                  >
                    <ArrowLeft size={15} /> Zur Branchenübersicht
                  </Button>
                  <label>
                    Branche vergleichen
                    <select
                      className="input"
                      value={second?.id ?? ""}
                      onChange={(e) =>
                        onNavigate({
                          valCompare: e.target.value,
                          valCompareScope: "",
                        })
                      }
                    >
                      <option value="">Einzelbild</option>
                      {atlasValuationCatalog.industries
                        .filter((i) => i.active && i.id !== selectedId)
                        .sort((a, b) => a.label.localeCompare(b.label, "de"))
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Dieselbe Branche in einer anderen Region
                    <select
                      className="input"
                      aria-label="Quellenregion vergleichen"
                      value={regionalDataset?.regionId ?? ""}
                      onChange={(e) =>
                        onNavigate({
                          valCompareScope: e.target.value,
                          valCompare: "",
                        })
                      }
                    >
                      <option value="">Keine zweite Region</option>
                      {atlasValuationCatalog.datasets
                        .filter(
                          (d) =>
                            valuationComparisonRegion(dataset, d.regionId)
                              ?.id === d.id,
                        )
                        .map((d) => (
                          <option key={d.id} value={d.regionId}>
                            {d.scopeLabel}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
              <h3>
                {industries ? selectedIndustry?.label : geography.label}
                {second ? ` · Vergleich mit ${second.label}` : ""}
              </h3>
              {regionalRequested && (
                <div
                  className="atlas-comparison-note"
                  role={regionQuery.error ? "alert" : "status"}
                  aria-label="Regionaler Bewertungsvergleich"
                >
                  {!regionalDataset ? (
                    "Diese Vergleichsregion ist für die gewählte Bewertungsgrundlage nicht angebunden."
                  ) : regionQuery.isPending ? (
                    `${regionalDataset.scopeLabel}: lokale Vergleichsdaten werden gelesen …`
                  ) : regionQuery.error ? (
                    <>
                      {regionalDataset.scopeLabel}: {message(regionQuery.error)}{" "}
                      <Button
                        size="sm"
                        onClick={() => void regionQuery.refetch()}
                      >
                        Vergleich erneut prüfen
                      </Button>
                    </>
                  ) : regionalResult?.status !== "available" ? (
                    `${regionalDataset.scopeLabel}: ${regionalComparisonMessage[regionalResult?.status ?? "not_ready"]}`
                  ) : (
                    <>
                      {dataset.scopeLabel} und {regionalDataset.scopeLabel}:
                      gemeinsame Veröffentlichungsjahre{" "}
                      {valuationYearRanges(regionalResult.commonYears)}. Eigene
                      Vorgeschichten bleiben sichtbar. Die Firmenstichproben
                      unterscheiden sich; die höhere Linie allein bedeutet keine
                      Überbewertung.
                    </>
                  )}
                </div>
              )}
              {!selected && (
                <p className="atlas-notice">
                  Für {industries ? selectedIndustry?.label : geography.label}{" "}
                  enthält diese Quelle keine eigene zugeordnete Reihe. Andere
                  Länder oder größere Quellenregionen werden nicht eingesetzt.
                </p>
              )}
              {selected && (
                <>
                  <div className="atlas-valuation-legend">
                    {rows.map((r, i) => (
                      <span key={r.label} className={i ? "is-comparison" : ""}>
                        {r.label}
                      </span>
                    ))}
                  </div>
                  <AtlasValuationChart
                    rows={rows}
                    metric={metric}
                    years={chartYears}
                    showNumbers={showNumbers}
                  />
                  <div className="atlas-valuation-readings">
                    {rows.map((r) => (
                      <div key={r.label}>
                        <span>{r.label}</span>
                        <Reading series={r.series} />
                      </div>
                    ))}
                  </div>
                  {rows.some(
                    (r) => r.series.historicalPosition.status === "available",
                  ) && (
                    <p className="atlas-comparison-note">
                      Die Einordnung verwendet ausschließlich frühere sinnvolle
                      Jahreswerte derselben Definition. Im Einzelbild zeigt die
                      gestrichelte Linie deren Mitte. Sie ist kein berechneter
                      fairer Wert.
                    </p>
                  )}
                  {rows.some(
                    (r) => r.series.historicalPosition.compositionChanged,
                  ) && (
                    <p className="atlas-notice">
                      Die Firmenzahl hat sich gegenüber Teilen der Vorgeschichte
                      stark verändert. Das schränkt die Vergleichbarkeit
                      zusätzlich ein.
                    </p>
                  )}
                  {showNumbers && (
                    <div className="atlas-valuation-data">
                      <table>
                        <caption>Originalwerte · {metric.label}</caption>
                        <thead>
                          <tr>
                            <th>Veröffentlichung</th>
                            {rows.map((r) => (
                              <th key={r.label}>{r.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ...new Set(
                              rows.flatMap((r) =>
                                r.series.points.map((p) => p.year),
                              ),
                            ),
                          ]
                            .sort((a, b) => b - a)
                            .map((year) => (
                              <tr key={year}>
                                <th>{year}</th>
                                {rows.map((r) => {
                                  const p = r.series.points.find(
                                    (p) => p.year === year,
                                  );
                                  return (
                                    <td key={r.label}>
                                      {p?.value == null
                                        ? "Nicht verfügbar"
                                        : `${(metric.unit === "share" ? p.value * 100 : p.value).toLocaleString("de", { maximumFractionDigits: 2 })}${metric.unit === "share" ? " %" : "×"}`}
                                      {p && p.status !== "available"
                                        ? " · nicht sinnvoll einzuordnen"
                                        : ""}
                                      {p && (
                                        <small>
                                          {p.firmCount.toLocaleString("de")}{" "}
                                          Firmen insgesamt · Anzahl je Kennzahl
                                          kann abweichen
                                        </small>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {!industries && comparison && !second && (
                <p className="atlas-notice">
                  Für {comparison.label} fehlt eine eigene Quellenreihe für
                  diesen Vergleich.
                </p>
              )}
              {second && !getSeries(second) && (
                <p className="atlas-notice">
                  Für {second.label} fehlt die ausgewählte Definition.
                </p>
              )}
            </>
          )}
        </>
      )}
      <p className="atlas-comparison-note">
        {singleSnapshot
          ? "Ein Punkt zeigt einen veröffentlichten Stand. Eine langfristige Welle benötigt eine längere Geschichte."
          : "Punkte zeigen Jahresstände. Lücken und die geänderte Branchengliederung unterbrechen die Linie."}
      </p>
      {isTauri() && (
        <div className="atlas-overview-download">
          <Button
            size="sm"
            disabled={busy || Boolean(fresh)}
            onClick={() => {
              cancel.reset();
              sync.mutate(dataset.id);
            }}
          >
            <RefreshCw size={14} />{" "}
            {industries
              ? "Diese Quellenregion laden"
              : "Länderbewertungen laden"}
          </Button>
          <span>
            {fresh
              ? "Innerhalb des letzten Tages bereits abgerufen."
              : "Kostenloser öffentlicher Download · ohne API-Schlüssel"}
          </span>
          {regionalDataset && (
            <Button
              size="sm"
              disabled={busy || Boolean(regionFresh)}
              onClick={() => {
                cancel.reset();
                sync.mutate(regionalDataset.id);
              }}
            >
              {regionalDataset.scopeLabel}: Vergleichsregion laden
            </Button>
          )}
        </div>
      )}
      {busy && (
        <div className="atlas-valuation-progress" role="status">
          <p>
            {currentJob?.status === "running"
              ? currentJob.message
              : "Ein Atlas-Abruf läuft. Lokale Bilder bleiben verfügbar."}
          </p>
          {currentJob?.status === "running" && (
            <>
              <progress
                aria-label="Geprüfte Bewertungstabellen"
                max={currentJob.pages}
                value={currentJob.page}
              />
              <Button
                size="sm"
                disabled={cancel.isPending || cancel.isSuccess}
                onClick={() => cancel.mutate(currentJob.id)}
              >
                <Square size={13} />{" "}
                {cancel.isSuccess
                  ? "Wird nach dieser Datei gestoppt"
                  : "Nach dieser Datei stoppen"}
              </Button>
            </>
          )}
        </div>
      )}
      {currentJob && currentJob.status !== "running" && (
        <p
          className={
            currentJob.status === "failed"
              ? "atlas-notice"
              : "atlas-comparison-note"
          }
          role="status"
        >
          {currentJob.message}
        </p>
      )}
      {(sync.error || cancel.error) && (
        <p className="atlas-notice" role="alert">
          {message(sync.error ?? cancel.error)}
        </p>
      )}
      <details className="atlas-details">
        <summary>Quelle, Bedeutung und Grenzen</summary>
        <p>{metric.explanation}</p>
        <p>
          Aswath Damodaran, NYU Stern. Jahresveröffentlichungen überwiegend im
          Januar; Börsenwerte liegen meist nahe dem vorangegangenen Jahresende.
          Die verfügbaren Unternehmensabschlüsse sind zeitlich verzögert. Das
          Veröffentlichungsjahr ist keine tagesaktuelle Bewertung.
        </p>
        <p>
          Firmenauswahl, Branchenmix und Zuordnung können sich ändern. Gleiche
          Bezeichnungen garantieren keinen unveränderlichen Index. Vor und ab
          2014 bleiben die Branchenabschnitte getrennt; eine historische
          Einordnung benötigt mindestens zehn frühere sinnvolle Stände desselben
          Abschnitts und mindestens zwanzig Firmen je verwendetem Quellenstand.
          Diese Mindestzahl bezieht sich auf die gesamte Quellenzeile, weil
          keine verlässliche Firmenzahl je Einzelkennzahl veröffentlicht wird.
        </p>
        <p>
          Fehlende, fehlerhafte und nicht positive Bewertungsverhältnisse
          erzeugen keine günstige Bewertung. Buchwerte sind bei Firmen mit
          vielen immateriellen Werten nur eingeschränkt aussagekräftig.
          Gewinn-Mittelwerte profitabler Firmen und aggregierte Gewinne
          einschließlich Verlustfirmen sind ausdrücklich getrennte Kennzahlen.
        </p>
        <p>
          <SourceLink url={atlasValuationCatalog.sourceUrl}>
            Aktuelle NYU-Daten
          </SourceLink>{" "}
          ·{" "}
          <SourceLink url={atlasValuationCatalog.archiveUrl}>
            Veröffentlichungsarchiv
          </SourceLink>{" "}
          ·{" "}
          <SourceLink url={atlasValuationCatalog.methodologyUrl}>
            Quellenmethodik und Nutzung
          </SourceLink>
        </p>
        {data && (
          <>
            <p>
              Lokal abgerufen:{" "}
              {new Date(data.provenance.retrievedAt).toLocaleDateString("de")}.
              Die Quelldateien werden mit Datum und Prüfsumme dokumentiert.
            </p>
            {data.provenance.excludedSubjects.length > 0 && (
              <p>
                Ausgelassene Quellenzeilen:{" "}
                {data.provenance.excludedSubjects.join("; ")}. Frühere
                Sammelgebiete werden keinem heutigen Nachfolgestaat
                zugeschlagen.
              </p>
            )}
            <ul>
              {data.provenance.files.map((file) => (
                <li key={file.fileName}>
                  <SourceLink url={file.url}>
                    Veröffentlichung {file.publicationYear}
                    {file.workbookDate
                      ? ` · ${file.workbookDate}`
                      : " · Stand laut Archiv"}
                  </SourceLink>
                </li>
              ))}
            </ul>
          </>
        )}
        {regionalDataset && regionQuery.data?.data && (
          <>
            <p>
              Vergleichsquelle: {regionalDataset.scopeLabel}. Lokal abgerufen:{" "}
              {new Date(
                regionQuery.data.data.provenance.retrievedAt,
              ).toLocaleDateString("de")}
              .
            </p>
            <ul>
              {regionQuery.data.data.provenance.files.map((file) => (
                <li key={file.fileName}>
                  <SourceLink url={file.url}>
                    {regionalDataset.scopeLabel} · Veröffentlichung{" "}
                    {file.publicationYear}
                    {file.workbookDate
                      ? ` · ${file.workbookDate}`
                      : " · Stand laut Archiv"}
                  </SourceLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}
