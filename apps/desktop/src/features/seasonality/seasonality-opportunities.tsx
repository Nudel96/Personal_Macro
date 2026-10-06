import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarDays,
  DatabaseZap,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { PageLoading } from "../../components/ui/loading";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { useCloudOpportunities } from "./use-cloud-seasonality-scan";
import { localSeasonalityDate } from "./use-seasonality-date";
export { localSeasonalityDate } from "./use-seasonality-date";
import type {
  SeasonalOpportunity,
  SeasonalityOpportunityInput,
} from "../../types/domain";
import "./seasonality-opportunities.css";

const months = Array.from({ length: 12 }, (_, month) =>
  new Date(2001, month, 1).toLocaleDateString("de-DE", { month: "long" }),
);
const pct = (value: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value);
const rate = (value: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
const pp = (value: number) =>
  `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value * 100)} Pp.`;
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });

export function opportunityStatus(
  row: Pick<SeasonalOpportunity, "startDate" | "endDate">,
  today: string,
) {
  if (row.endDate < today) return "Vergangen";
  if (row.startDate > today) return "Bevorstehend";
  return "Läuft";
}

export function SeasonalityOpportunities({
  dataVersion,
  generation,
}: {
  dataVersion: string;
  generation?: string;
}) {
  const privateWeb = isPrivateWeb();
  const [today, setToday] = useState(localSeasonalityDate);
  const [month, setMonth] = useState("current");
  const [universe, setUniverse] =
    useState<SeasonalityOpportunityInput["universe"]>("fxFutures");
  const [limit, setLimit] = useState(5);
  const [mode, setMode] = useState("windows");
  const [selection, setSelection] = useState<string>();
  const [draft, setDraft] = useState({
    minDays: "7",
    maxDays: "45",
    minYears: "10",
    lookbackYears: "20",
    upcomingOnly: false,
  });
  const [filters, setFilters] = useState({
    minDays: 7,
    maxDays: 45,
    minYears: 10,
    lookbackYears: 20,
    upcomingOnly: false,
  });
  const [formError, setFormError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(localSeasonalityDate()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const input = useMemo<SeasonalityOpportunityInput>(
    () => ({
      asOf: today,
      month:
        month === "current"
          ? Number(today.slice(5, 7))
          : month === "all"
            ? null
            : Number(month),
      universe,
      // The control displays a prefix of the same ten ranked results without re-scanning.
      limit: 10,
      ...filters,
    }),
    [today, month, universe, filters],
  );
  const nativeQuery = useQuery({
    queryKey: ["seasonality", "opportunities", dataVersion, input],
    queryFn: () => api.seasonalityOpportunities(input),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: !privateWeb,
  });
  const cloudQuery = useCloudOpportunities(generation, input);
  const query = privateWeb ? cloudQuery : nativeQuery;
  const rows =
    (mode === "divergences" ? query.data?.divergences : query.data?.windows) ??
    [];
  const visible = rows.slice(0, limit);
  const selected = visible.find((row) => row.id === selection) ?? visible[0];
  const monthTitle = input.month
    ? `${months[input.month - 1]} ${today.slice(0, 4)}`
    : `Jahresübersicht ${today.slice(0, 4)}`;
  return (
    <Card
      className="seasonal-opportunities"
      aria-label="Saisonale Fenster und Divergenzen"
    >
      <CardHeader
        title={
          <>
            <CalendarDays size={18} aria-hidden="true" /> Stärkste saisonale
            Fenster
          </>
        }
        subtitle={`${monthTitle} · tägliche Startpunkte · die besten 1–10 Fenster auf einen Blick`}
        action={
          <span className="seasonal-source-label">
            {universe === "fxFutures"
              ? "Nur FX-Futures"
              : universe === "forex"
                ? "EODHD · Forex-Spot"
                : "EODHD · alle Märkte"}
          </span>
        }
      />
      <CardContent>
        {privateWeb && (
          <div className="page-actions">
            <Button
              onClick={() => void cloudQuery.refetch()}
              disabled={cloudQuery.isPending || !generation}
            >
              Fenstersuche berechnen
            </Button>
            {cloudQuery.isPending && (
              <Button onClick={cloudQuery.cancel}>
                Fenstersuche abbrechen
              </Button>
            )}
            <span role="status">
              {cloudQuery.isPending
                ? `${cloudQuery.completed} von ${cloudQuery.total || "…"} Märkten geprüft`
                : "Die Auswahl wird erst nach deinem Start berechnet. Der Datenstand bleibt während der Suche unverändert."}
            </span>
          </div>
        )}
        <div className="seasonal-scan-controls">
          <label>
            Datenbasis
            <select
              aria-label="Datenbasis der Fenstersuche"
              value={universe}
              onChange={(event) =>
                setUniverse(event.target.value as typeof universe)
              }
            >
              <option value="fxFutures">Ausschließlich FX-Futures</option>
              <option value="forex">Forex-Spot · 7 Hauptwährungen</option>
              <option value="all">Alle vorhandenen EODHD-Märkte</option>
            </select>
          </label>
          <label>
            Startmonat
            <select
              aria-label="Startmonat der Fenster"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="current">
                Aktueller Monat · {months[Number(today.slice(5, 7)) - 1]}
              </option>
              <option value="all">Ganzes Jahr</option>
              {months.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ergebnisse
            <select
              aria-label="Anzahl stärkster Fenster"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  Top {index + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="seasonal-scan-settings">
          <summary>
            Fensterlänge und Untersuchungsjahre{" "}
            <span>
              {filters.minDays}–{filters.maxDays} Kalendertage · mindestens{" "}
              {filters.minYears} aus {filters.lookbackYears} Jahren
            </span>
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = {
                minDays: Number(draft.minDays),
                maxDays: Number(draft.maxDays),
                minYears: Number(draft.minYears),
                lookbackYears: Number(draft.lookbackYears),
                upcomingOnly: draft.upcomingOnly,
              };
              if (
                ![
                  next.minDays,
                  next.maxDays,
                  next.minYears,
                  next.lookbackYears,
                ].every(Number.isInteger) ||
                next.minDays < 5 ||
                next.maxDays > 90 ||
                next.minDays > next.maxDays ||
                next.minYears < 5 ||
                next.lookbackYears > 50 ||
                next.minYears > next.lookbackYears
              ) {
                setFormError(
                  "Wähle 5–90 Kalendertage und mindestens 5 vollständige Jahre innerhalb der gewählten Historie (höchstens 50 Jahre).",
                );
                return;
              }
              setFormError("");
              setFilters(next);
            }}
          >
            <div className="seasonal-scan-controls">
              <label>
                Min. Kalendertage
                <input
                  aria-label="Minimale Fensterlänge"
                  type="number"
                  min="5"
                  max="90"
                  value={draft.minDays}
                  onChange={(event) =>
                    setDraft({ ...draft, minDays: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Max. Kalendertage
                <input
                  aria-label="Maximale Fensterlänge"
                  type="number"
                  min="5"
                  max="90"
                  value={draft.maxDays}
                  onChange={(event) =>
                    setDraft({ ...draft, maxDays: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Historie in Jahren
                <input
                  aria-label="Untersuchungszeitraum in Jahren"
                  type="number"
                  min="5"
                  max="50"
                  value={draft.lookbackYears}
                  onChange={(event) =>
                    setDraft({ ...draft, lookbackYears: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Mind. vollständige Jahre
                <input
                  aria-label="Mindestanzahl vollständiger Jahre"
                  type="number"
                  min="5"
                  max="50"
                  value={draft.minYears}
                  onChange={(event) =>
                    setDraft({ ...draft, minYears: event.target.value })
                  }
                  required
                />
              </label>
            </div>
            <div className="seasonal-scan-settings-actions">
              <label>
                <input
                  type="checkbox"
                  checked={draft.upcomingOnly}
                  onChange={(event) =>
                    setDraft({ ...draft, upcomingOnly: event.target.checked })
                  }
                />{" "}
                Nur laufende und kommende Fenster
              </label>
              <Button type="submit" size="sm">
                <Search size={14} /> Filter anwenden
              </Button>
            </div>
            {formError && <p role="alert">{formError}</p>}
          </form>
        </details>
        <Tabs.Root
          value={mode}
          onValueChange={setMode}
          className="seasonality-evidence-tabs"
        >
          <Tabs.List aria-label="Art der saisonalen Auswertung">
            <Tabs.Trigger value="windows">
              <CalendarDays size={14} /> Stärkste Fenster
            </Tabs.Trigger>
            <Tabs.Trigger value="divergences">
              <ArrowLeftRight size={14} /> Stärkste Divergenzen
            </Tabs.Trigger>
          </Tabs.List>
          {["windows", "divergences"].map((tab) => (
            <Tabs.Content key={tab} value={tab}>
              {query.isPending ? (
                <PageLoading />
              ) : privateWeb && !query.data && !query.isError ? (
                <p className="seasonal-scan-empty">
                  Wähle die Datenbasis und starte die Fenstersuche. Forex-Spot
                  und echte Futures bleiben getrennt.
                </p>
              ) : query.isError ? (
                <div className="seasonal-scan-empty" role="alert">
                  <EmptyState
                    icon={DatabaseZap}
                    title="Fenstersuche nicht verfügbar"
                    description={
                      (query.error as { message?: string }).message ??
                      "Die lokalen Tageskurse konnten nicht gelesen werden."
                    }
                  />
                  <Button size="sm" onClick={() => void query.refetch()}>
                    Erneut versuchen
                  </Button>
                </div>
              ) : query.data?.unavailableReason ? (
                <div className="seasonal-scan-empty">
                  <EmptyState
                    icon={DatabaseZap}
                    title="FX-Futures-Historie fehlt"
                    description={query.data.unavailableReason}
                  />
                  <div
                    className="seasonal-futures-catalog"
                    aria-label="Vorgesehene FX-Futures"
                  >
                    {[
                      "6E · EUR",
                      "6B · GBP",
                      "6J · JPY",
                      "6S · CHF",
                      "6C · CAD",
                      "6A · AUD",
                      "6N · NZD",
                    ].map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </div>
                  <p>
                    Die Monats- und Divergenzsuche lässt sich separat mit den
                    vorhandenen Forex-Spotdaten verwenden.
                  </p>
                  <Button size="sm" onClick={() => setUniverse("forex")}>
                    Forex-Spotdaten ansehen
                  </Button>
                </div>
              ) : !visible.length ? (
                <EmptyState
                  icon={Search}
                  title={
                    tab === "divergences"
                      ? "Keine passende Divergenz"
                      : "Keine belastbar rankbaren Fenster"
                  }
                  description={
                    tab === "divergences"
                      ? "Gesucht wird eine steigende und eine fallende Währung gegenüber USD, mit denselben Jahren und Handelstagen. Prüfe Monat, Mindestjahre und den geladenen Datenbestand."
                      : "Für diese Auswahl fehlen genügend vollständige Jahre oder ein eindeutiges historisches Muster. Passe die Filter an oder aktualisiere die EODHD-Daten."
                  }
                />
              ) : (
                <>
                  <p className="seasonal-scan-result" aria-live="polite">
                    Top {visible.length}{" "}
                    {tab === "divergences" ? "Divergenzen" : "Fenster"} ·{" "}
                    {monthTitle} · {query.data?.instrumentCount} Märkte /{" "}
                    {query.data?.currencyCount} USD-Währungsvergleiche
                    {visible.length < limit
                      ? ` · nur ${visible.length} passende, unterschiedliche Treffer`
                      : ""}
                  </p>
                  <div className="seasonal-opportunity-layout">
                    <ol className="seasonal-ranked-list">
                      {visible.map((row, index) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={`seasonal-ranked-window ${selected?.id === row.id ? "selected" : ""}`}
                            aria-pressed={selected?.id === row.id}
                            onClick={() => setSelection(row.id)}
                            aria-label={`Rang ${index + 1}: ${row.symbol}${row.comparisonSymbol ? ` gegen ${row.comparisonSymbol}` : ""}, ${dateLabel(row.startDate)} bis ${dateLabel(row.endDate)}`}
                          >
                            <span className="seasonal-rank">{index + 1}</span>
                            <span className="seasonal-window-name">
                              <strong>
                                {row.symbol}
                                {row.comparisonSymbol
                                  ? ` ↗ / ${row.comparisonSymbol} ↘`
                                  : row.direction === 1
                                    ? " ↗ Long"
                                    : " ↘ Short"}
                              </strong>
                              <span>
                                {dateLabel(row.startDate)} –{" "}
                                {dateLabel(row.endDate)}
                                {row.endDate.slice(0, 4) !==
                                row.startDate.slice(0, 4)
                                  ? ` ${row.endDate.slice(0, 4)}`
                                  : ""}{" "}
                                · {row.calendarDays} Kalendertage
                              </span>
                              <small>
                                {opportunityStatus(row, today)} · {row.samples}{" "}
                                Jahre · {row.source}
                              </small>
                            </span>
                            <span className="seasonal-window-values">
                              <strong
                                className={
                                  row.direction === 1
                                    ? "positive-text"
                                    : "negative-text"
                                }
                              >
                                {row.medianDifference !== null
                                  ? pp(row.medianDifference)
                                  : pct(row.medianReturn)}
                              </strong>
                              <span>
                                {rate(row.hitRate)}{" "}
                                {row.comparisonSymbol ? "gemeinsam" : "Treffer"}
                              </span>
                              <small>
                                {row.comparisonSymbol
                                  ? "Median-Abstand"
                                  : "Medianrendite"}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    {selected && (
                      <OpportunityDetail row={selected} today={today} />
                    )}
                  </div>
                </>
              )}
            </Tabs.Content>
          ))}
        </Tabs.Root>
        <details className="seasonal-scan-method">
          <summary>So werden Fenster und Divergenzen ermittelt</summary>
          <p>
            Ein Monatsfenster beginnt im gewählten Monat; sein Ende darf im
            Folgemonat oder Folgejahr liegen. Die Dauer zählt Kalendertage.
            Wochenenden und Feiertage werden auf den ersten verfügbaren
            Tageskurs danach verschoben (höchstens vier Kalendertage). Die
            tatsächlichen historischen Termine stehen beim Treffer.
          </p>
          <p>
            Die letzten {filters.lookbackYears} abgeschlossenen Kalenderjahre
            bilden den Untersuchungszeitraum. Ein Jahr benötigt Kurse am
            Jahresanfang und Jahresende sowie mindestens 180 Tageswerte. Fenster
            über Datenlücken von mehr als sieben Tagen werden ausgelassen. Der
            29. Februar wird als Fenstergrenze ausgelassen; er kann innerhalb
            eines historischen Fensters liegen.
          </p>
          <p>
            Rangfolge: zuerst die konservative 95%-Wilson-Untergrenze der
            Trefferquote, danach Medianbewegung relativ zur Schwankung und
            Stichprobengröße. Mittelwert und Median müssen dieselbe Richtung
            haben; mehr als die Hälfte der Jahre muss diese Richtung bestätigen.
            Fenster desselben Marktes und derselben Richtung mit mindestens 75%
            Überlappung werden zusammengefasst.
          </p>
          <p>
            Divergenzen vergleichen ausschließlich Währungen gegenüber USD auf
            gemeinsamen Tagen und gemeinsamen vollständigen Jahren. Eine Seite
            muss im Mittel und Median steigen, die andere fallen. „Gemeinsam“
            zählt Jahre, in denen beide Richtungen zugleich eintreten. Der
            Abstand wird pro Jahr als starke minus schwache Rendite berechnet
            und anschließend zusammengefasst. Prozentpunkte sind weder die
            Rendite eines handelbaren Spreads noch eine Berechnung mit
            Kontraktgrößen.
          </p>
          <p>
            Alle Rankings werden rückblickend im selben Datenbestand gesucht.
            Die Wilson-Grenze berücksichtigt die Auswahl aus vielen Fenstern
            nicht; sie ist kein Nachweis einer zukünftigen Trefferquote. Die
            Kurve zeigt ungeschönte Durchschnittsbewegungen der ausgewählten
            Jahre. Gebühren, Rollkosten und Hebel sind nicht enthalten.
          </p>
          {!!query.data?.excludedSymbols.length && (
            <p>
              Ohne nutzbare oder ausreichend lange Historie:{" "}
              {query.data.excludedSymbols.join(", ")}.
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}

export function OpportunityDetail({
  row,
  today,
}: {
  row: SeasonalOpportunity;
  today: string;
}) {
  const pair = row.comparisonSymbol !== null;
  return (
    <section
      className="seasonal-opportunity-detail"
      aria-label="Nachweise zum ausgewählten Fenster"
    >
      <header>
        <div>
          <span>
            {opportunityStatus(row, today)} · {row.calendarDays} Kalendertage
          </span>
          <h3>
            {dateLabel(row.startDate)} – {dateLabel(row.endDate)}{" "}
            {row.endDate.slice(0, 4)}
          </h3>
        </div>
        {pair ? (
          <ArrowLeftRight size={22} />
        ) : row.direction === 1 ? (
          <TrendingUp size={22} />
        ) : (
          <TrendingDown size={22} />
        )}
      </header>
      <p>
        {row.label}
        {pair ? ` / ${row.comparisonLabel}` : ""}
      </p>
      <div className="seasonal-evidence-metrics">
        <div>
          <span>{pair ? "Mittlerer Abstand" : "Mittlere Rendite"}</span>
          <strong>
            {pair ? pp(row.meanDifference!) : pct(row.meanReturn)}
          </strong>
        </div>
        <div>
          <span>
            {pair ? "Beide Richtungen zugleich" : "Historische Trefferquote"}
          </span>
          <strong>{rate(row.hitRate)}</strong>
        </div>
        <div>
          <span>Wilson-Untergrenze · 95%</span>
          <strong>{rate(row.wilsonLowerBound)}</strong>
        </div>
        <div>
          <span>Schwankung · {row.samples} Jahre</span>
          <strong>{pair ? pp(row.volatility) : pct(row.volatility)}</strong>
        </div>
      </div>
      {pair && (
        <div className="seasonal-divergence-legs">
          <span className="positive-text">
            {row.symbol} ↑ {pct(row.meanReturn)} im Mittel
          </span>
          <span className="negative-text">
            {row.comparisonSymbol} ↓ {pct(row.comparisonMeanReturn!)} im Mittel
          </span>
        </div>
      )}
      <BaseChart option={opportunityChartOption(row)} height={220} />
      <p className="seasonal-source-note">
        {pair
          ? "Durchschnittlicher Renditeabstand in Prozentpunkten"
          : "Durchschnitt der je Jahr am Einstieg auf 100 gesetzten Kurse"}{" "}
        · {row.samples} Jahre · ohne Glättung
      </p>
      <details className="seasonal-observations">
        <summary>Historische Termine und Einzeljahre ({row.samples})</summary>
        <div className="seasonal-observation-scroll">
          <table>
            <caption>
              {row.symbol}
              {pair ? ` / ${row.comparisonSymbol}` : ""} · tatsächlich
              verwendete Tageskurse
            </caption>
            <thead>
              <tr>
                <th>Jahr</th>
                <th>Einstieg</th>
                <th>Ausstieg</th>
                <th>{row.symbol}</th>
                {pair && (
                  <>
                    <th>{row.comparisonSymbol}</th>
                    <th>Abstand</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {row.observations.map((sample) => (
                <tr key={sample.year}>
                  <td>{sample.year}</td>
                  <td>{sample.entryDate}</td>
                  <td>{sample.exitDate}</td>
                  <td>{pct(sample.returnValue)}</td>
                  {pair && (
                    <>
                      <td>{pct(sample.comparisonReturn!)}</td>
                      <td>
                        {pp(sample.returnValue - sample.comparisonReturn!)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="seasonal-source-note">
        {row.source} · {row.sourceSymbol}
        {row.inverted ? " (Kehrwert für die USD-Notierung)" : ""}
        {pair
          ? ` / ${row.comparisonSourceSymbol}${row.comparisonInverted ? " (Kehrwert für die USD-Notierung)" : ""}`
          : ""}{" "}
        · Jahre: {row.years.join(", ")}
      </p>
    </section>
  );
}

export function opportunityChartOption(
  row: SeasonalOpportunity,
): EChartsOption {
  const pair = row.comparisonSymbol !== null;
  const dates = row.curve.map((point) => {
    const date = new Date(`${row.startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + point.day);
    return dateLabel(date.toISOString().slice(0, 10));
  });
  return {
    animation: false,
    grid: { top: 30, right: 22, bottom: 30, left: 56 },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (params) => {
        const item = Array.isArray(params) ? params[0] : params;
        const point = item && row.curve[item.dataIndex];
        if (!point) return "";
        const value =
          point.mean === null
            ? "Nicht verfügbar"
            : `${((pair ? 0 : 100) + point.mean * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })}${pair ? " Pp." : " Index"}`;
        return `${dates[item.dataIndex]}<br/>${value}<br/>${point.samples} gemeinsame Beobachtungsjahre`;
      },
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel,
      axisLine,
    },
    yAxis: {
      type: "value",
      scale: true,
      name: pair ? "Abstand · Pp." : "Index · Einstieg 100",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          value.toLocaleString("de-DE", { maximumFractionDigits: 2 }),
      },
      axisLine,
      splitLine,
    },
    series: [
      {
        name: pair ? "Saisonaler Abstand" : "Saisonaler Verlauf",
        type: "line",
        data: row.curve.map((point) =>
          point.mean === null ? null : (pair ? 0 : 100) + point.mean * 100,
        ),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: "#52c5ff", width: 2.5 },
        itemStyle: { color: "#52c5ff" },
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          data: [{ yAxis: pair ? 0 : 100 }],
        },
      },
    ],
  };
}
