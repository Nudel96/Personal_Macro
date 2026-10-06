import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  DatabaseZap,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { PageLoading } from "../../components/ui/loading";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { OpportunityDetail } from "./seasonality-opportunities";
import { useCloudScreener } from "./use-cloud-seasonality-scan";
import { useSeasonalityDate } from "./use-seasonality-date";
import {
  assertMarketWindowHorizon,
  calendarDaysBetween,
  marketHorizonEnd,
  rankedMarketWindows,
} from "./market-window-ranking";
import "./seasonality-market-opportunities.css";

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
const percent = (value: number, signed = false) =>
  new Intl.NumberFormat("de-DE", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);

export function SeasonalityMarketOpportunities({
  dataVersion,
  generation,
  profileVersion,
  hasProfiles,
}: {
  dataVersion: string;
  generation?: string;
  profileVersion: string;
  hasProfiles: boolean;
}) {
  const privateWeb = isPrivateWeb();
  const today = useSeasonalityDate();
  const input = useMemo(() => ({ asOf: today }), [today]);
  const [category, setCategory] = useState("all");
  const [direction, setDirection] = useState<"all" | "long" | "short">("all");
  const [limit, setLimit] = useState(10);
  const [selection, setSelection] = useState<string>();
  const nativeQuery = useQuery({
    queryKey: [
      "seasonality",
      "market-windows",
      dataVersion,
      profileVersion,
      input,
    ],
    queryFn: async () =>
      assertMarketWindowHorizon(await api.seasonalityScreener(input), today),
    enabled: !privateWeb && hasProfiles,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const cloudQuery = useCloudScreener(generation, input);
  const query = privateWeb ? cloudQuery : nativeQuery;
  const loading = privateWeb ? cloudQuery.isPending : nativeQuery.isFetching;
  const rows = query.data ?? [];
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  const visible = rankedMarketWindows(rows, category, direction, limit);
  const selected = visible.find((row) => row.id === selection) ?? visible[0];
  const marketsWithWindows = rows.filter(
    (row) => row.upcomingWindows?.length,
  ).length;

  return (
    <Card
      className="seasonal-opportunities seasonality-market-opportunities"
      aria-label="Chancen im Markt für die nächsten 90 Tage"
    >
      <CardHeader
        title={
          <>
            <CalendarDays size={18} aria-hidden="true" /> Chancen im Markt
          </>
        }
        subtitle={`Nächste 90 Tage · ${dateLabel(today)} – ${dateLabel(marketHorizonEnd(today))} · tägliche Startpunkte`}
        action={
          <span className="seasonal-source-label">
            EODHD · historische Tageskurse
          </span>
        }
      />
      <CardContent>
        <div className="seasonality-market-toolbar">
          <div className="seasonal-scan-controls">
            <label>
              Assetklasse
              <select
                aria-label="Assetklasse der Marktchancen"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">Alle Märkte</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Richtung
              <select
                aria-label="Richtung der Marktchancen"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as typeof direction)
                }
              >
                <option value="all">Long & Short</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label>
              Ergebnisse
              <select
                aria-label="Anzahl bester Marktchancen"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              >
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
              </select>
            </label>
          </div>
          <div className="seasonality-market-actions">
            <Button
              size="sm"
              onClick={() => void query.refetch()}
              disabled={loading || !hasProfiles || (privateWeb && !generation)}
            >
              {privateWeb ? "Screener berechnen" : "Chancen neu berechnen"}
            </Button>
            {privateWeb && cloudQuery.isPending && (
              <Button size="sm" onClick={cloudQuery.cancel}>
                Berechnung abbrechen
              </Button>
            )}
          </div>
        </div>
        <p className="seasonality-market-method-note">
          Einstieg und Ausstieg innerhalb der nächsten 90 Kalendertage ·
          mindestens 5 vollständige Jahre aus den letzten 20 abgeschlossenen
          Jahren.
        </p>
        {loading ? (
          <div role="status">
            <p className="seasonal-scan-result">
              {privateWeb
                ? `${cloudQuery.completed} von ${cloudQuery.total || "…"} Märkten geprüft`
                : "Die besten Fenster der nächsten 90 Tage werden berechnet …"}
            </p>
            <PageLoading />
          </div>
        ) : query.isError ? (
          <div role="alert">
            <EmptyState
              icon={DatabaseZap}
              title="Screener nicht abgeschlossen"
              description={
                query.error?.message ??
                "Die 90-Tage-Suche konnte nicht abgeschlossen werden."
              }
            />
            <Button size="sm" onClick={() => void query.refetch()}>
              Erneut versuchen
            </Button>
          </div>
        ) : !hasProfiles ? (
          <EmptyState
            icon={DatabaseZap}
            title="Keine auswertbaren Seasonality-Profile"
            description="Lade zuerst die EODHD-Tageshistorien, um die nächsten 90 Tage zu vergleichen."
          />
        ) : privateWeb && !cloudQuery.data ? (
          <p className="muted">
            Starte den Screener für die nächsten 90 Tage. Die vollständige
            Rangliste verwendet den angezeigten Datenstand.
          </p>
        ) : !visible.length ? (
          <EmptyState
            icon={Search}
            title="Keine passenden Fenster in den nächsten 90 Tagen"
            description="Für diese Auswahl fehlt ein ausreichend belegtes historisches Muster. Prüfe Assetklasse, Richtung und den verfügbaren Datenbestand."
          />
        ) : (
          <>
            <p className="seasonal-scan-result" aria-live="polite">
              Top {visible.length} Fenster · {marketsWithWindows} von{" "}
              {rows.length} Märkten mit auswertbaren Chancen · nach historischer
              Qualität geordnet
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
                      aria-label={`Rang ${index + 1}: ${row.symbol}, ${row.direction === 1 ? "Long" : "Short"}, ${dateLabel(row.startDate)} bis ${dateLabel(row.endDate)}`}
                    >
                      <span className="seasonal-rank">{index + 1}</span>
                      <span className="seasonal-window-name">
                        <strong>
                          {row.symbol}{" "}
                          <span
                            className={
                              row.direction === 1
                                ? "positive-text"
                                : "negative-text"
                            }
                          >
                            {row.direction === 1 ? (
                              <TrendingUp size={14} aria-hidden="true" />
                            ) : (
                              <TrendingDown size={14} aria-hidden="true" />
                            )}{" "}
                            {row.direction === 1 ? "Long" : "Short"}
                          </span>
                        </strong>
                        <span>
                          {dateLabel(row.startDate)} – {dateLabel(row.endDate)}
                        </span>
                        <small>
                          {row.startDate === today
                            ? "Start heute"
                            : `Start in ${calendarDaysBetween(today, row.startDate)} Tagen`}{" "}
                          · {row.calendarDays} Kalendertage · {row.samples}{" "}
                          Jahre
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
                          {percent(row.medianReturn, true)}
                        </strong>
                        <span>{percent(row.hitRate)} Treffer</span>
                        <small>Wilson {percent(row.wilsonLowerBound)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {selected && <OpportunityDetail row={selected} today={today} />}
            </div>
          </>
        )}
        <details className="seasonal-scan-method">
          <summary>Rangfolge und Datenbasis der 90-Tage-Suche</summary>
          <p>
            Die Suche prüft täglich beginnende Fenster mit 5 bis 90
            Kalendertagen. Auch beim Jahreswechsel müssen beide Termine
            innerhalb des angezeigten Zeitraums liegen. Die Rangfolge verwendet
            zuerst die konservative 95%-Wilson-Untergrenze, dann die
            Medianbewegung relativ zur Schwankung und danach die Zahl der
            Beobachtungsjahre. Long- und Short-Fenster werden nach denselben
            Kriterien verglichen.
          </p>
          <p>
            Mindestens fünf vollständige Kalenderjahre sind erforderlich.
            Mittelwert und Median müssen dieselbe Richtung haben; mehr als die
            Hälfte der Jahre muss diese Richtung bestätigen. Gleichgerichtete
            Fenster desselben Marktes mit mindestens 75% Überlappung werden
            zusammengefasst. Wochenenden und Feiertage werden historisch auf den
            nächsten verfügbaren Tageskurs verschoben, höchstens vier
            Kalendertage; Lücken über sieben Tage werden ausgelassen. Die
            Termine sind saisonale Kalendergrenzen, keine bestätigten künftigen
            Börsenhandelstage.
          </p>
          <p>
            Der 29. Februar wird als Fenstergrenze ausgelassen. Fenster über den
            Jahreswechsel benötigen vollständige Historien beider Jahre.
            Historische Auswahl aus vielen Fenstern ist kein Nachweis
            zukünftiger Trefferquoten; Gebühren, Rollkosten und Hebel sind nicht
            enthalten. Die Medianbewegung beschreibt den Kurs, auch bei
            Short-Fenstern.
          </p>
          <p>
            {privateWeb
              ? "Die Suche startet ausdrücklich und bleibt an den übernommenen Datenstand gebunden. Nach einem Tages- oder Datenstandswechsel ist eine neue Berechnung nötig."
              : "Die Übersicht berechnet sich beim Tageswechsel und nach aktualisierten Profilen neu. Dafür werden vorhandene Tageskurse gelesen."}
          </p>
        </details>
      </CardContent>
    </Card>
  );
}
