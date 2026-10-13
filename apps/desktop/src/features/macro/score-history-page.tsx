import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { supportsPrivateWebCommand } from "../../services/private-web-client";
import { PageHeader } from "../../components/ui/page-header";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { dateTime } from "../../lib/utils";
import {
  alignScoresToCandles,
  biasLabels,
  evaluateScoreOutcomes,
  scoreBias,
  summarizeScoreOutcomes,
} from "./score-history-model";
import { ContributionTable, signedScore } from "./commodity-score-heatmap";
import { utcDate } from "./score-history-preview";
import "./score-history.css";

const HistoryChart = lazy(() =>
  import("./score-history-charts").then((m) => ({
    default: m.ScoreHistoryChart,
  })),
);
const DailyChart = lazy(() =>
  import("./score-history-charts").then((m) => ({
    default: m.ScoreDailyComparisonChart,
  })),
);

export function ScoreHistoryPage() {
  const [params] = useSearchParams();
  const [instrumentId, setInstrumentId] = useState(
    params.get("instrument") ?? "forex:EUR/USD",
  );
  const [draftDates, setDraftDates] = useState({
    from: utcDate(180),
    to: utcDate(),
  });
  const [dates, setDates] = useState(draftDates);
  const [thresholdOverride, setThresholdOverride] = useState<string | null>(
    null,
  );
  const [horizon, setHorizon] = useState<5 | 20>(5);
  const [averages, setAverages] = useState<number[]>([20, 50]);
  const [flipLines, setFlipLines] = useState(true);
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: ["macro", "score-catalog"],
    queryFn: api.macroScoreCatalog,
    retry: false,
  });
  const input = { instrumentId, ...dates };
  const history = useQuery({
    queryKey: ["macro", "score-history", input],
    queryFn: () => api.macroScoreHistory(input),
    enabled: catalog.isSuccess,
    retry: false,
    refetchInterval: isTauri() ? 60_000 : false,
  });
  const capture = useMutation({
    mutationFn: api.recordMacroScoreHistory,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["macro"] });
      toast.success(
        result.inserted
          ? `${result.inserted} neue Score-Einzelwerte dauerhaft gespeichert.`
          : "Der aktuelle Score-Stand ist bereits aufgezeichnet.",
      );
      if (!result.archiveCompleted)
        toast.info(
          "Weitere archivierte Snapshots werden im Hintergrund übernommen.",
        );
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Die Aufzeichnung konnte nicht abgeschlossen werden.",
      ),
  });
  const defaultThreshold =
    history.data?.instrument.defaultThreshold ??
    catalog.data?.find((i) => i.id === instrumentId)?.defaultThreshold ??
    5;
  const candidateThreshold = Number(thresholdOverride ?? defaultThreshold);
  const threshold =
    Number.isInteger(candidateThreshold) &&
    candidateThreshold >= 1 &&
    candidateThreshold <= 34
      ? candidateThreshold
      : defaultThreshold;
  const aligned = useMemo(
    () =>
      alignScoresToCandles(
        history.data?.candles ?? [],
        history.data?.points ?? [],
        threshold,
        history.data?.priceSource?.provider === "eodhd",
      ),
    [history.data, threshold],
  );
  const outcomes = useMemo(
    () =>
      history.data?.priceSource?.provider === "mt5" &&
      history.data.priceSource.dataKind === "ohlc"
        ? evaluateScoreOutcomes(aligned, horizon)
        : [],
    [aligned, horizon, history.data?.priceSource],
  );
  const latest = history.data?.points[history.data.points.length - 1];
  const coverage = aligned.filter((c) => c.score != null).length;

  return (
    <div className="page score-history-page">
      <PageHeader
        icon={History}
        eyebrow="Macro Workspace · Beobachtung & Vergleich"
        title="Score-Historie & Daily-Vergleich"
        description="Erkenne positive und negative Score-Phasen und vergleiche sie mit dem anschließenden Kursverlauf. Jede Beobachtung behält ihren Erfassungszeitpunkt und ihre Datengrundlage."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => void history.refetch()}
              disabled={!catalog.isSuccess || history.isFetching}
            >
              <RefreshCw size={14} /> Neu laden
            </Button>
            {(isTauri() ||
              (isPrivateWeb() &&
                supportsPrivateWebCommand("record_macro_score_history"))) && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => capture.mutate()}
                disabled={capture.isPending}
              >
                Jetzt erfassen
              </Button>
            )}
          </>
        }
      />
      {catalog.isLoading ? (
        <PageLoading />
      ) : catalog.isError ? (
        <ErrorState
          message={
            catalog.error.message ??
            "Der Score-Katalog konnte nicht gelesen werden."
          }
        />
      ) : (
        <>
          <Card>
            <CardContent>
              <form
                className="score-history-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  setDates(draftDates);
                }}
              >
                <label>
                  Markt
                  <select
                    className="input"
                    aria-label="Score-Markt"
                    value={instrumentId}
                    onChange={(e) => {
                      setInstrumentId(e.target.value);
                      setThresholdOverride(null);
                    }}
                  >
                    {[
                      ["forex", "Forex-Paare"],
                      ["commodity", "Metalle & Energie"],
                      ["currency", "Einzelwährungen"],
                    ].map(([kind, label]) => (
                      <optgroup label={label} key={kind}>
                        {catalog.data
                          ?.filter((i) => i.kind === kind)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  Von (UTC)
                  <input
                    className="input"
                    type="date"
                    aria-label="Score-Zeitraum von"
                    required
                    max={draftDates.to}
                    value={draftDates.from}
                    onChange={(e) =>
                      setDraftDates({ ...draftDates, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  Bis (UTC)
                  <input
                    className="input"
                    type="date"
                    aria-label="Score-Zeitraum bis"
                    required
                    min={draftDates.from}
                    max={utcDate()}
                    value={draftDates.to}
                    onChange={(e) =>
                      setDraftDates({ ...draftDates, to: e.target.value })
                    }
                  />
                </label>
                <Button type="submit" size="sm">
                  Zeitraum anwenden
                </Button>
                <label>
                  Bias-Schwelle ±
                  <input
                    className="input"
                    aria-label="Bullish-/Bearish-Schwelle"
                    type="number"
                    min={1}
                    max={34}
                    step={1}
                    value={thresholdOverride ?? defaultThreshold}
                    onChange={(e) => setThresholdOverride(e.target.value)}
                    onBlur={() => {
                      if (
                        !Number.isInteger(candidateThreshold) ||
                        candidateThreshold < 1 ||
                        candidateThreshold > 34
                      )
                        setThresholdOverride(null);
                    }}
                  />
                </label>
                <div
                  className="score-range-presets"
                  aria-label="Schnelle Zeiträume"
                >
                  {[30, 90, 180, 365].map((days) => (
                    <Button
                      size="sm"
                      key={days}
                      type="button"
                      onClick={() => {
                        const range = { from: utcDate(days), to: utcDate() };
                        setDraftDates(range);
                        setDates(range);
                      }}
                    >
                      {days === 365 ? "1 Jahr" : `${days} Tage`}
                    </Button>
                  ))}
                </div>
              </form>
            </CardContent>
          </Card>
          {history.isLoading ? (
            <PageLoading />
          ) : history.isError ? (
            <ErrorState
              message={
                history.error.message ??
                "Die Score-Historie konnte nicht geladen werden."
              }
            />
          ) : (
            history.data && (
              <>
                <div className="score-history-metrics">
                  <div>
                    <span>Letzte Beobachtung im Zeitraum</span>
                    <strong
                      data-bias={scoreBias(latest?.score ?? null, threshold)}
                    >
                      {signedScore(latest?.score ?? null)} ·{" "}
                      {biasLabels[scoreBias(latest?.score ?? null, threshold)]}
                    </strong>
                    <small>
                      {latest
                        ? dateTime(
                            new Date(latest.observedAt * 1000).toISOString(),
                          )
                        : "Noch keine Aufzeichnung"}
                    </small>
                  </div>
                  <div>
                    <span>Aufzeichnung</span>
                    <strong>{history.data.points.length} Beobachtungen</strong>
                    <small>
                      Erster gespeicherter Stand:{" "}
                      {history.data.earliestObservationAt
                        ? dateTime(
                            new Date(
                              history.data.earliestObservationAt * 1000,
                            ).toISOString(),
                          )
                        : "—"}
                    </small>
                  </div>
                  <div>
                    <span>
                      {history.data.priceSource?.provider === "eodhd"
                        ? "Zum UTC-Vortag bekannte Beobachtung"
                        : "Vor Daily-Open bekannter Score"}
                    </span>
                    <strong>
                      {coverage}/{aligned.length} Kerzen
                    </strong>
                    <small>
                      {aligned.length
                        ? `${((coverage / aligned.length) * 100).toFixed(0)} % zeitliche Abdeckung`
                        : "Keine Daily-Kurse im Zeitraum"}
                    </small>
                  </div>
                </div>
                <Card>
                  <CardHeader
                    title={`Score-Historie · ${history.data.instrument.label}`}
                    subtitle={`${history.data.instrument.scoreName} · Bullish ab +${threshold}, Bearish ab −${threshold}`}
                  />
                  <CardContent>
                    {history.data.points.length ? (
                      <Suspense fallback={<PageLoading />}>
                        <HistoryChart
                          points={history.data.points}
                          threshold={threshold}
                        />
                      </Suspense>
                    ) : (
                      <p className="score-explanation">
                        Noch keine gespeicherten Beobachtungen in diesem
                        Zeitraum. Die Desktop-App erfasst bei laufendem Betrieb;
                        die Cloud erfasst über die täglichen Jobs und nach neuen
                        Makro-Veröffentlichungen. „Jetzt erfassen“ speichert den
                        aktuell verfügbaren Datenstand.
                      </p>
                    )}
                    <p className="score-explanation">
                      Die Balken zeigen tatsächlich gespeicherte Beobachtungen.
                      Positiv / negativ beschreibt den Rohscore; die wählbare
                      Bias-Schwelle legt Bullish, Bearish oder Neutral fest.
                      Fehlende Scores erhalten keinen Nullbalken.
                    </p>
                  </CardContent>
                </Card>
                {history.data.instrument.kind !== "currency" && (
                  <Card>
                    <CardHeader
                      title="Daily-Chart vs. Score"
                      subtitle={
                        history.data.priceSource
                          ? `${history.data.priceSource.label} · ${history.data.priceSource.symbol}${history.data.priceSource.inverted ? " · korrekt invertiert" : ""}`
                          : "Keine exakt zugeordnete Daily-Preisreihe geladen"
                      }
                    />
                    <CardContent>
                      <div className="score-chart-controls">
                        <span>Gleitende Durchschnitte:</span>
                        {[20, 50, 100, 200].map((period) => (
                          <label key={period}>
                            <input
                              type="checkbox"
                              checked={averages.includes(period)}
                              onChange={(e) =>
                                setAverages((old) =>
                                  e.target.checked
                                    ? [...old, period].sort((a, b) => a - b)
                                    : old.filter((n) => n !== period),
                                )
                              }
                            />{" "}
                            SMA {period}
                          </label>
                        ))}
                        <label>
                          <input
                            type="checkbox"
                            checked={flipLines}
                            onChange={(e) => setFlipLines(e.target.checked)}
                          />{" "}
                          Score-Wechsel markieren
                        </label>
                      </div>
                      {history.data.candles.length &&
                      history.data.priceSource ? (
                        <Suspense fallback={<PageLoading />}>
                          <DailyChart
                            candles={aligned}
                            source={history.data.priceSource}
                            threshold={threshold}
                            averages={averages}
                            flipLines={flipLines}
                          />
                        </Suspense>
                      ) : (
                        <p className="score-explanation">
                          Für diesen Markt und Zeitraum fehlen Daily-Kurse.
                          Forex- und Gold-/Silberkerzen können über „Macro →
                          MT5-Trends“ aktualisiert werden; verfügbare
                          EODHD-Kurse über Seasonality. Ohne exakte Kupferreihe
                          bleibt dessen Chart leer.
                        </p>
                      )}
                      {history.data.priceSource?.dataKind === "close" && (
                        <p className="score-explanation">
                          Diese Preisreihe liefert einen täglichen
                          Einzelpreis. Die Linie zeigt diese Werte; OHLC-Kerzen
                          und echte Tages-Eröffnungskurse liegen dafür nicht
                          vor.
                        </p>
                      )}
                      {history.data.priceSource?.importedAt && (
                        <p className="score-explanation">
                          Daily-Daten übernommen am{" "}
                          {dateTime(history.data.priceSource.importedAt)}.
                          Letzter Kurstag:{" "}
                          {history.data.candles.length
                            ? new Date(
                                history.data.candles[
                                  history.data.candles.length - 1
                                ].time * 1000,
                              ).toLocaleDateString("de-DE", { timeZone: "UTC" })
                            : "—"}
                          . Cloud- und Desktop-Erfassung sind getrennt; dieser
                          Preisstand wird nicht automatisch mit dem lokalen
                          Terminal synchronisiert.
                        </p>
                      )}
                      <p className="score-explanation">
                        {history.data.priceSource?.provider === "eodhd"
                          ? "EODHD liefert ein Handelsdatum ohne exakten Eröffnungszeitpunkt. Die Zuordnung verwendet konservativ die zum vorangehenden UTC-Tagesbeginn bekannte Beobachtung; eine zeitgenaue Open-to-Close-Trefferquote wird für diese Quelle nicht berechnet."
                          : "Ein Marker erscheint erst an einer Kerze, deren Beginn nach der Score-Erfassung liegt."}{" "}
                        Der Score wird am Zuordnungszeitpunkt höchstens 36
                        Stunden und bis zum frühesten Ablauf seiner verwendeten
                        Daten fortgeführt. Leere Abschnitte bleiben ohne Signal.
                      </p>
                    </CardContent>
                  </Card>
                )}
                {history.data.instrument.kind !== "currency" && (
                  <Card>
                    <CardHeader
                      title="Richtungsprüfung"
                      subtitle="Abgeschlossene, zeitlich getrennte Stichproben ab einem neuen Bullish-/Bearish-Beginn"
                      action={
                        <label className="score-horizon">
                          Folgefenster
                          <select
                            className="input"
                            aria-label="Rendite-Folgefenster"
                            value={horizon}
                            onChange={(e) =>
                              setHorizon(Number(e.target.value) as 5 | 20)
                            }
                          >
                            <option value={5}>5 Handelstage</option>
                            <option value={20}>20 Handelstage</option>
                          </select>
                        </label>
                      }
                    />
                    <CardContent>
                      <div className="score-outcome-grid">
                        {(["bullish", "bearish"] as const).map((bias) => {
                          const stats = summarizeScoreOutcomes(
                            history.data.priceSource?.dataKind === "close"
                              ? []
                              : outcomes,
                            bias,
                          );
                          return (
                            <div key={bias} data-bias={bias}>
                              <span>{biasLabels[bias]}</span>
                              <strong>
                                {stats.hitRate == null
                                  ? "—"
                                  : `${(stats.hitRate * 100).toFixed(1)} %`}
                              </strong>
                              <small>
                                {stats.n} abgeschlossene Stichproben · Ø in
                                Score-Richtung{" "}
                                {stats.averageReturn == null
                                  ? "—"
                                  : `${stats.averageReturn > 0 ? "+" : ""}${stats.averageReturn.toFixed(2)} %`}
                              </small>
                              <small>
                                {stats.n < 20
                                  ? "Zu wenige Stichproben für eine belastbare Aussage."
                                  : "Deskriptive Auswertung dieses Zeitraums."}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                      <p className="score-explanation">
                        Gemessen wird Daily-Open bis zum Close nach {horizon}{" "}
                        Handelstagen. Eine positive Rendite bestätigt Bullish,
                        eine negative bestätigt Bearish; unveränderte Preise
                        zählen nicht als Treffer. Unvollständige Folgefenster,
                        Datenlücken über sieben Tage und überlappende
                        Stichproben werden ausgeschlossen. Gebühren und Spreads
                        sind nicht enthalten. Bei Einzelpreisreihen ohne Open
                        wird keine Open-to-Close-Trefferquote berechnet.
                      </p>
                    </CardContent>
                  </Card>
                )}
                <details className="score-methodology">
                  <summary>
                    Gespeicherte Einzelbeobachtungen & Datengrundlage
                  </summary>
                  <p>
                    „Archiv-Snapshot“ verwendet die bereits damals gespeicherten
                    Evaluierungen und deren Erfassungszeit. Das neue Teilmodell
                    wird auf diese archivierten Inputs angewendet; es ist keine
                    rückwirkend nachgewiesene damalige Rohstoffprognose. Heutige
                    revidierte Eventwerte und aktuelle Lagerdaten ersetzen diese
                    Inputs nicht. Eine gültige Vorgängerbeobachtung kann vor dem
                    gewählten Startdatum liegen.
                  </p>
                  <div className="score-table-scroll">
                    <table className="score-evidence-table">
                      <thead>
                        <tr>
                          <th>Erfasst</th>
                          <th>Score</th>
                          <th>Richtung / Bias</th>
                          <th>Beiträge</th>
                          <th>Herkunft</th>
                          <th>Gültig bis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.data.points
                          .slice(-100)
                          .reverse()
                          .map((point) => (
                            <tr key={point.observationKey}>
                              <td>
                                {dateTime(
                                  new Date(
                                    point.observedAt * 1000,
                                  ).toISOString(),
                                )}
                              </td>
                              <td data-bias={scoreBias(point.score, 1)}>
                                {signedScore(point.score)}
                              </td>
                              <td>
                                {point.score == null
                                  ? "—"
                                  : point.score > 0
                                    ? "Positiv"
                                    : point.score < 0
                                      ? "Negativ"
                                      : "Null"}{" "}
                                ·{" "}
                                {biasLabels[scoreBias(point.score, threshold)]}
                              </td>
                              <td>
                                {point.availableComponents}/
                                {point.totalComponents}
                              </td>
                              <td
                                title={`${point.snapshotId} · ${point.modelVersion}`}
                              >
                                {
                                  {
                                    captured: "Aufgezeichnet",
                                    archived_snapshot: "Archiv-Snapshot",
                                    cloud_captured: "Cloud-Aufzeichnung",
                                    desktop_captured: "Desktop-Übernahme",
                                    desktop_archived_snapshot: "Desktop-Archiv",
                                  }[point.origin]
                                }
                              </td>
                              <td>
                                {dateTime(
                                  new Date(
                                    point.validUntil * 1000,
                                  ).toISOString(),
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <p>Zuletzt verwendete Beiträge im gewählten Zeitraum:</p>
                  <ContributionTable
                    contributions={history.data.latestContributions}
                  />
                  <small>
                    Bis zu 100 Beobachtungen in dieser Tabelle. Das Diagramm
                    verwendet den gesamten geladenen Zeitraum. Modell:{" "}
                    {history.data.modelVersion}.
                  </small>
                </details>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
