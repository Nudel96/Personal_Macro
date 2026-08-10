import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, DatabaseZap, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  CotDashboard,
  EodhdFeedStatus,
  EodhdMappingCandidate,
  FundamentalCurrencyView,
  FundamentalIndicatorView,
  FundamentalPairCellView,
  FundamentalPairView,
} from "../../types/domain";
import {
  buildInstitutionalCurrencyActivity,
  buildInstitutionalPairActivity,
  type InstitutionalPairActivity,
  type InstitutionalSignal,
} from "./institutional-activity";

const forexPriority = [
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "USD",
  "CAD",
  "CHF",
  "JPY",
  "CNY",
] as const;

const groups = [
  {
    factor: "growth",
    title: "Economic Growth & Consumer Strength",
    columns: [
      "gdp",
      "manufacturing_pmi",
      "services_pmi",
      "retail_sales",
      "consumer_confidence",
    ],
  },
  {
    factor: "inflation",
    title: "Inflation",
    columns: ["cpi_yoy", "ppi_yoy", "pce_yoy"],
  },
  {
    factor: "rates",
    title: "Rates",
    columns: ["interest_rates"],
  },
  {
    factor: "labor",
    title: "Jobs Market",
    columns: [
      "nfp",
      "unemployment_rate",
      "unemployment_claims",
      "adp",
      "jolts",
    ],
  },
] as const;

const fields = groups.flatMap((group) => group.columns);
const stablePairOrder = new Map(
  forexPriority
    .flatMap((base, baseIndex) =>
      forexPriority.slice(baseIndex + 1).map((quote) => `${base}-${quote}`),
    )
    .map((key, index) => [key, index]),
);

export function MacroPage() {
  const queryClient = useQueryClient();
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const dashboard = useQuery({
    queryKey: ["macro", "eodhd-fundamentals"],
    queryFn: api.macroFundamentalsDashboard,
    retry: false,
  });
  const cot = useQuery({
    queryKey: ["macro", "cot"],
    queryFn: api.cotDashboard,
    retry: false,
  });
  const feedStatus = useQuery({
    queryKey: ["macro", "eodhd-status"],
    queryFn: api.eodhdFeedStatus,
    retry: false,
    refetchInterval: 60_000,
  });
  const feedReviews = useQuery({
    queryKey: ["macro", "eodhd-reviews"],
    queryFn: api.eodhdMappingCandidates,
    retry: false,
  });
  const syncFeed = useMutation({
    mutationFn: api.syncEodhdNow,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["macro"] });
      toast.success(
        `${result.run.eventsSeen} EODHD-Releases geprüft · ${result.run.eventsUpdated} Datensätze aktualisiert.`,
      );
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Macro-Feed konnte nicht synchronisiert werden.",
      ),
  });
  const syncCot = useMutation({
    mutationFn: api.syncCot,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["macro", "cot"] });
      void queryClient.invalidateQueries({ queryKey: ["cot"] });
      toast.success(`${result.imported} COT-Beobachtungen aktualisiert.`);
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "COT-Daten konnten nicht aktualisiert werden.",
      ),
  });
  const reviewFeedCandidate = useMutation({
    mutationFn: (input: {
      id: string;
      action: "approve" | "ignore";
      canonicalKey?: string | null;
    }) => api.reviewEodhdMappingCandidate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["macro", "eodhd-reviews"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["macro", "eodhd-fundamentals"],
      });
      toast.success("Prüfkandidat aktualisiert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Prüfkandidat konnte nicht aktualisiert werden.",
      ),
  });
  const selected =
    dashboard.data?.currencies.find(
      (currency) => currency.currency === selectedCurrency,
    ) ?? dashboard.data?.currencies[0];
  const pairs = useMemo(
    () => sortVisiblePairs(dashboard.data?.pairs ?? []),
    [dashboard.data?.pairs],
  );

  if (dashboard.isLoading) {
    return (
      <div className="page">
        <PageLoading />
      </div>
    );
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="page">
        <ErrorState message="Fundamentaldaten konnten nicht geladen werden. Die bestehenden Technical-, COT-, Seasonality- und Sentiment-Daten bleiben unverändert." />
      </div>
    );
  }

  const imported = Boolean(dashboard.data.snapshotId);
  return (
    <div
      className="page macro-scaffold-page"
      aria-label="Fundamentale Macro Heatmap"
    >
      <PageHeader
        eyebrow="Macro Workspace · EODHD Fundamentals"
        title="Fundamentale Forex-Heatmap"
        description="Actual, Forecast und Previous stammen direkt aus dem EODHD Economic Events Feed. Der letzte vollständige Release bleibt aktiv, bis sein vollständiger Nachfolger vorliegt; unterschiedliche Veröffentlichungsfrequenzen werden weiterhin verglichen."
        actions={
          <>
            <Badge className={imported ? "positive" : "warning"}>
              <DatabaseZap size={11} />{" "}
              {imported ? "EODHD-Snapshot aktiv" : "Noch kein EODHD-Snapshot"}
            </Badge>
            <Button
              aria-label="Fundamentaldaten aktualisieren"
              onClick={() => void dashboard.refetch()}
              disabled={dashboard.isFetching}
              size="icon"
              title="Fundamentaldaten aktualisieren"
            >
              <RefreshCw size={14} />
            </Button>
          </>
        }
      />

      <MacroFeedOverview
        status={feedStatus.data}
        reviews={feedReviews.data ?? []}
        unavailable={!isTauri()}
        syncing={syncFeed.isPending || Boolean(feedStatus.data?.running)}
        onSync={() => syncFeed.mutate()}
        onReview={(input) => reviewFeedCandidate.mutate(input)}
      />

      {!imported ? (
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="Noch keine EODHD-Fundamentaldaten synchronisiert"
            description="Starte den ersten EODHD-Abruf. Eindeutige Releases fließen direkt in die Bewertung; unsichere Provider-Bezeichnungen bleiben bis zur manuellen Freigabe nicht verfügbar."
            action={
              <Button
                onClick={() => syncFeed.mutate()}
                disabled={syncFeed.isPending || !feedStatus.data?.configured}
              >
                <RefreshCw size={14} /> EODHD jetzt synchronisieren
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="macro-scaffold-card">
            <CardHeader
              title="Fundamentale Heatmap"
              subtitle={`Snapshot ${dateTime(dashboard.data.asOf)} · 14 kanonische Zellen je Fiat-Paar · Base minus Quote`}
              action={
                <Badge className="neutral">{pairs.length} Fiat-Paare</Badge>
              }
            />
            <CardContent className="macro-scaffold-heatmap-wrap">
              <FundamentalHeatmap pairs={pairs} cot={cot.data} />
            </CardContent>
            <p className="macro-scaffold-note">
              Jede Zelle ist Base minus Quote. Nicht bewertbare
              Währungsindikatoren gehen numerisch mit 0 ein; der konkrete
              Verfügbarkeitsgrund bleibt im Tooltip erhalten. Der Fundamentals
              Score ist die Summe der 14 fundamentalen Zellen. Technical-, COT-,
              Seasonality- und Sentiment-Daten bleiben außerhalb dieser
              Fundamentals-Ansicht unverändert.
            </p>
          </Card>

          {selected && (
            <CurrencyOverview
              currencies={dashboard.data.currencies}
              selected={selected}
              onSelect={setSelectedCurrency}
              cot={cot.data}
              cotError={cot.isError}
              cotSyncing={syncCot.isPending}
              cotUnavailable={!isTauri()}
              onSyncCot={() => syncCot.mutate()}
            />
          )}
        </>
      )}
    </div>
  );
}

function MacroFeedOverview({
  status,
  reviews,
  unavailable,
  syncing,
  onSync,
  onReview,
}: {
  status?: EodhdFeedStatus;
  reviews: EodhdMappingCandidate[];
  unavailable: boolean;
  syncing: boolean;
  onSync: () => void;
  onReview: (input: {
    id: string;
    action: "approve" | "ignore";
    canonicalKey?: string | null;
  }) => void;
}) {
  const pendingReviews = reviews.filter(
    (review) => review.status === "pending",
  );
  const configured = Boolean(status?.configured) && !unavailable;
  return (
    <Card className="macro-feed-card">
      <CardHeader
        title="Automatischer Economic Feed"
        subtitle={
          unavailable
            ? "In der Browser-Vorschau nicht verfügbar. Die Automation läuft nur in der geöffneten Desktop-App."
            : configured
              ? `Letzter Erfolg ${status?.lastSuccessAt ? dateTime(status.lastSuccessAt) : "noch ausstehend"} · ${status?.pendingJobs ?? 0} releasegebundene Nachprüfungen`
              : "EODHD_API_KEY ist im nativen Backend nicht konfiguriert."
        }
        action={
          <Button onClick={onSync} disabled={!configured || syncing}>
            <RefreshCw size={14} className={syncing ? "spin" : undefined} />
            {syncing ? "Synchronisiert …" : "Jetzt prüfen"}
          </Button>
        }
      />
      {status?.lastRun?.status === "failed" && (
        <p className="macro-scaffold-note">
          Letzter Abruf fehlgeschlagen: {status.lastRun.errorMessage}
        </p>
      )}
      {status?.lastRun && status.lastRun.status !== "failed" && (
        <p className="macro-scaffold-note">
          Letzter Lauf: {status.lastRun.eventsSeen} Releases geprüft ·{" "}
          {status.lastRun.eventsUpdated} Datensätze aktualisiert ·{" "}
          {status.pendingMappingReviews} Zuordnungen zu prüfen
        </p>
      )}
      <CardContent>
        <section className="macro-feed-panel" aria-label="Prüfliste">
          <div className="macro-feed-panel-title">
            <CircleAlert size={14} /> Prüfliste
            <Badge className={pendingReviews.length ? "warning" : "neutral"}>
              {pendingReviews.length}
            </Badge>
          </div>
          {!pendingReviews.length ? (
            <p className="empty-copy">Keine unbekannten Bezeichnungen.</p>
          ) : (
            pendingReviews.slice(0, 3).map((review) => (
              <div className="macro-feed-review" key={review.id}>
                <div>
                  <strong>
                    {review.currency} · {review.providerType}
                  </strong>
                  <span>
                    {review.proposedCanonicalKey ?? "Keine Zuordnung"} ·{" "}
                    Konfidenz {review.confidence}%
                  </span>
                </div>
                <div className="macro-feed-review-actions">
                  {review.proposedCanonicalKey && (
                    <Button
                      size="sm"
                      onClick={() =>
                        onReview({
                          id: review.id,
                          action: "approve",
                          canonicalKey: review.proposedCanonicalKey,
                        })
                      }
                    >
                      Freigeben
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onReview({ id: review.id, action: "ignore" })
                    }
                  >
                    Ignorieren
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function FundamentalHeatmap({
  pairs,
  cot,
}: {
  pairs: FundamentalPairView[];
  cot?: CotDashboard;
}) {
  if (!pairs.length) {
    return (
      <div className="empty-copy" style={{ margin: "16px" }}>
        Noch keine Fiat-Forexpaare verfügbar.
      </div>
    );
  }
  return (
    <table className="macro-scaffold-heatmap pair-heatmap-table">
      <thead>
        <tr>
          <th colSpan={4} scope="colgroup">
            Output
          </th>
          <th className="institutional-group-heading" colSpan={2} scope="colgroup">
            Institutional Activity
          </th>
          {groups.map((group) => (
            <th
              colSpan={group.columns.length}
              key={group.factor}
              scope="colgroup"
            >
              {group.title}
            </th>
          ))}
        </tr>
        <tr>
          <th scope="col">Symbol</th>
          <th scope="col">Fund. Bias</th>
          <th scope="col">Fundamentals Score</th>
          <th scope="col">Institutional Score</th>
          <th scope="col">Latest Buys/Sells</th>
          <th scope="col">COT Pipeline</th>
          {fields.map((key) => (
            <th key={key} scope="col">
              {fieldLabel(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pairs.map((pair) => {
          const institutional = buildInstitutionalPairActivity(
            pair.base,
            pair.quote,
            cot,
          );
          return (
            <tr data-testid="forex-pair-row" key={`${pair.base}-${pair.quote}`}>
              <th className="heatmap-symbol" scope="row">
                {pair.base}
                {pair.quote}
              </th>
              <td className={biasTone(pair.biasLabel)}>{pair.biasLabel}</td>
              <td
                className={toneForScore(pair.fundamentalScore)}
                title={`Fundamentals ${signed(pair.fundamentalScore)}`}
              >
                {signed(pair.fundamentalScore)}
              </td>
              <InstitutionalScoreCell activity={institutional} />
              <InstitutionalPairCell
                activity={institutional}
                kind="latest"
                label="Latest Buys/Sells"
              />
              <InstitutionalPairCell
                activity={institutional}
                kind="pipeline"
                label="COT Pipeline"
              />
              {fields.map((key) => {
                const cell = pair.cells.find((item) => item.key === key);
                return <FundamentalCell cell={cell} key={key} />;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InstitutionalScoreCell({
  activity,
}: {
  activity: InstitutionalPairActivity;
}) {
  if (activity.score === null) {
    return (
      <td
        className="heatmap-unavailable"
        title={`Institutional Score ${activity.base}/${activity.quote}: keine gemeinsame COT-Abdeckung`}
      >
        —
      </td>
    );
  }
  return (
    <td
      className={toneForScore(activity.score)}
      data-intensity={scoreIntensity(activity.score)}
      title={`Institutional Score ${signed(activity.score)} · Coverage ${activity.coverage}/2`}
    >
      {signed(activity.score)}
    </td>
  );
}

function InstitutionalPairCell({
  activity,
  kind,
  label,
}: {
  activity: InstitutionalPairActivity;
  kind: "latest" | "pipeline";
  label: string;
}) {
  const score =
    kind === "latest"
      ? activity.latestChangeScore
      : activity.pipelineScore;
  const baseSignal =
    kind === "latest"
      ? activity.baseActivity.latestChangeSignal
      : activity.baseActivity.pipelineSignal;
  const quoteSignal =
    kind === "latest"
      ? activity.quoteActivity.latestChangeSignal
      : activity.quoteActivity.pipelineSignal;
  const baseDate = activity.baseActivity.contract?.reportDate ?? "—";
  const quoteDate = activity.quoteActivity.contract?.reportDate ?? "—";
  const title = `${label}: Base ${activity.base} ${signedSignal(baseSignal)}, Quote ${activity.quote} ${signedSignal(quoteSignal)} · Reports ${baseDate} / ${quoteDate}`;

  if (score === null) {
    return (
      <td className="heatmap-unavailable" title={`${title} · nicht verfügbar`}>
        —
      </td>
    );
  }
  return (
    <td
      className={toneForScore(score)}
      data-intensity={scoreIntensity(score)}
      title={title}
    >
      {signed(score)}
    </td>
  );
}

function FundamentalCell({ cell }: { cell?: FundamentalPairCellView }) {
  if (!cell) {
    return (
      <td
        className="heatmap-unavailable"
        title="Keine fundamentale Zelle vorhanden"
      >
        —
      </td>
    );
  }
  const diagnostic = cell.available
    ? ""
    : ` · Nicht bewertbare Seite numerisch 0: ${cell.reasonCodes.join(", ")}`;
  const releaseContext = ` · Base ${cell.baseFrequency ?? "—"} ${cell.baseReleasedAt ? dateTime(cell.baseReleasedAt) : "—"} · Quote ${cell.quoteFrequency ?? "—"} ${cell.quoteReleasedAt ? dateTime(cell.quoteReleasedAt) : "—"}`;
  return (
    <td
      className={`${toneForScore(cell.score)}${cell.available ? "" : " heatmap-derived-from-zero"}`}
      title={`${cell.label}: Base ${signed(cell.baseScore)}, Quote ${signed(cell.quoteScore)}${releaseContext}${diagnostic}`}
    >
      {signed(cell.score)}
    </td>
  );
}

function CurrencyOverview({
  currencies,
  selected,
  onSelect,
  cot,
  cotError,
  cotSyncing,
  cotUnavailable,
  onSyncCot,
}: {
  currencies: FundamentalCurrencyView[];
  selected: FundamentalCurrencyView;
  onSelect: (currency: string) => void;
  cot?: CotDashboard;
  cotError: boolean;
  cotSyncing: boolean;
  cotUnavailable: boolean;
  onSyncCot: () => void;
}) {
  const institutional = buildInstitutionalCurrencyActivity(
    selected.currency,
    cot,
  );
  return (
    <section
      className="macro-pipeline"
      aria-labelledby="fundamental-currency-title"
    >
      <div className="macro-pipeline-heading">
        <div>
          <span className="page-eyebrow">Economic Overview</span>
          <h2 id="fundamental-currency-title">
            Fundamentale Bewertung je Währung
          </h2>
          <p>
            Der Score ist die ungewichtete Summe der aktuell eindeutig
            bewertbaren kanonischen Indikatoren.
          </p>
        </div>
      </div>
      <div className="macro-pipeline-layout">
        <aside className="macro-asset-rail" aria-label="Währung auswählen">
          <section className="macro-asset-group">
            <h3>Währungen</h3>
            <div>
              {currencies.map((currency) => (
                <button
                  aria-pressed={currency.currency === selected.currency}
                  className={
                    currency.currency === selected.currency
                      ? "is-selected"
                      : undefined
                  }
                  key={currency.currency}
                  onClick={() => onSelect(currency.currency)}
                  type="button"
                >
                  <span>{currency.currency}</span>
                  <small>{signed(currency.fundamentalsScore)}</small>
                </button>
              ))}
            </div>
          </section>
          <div
            className="macro-scorecard"
            aria-label={`${selected.currency} Fundamentals Score`}
          >
            <span className="page-eyebrow">Fundamentals Score</span>
            <strong>{selected.currency}</strong>
            <div className="macro-score-gauge">
              <span>{signed(selected.fundamentalsScore)}</span>
              <small>{selected.fundamentalsBias}</small>
            </div>
            <dl>
              <ScoreRow
                label="Economic Growth"
                score={selected.economicGrowthScore}
              />
              <ScoreRow label="Inflation" score={selected.inflationScore} />
              <ScoreRow label="Rates" score={selected.ratesScore} />
              <ScoreRow label="Jobs Market" score={selected.jobsMarketScore} />
              <ScoreRow
                label="Institutional Activity"
                score={institutional.score}
              />
            </dl>
          </div>
        </aside>
        <div className="macro-pipeline-content">
          <header className="macro-selected-asset">
            <div>
              <span className="page-eyebrow">Ausgewählte Währung</span>
              <h3>{selected.currency}</h3>
              <p>
                Fundamentals {signed(selected.fundamentalsScore)} ·{" "}
                {selected.fundamentalsBias}
              </p>
            </div>
            <Badge className={biasTone(selected.fundamentalsBias)}>
              {selected.fundamentalsBias}
            </Badge>
          </header>
          <div className="macro-pipeline-panels">
            <InstitutionalActivityPanel
              activity={institutional}
              error={cotError}
              syncing={cotSyncing}
              unavailable={cotUnavailable}
              onSync={onSyncCot}
            />
            {groups.map((group) => {
              const indicators = selected.indicators.filter(
                (indicator) => indicator.factor === group.factor,
              );
              const score = groupScore(selected, group.factor);
              return (
                <section className="macro-pipeline-panel" key={group.factor}>
                  <header data-tone={toneKey(score)}>
                    <h4>{group.title}</h4>
                    <span
                      className="macro-signal-chip"
                      data-tone={toneKey(score)}
                    >
                      {signed(score)} · {biasForScore(score)}
                    </span>
                  </header>
                  <div className="macro-pipeline-columns" aria-hidden="true">
                    <span>Status</span>
                    <span>Actual</span>
                    <span>Forecast</span>
                    <span>Previous</span>
                    <span>Surprise</span>
                    <span>Release / Grund</span>
                  </div>
                  <div className="macro-pipeline-rows">
                    {indicators.map((indicator) => (
                      <IndicatorRow indicator={indicator} key={indicator.key} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function InstitutionalActivityPanel({
  activity,
  error,
  syncing,
  unavailable,
  onSync,
}: {
  activity: ReturnType<typeof buildInstitutionalCurrencyActivity>;
  error: boolean;
  syncing: boolean;
  unavailable: boolean;
  onSync: () => void;
}) {
  const contract = activity.contract;
  const assessment = contract?.assessment;
  return (
    <section
      aria-label={`${activity.currency} Institutional Activity`}
      className="macro-pipeline-panel institutional-activity-panel"
    >
      <header data-tone={toneKey(activity.score)}>
        <div>
          <h4>Institutional Activity</h4>
          <small>
            {`${activity.score === null ? "—" : signed(activity.score)} · ${activity.biasLabel} · Coverage ${activity.coverage}/2`}
          </small>
        </div>
        <div className="institutional-activity-actions">
          <span
            className="macro-signal-chip"
            data-tone={toneKey(activity.score)}
          >
            {activity.biasLabel}
          </span>
          <Button
            aria-label="COT aktualisieren"
            disabled={syncing || unavailable}
            onClick={onSync}
            size="sm"
          >
            <RefreshCw size={13} className={syncing ? "spin" : undefined} />
            {syncing ? "COT wird geladen …" : "COT aktualisieren"}
          </Button>
        </div>
      </header>
      {error ? (
        <p className="institutional-activity-error">
          COT-Daten konnten nicht geladen werden.
        </p>
      ) : (
        <div className="institutional-activity-rows">
          <div className="institutional-activity-row">
            <strong>Latest Buys/Sells</strong>
            <span
              className="macro-signal-chip"
              data-tone={toneKey(activity.latestChangeSignal)}
            >
              {signalLabel(activity.latestChangeSignal)}
            </span>
            <span>Long Δ {signedInteger(contract?.longChange)}</span>
            <span>Short Δ {signedInteger(contract?.shortChange)}</span>
            <span>Netto Δ {signedInteger(contract?.netChange)}</span>
            <span>{contract?.reportDate ?? "—"}</span>
          </div>
          <div className="institutional-activity-row">
            <strong>COT Pipeline</strong>
            <span
              className="macro-signal-chip"
              data-tone={toneKey(activity.pipelineSignal)}
            >
              {signalLabel(activity.pipelineSignal)}
            </span>
            <span>{assessment?.biasLabel ?? "Nicht verfügbar"}</span>
            <span>Qualität {qualityLabel(assessment?.quality)}</span>
            <span>{assessment?.crowdingStatus ?? "Nicht bewertbar"}</span>
            <span>{assessment?.reportDate ?? contract?.reportDate ?? "—"}</span>
          </div>
          {!contract && (
            <p className="institutional-activity-unavailable">
              Für {activity.currency} ist kein CFTC-COT-Kontrakt verfügbar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function IndicatorRow({ indicator }: { indicator: FundamentalIndicatorView }) {
  const displayLabel = indicator.sourceLabel || indicator.label;
  const releaseOrReason = indicator.releasedAt
    ? `${dateTime(indicator.releasedAt)}${indicator.frequency ? ` · ${indicator.frequency}` : ""}${indicator.pendingNewerReleaseAt ? ` · neuer Release wartet seit ${dateTime(indicator.pendingNewerReleaseAt)}` : ""}${indicator.reasonCodes.length ? ` · ${reasonLabel(indicator.reasonCodes[0])}` : ""}`
    : reasonLabel(indicator.reasonCodes[0]);
  return (
    <div className="macro-pipeline-row">
      <strong title={`${displayLabel} · Heatmap-Feld: ${indicator.label}`}>
        {displayLabel}
      </strong>
      <span
        className="macro-signal-chip"
        data-tone={
          indicator.status === "scored" || indicator.status === "neutral"
            ? toneKey(indicator.score)
            : "unavailable"
        }
      >
        {statusLabel(indicator)}
      </span>
      <span>{indicator.actualText ?? "—"}</span>
      <span>{indicator.forecastText ?? "—"}</span>
      <span>{indicator.previousText ?? "—"}</span>
      <span>{indicator.surpriseText ?? "—"}</span>
      <span title={indicator.sourceLabel || undefined}>
        {releaseOrReason || "—"}
      </span>
    </div>
  );
}

function ScoreRow({
  label,
  score,
}: {
  label: string;
  score: number | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={score === null ? "heatmap-unavailable" : toneForScore(score)}>
        {score === null ? "—" : signed(score)}
      </dd>
    </div>
  );
}

function sortVisiblePairs(pairs: FundamentalPairView[]) {
  return pairs
    .filter((pair) => {
      const baseRank = forexPriority.indexOf(
        pair.base as (typeof forexPriority)[number],
      );
      const quoteRank = forexPriority.indexOf(
        pair.quote as (typeof forexPriority)[number],
      );
      return baseRank >= 0 && quoteRank >= 0 && baseRank < quoteRank;
    })
    .sort(
      (left, right) =>
        right.fundamentalScore - left.fundamentalScore ||
        (stablePairOrder.get(`${left.base}-${left.quote}`) ??
          Number.MAX_SAFE_INTEGER) -
          (stablePairOrder.get(`${right.base}-${right.quote}`) ??
            Number.MAX_SAFE_INTEGER),
    );
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    gdp: "GDP",
    manufacturing_pmi: "mPMI",
    services_pmi: "sPMI",
    retail_sales: "Retail Sales",
    consumer_confidence: "Consumer Confidence",
    cpi_yoy: "CPI YoY",
    ppi_yoy: "PPI YoY",
    pce_yoy: "PCE YoY",
    interest_rates: "Interest Rates",
    nfp: "NFP",
    unemployment_rate: "Unemployment Rate",
    unemployment_claims: "Unemployment Claims",
    adp: "ADP",
    jolts: "JOLTS",
  };
  return labels[key] ?? key;
}

function groupScore(currency: FundamentalCurrencyView, factor: string) {
  if (factor === "growth") return currency.economicGrowthScore;
  if (factor === "inflation") return currency.inflationScore;
  if (factor === "rates") return currency.ratesScore;
  return currency.jobsMarketScore;
}

function signed(score: number) {
  return score > 0 ? `+${score}` : String(score);
}

function toneForScore(score: number) {
  if (score > 0) return "heatmap-positive";
  if (score < 0) return "heatmap-negative";
  return "heatmap-neutral";
}

function toneKey(score?: number | null) {
  if (score === null || score === undefined) return "unavailable";
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function scoreIntensity(score: number) {
  return Math.abs(score) >= 2 ? "2" : "1";
}

function signedSignal(signal: InstitutionalSignal | null) {
  return signal === null ? "—" : signed(signal);
}

function signalLabel(signal: InstitutionalSignal | null) {
  if (signal === null) return "Nicht verfügbar";
  if (signal > 0) return "Bullish";
  if (signal < 0) return "Bearish";
  return "Neutral";
}

const integerFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

function signedInteger(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const formatted = integerFormatter.format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function qualityLabel(quality?: string) {
  if (quality === "high") return "hoch";
  if (quality === "limited") return "eingeschränkt";
  return "nicht verfügbar";
}

function biasTone(bias: string) {
  if (bias.includes("Bullish")) return "positive";
  if (bias.includes("Bearish")) return "negative";
  return "neutral";
}

function biasForScore(score: number) {
  if (score > 0) return "Bullish";
  if (score < 0) return "Bearish";
  return "Neutral";
}

function statusLabel(indicator: FundamentalIndicatorView) {
  if (indicator.status === "scored") {
    return `${biasForScore(indicator.score)} ${signed(indicator.score)}`;
  }
  if (indicator.status === "neutral") return "Neutral";
  return "Nicht bewertbar";
}

function reasonLabel(reason?: string) {
  const labels: Record<string, string> = {
    actual_equals_forecast: "Actual = Forecast",
    no_same_release_forecast: "kein Forecast desselben Release",
    forecast_not_linked_to_same_release: "Forecast gehört zu anderem Release",
    forecast_unit_mismatch: "Einheit nicht identisch",
    forecast_transformation_mismatch: "Transformation nicht identisch",
    no_functional_equivalent: "kein funktionales Äquivalent",
    future_release: "Release liegt in der Zukunft",
    eodhd_release_unavailable: "kein vollständiger EODHD-Release",
    mapping_review_required: "EODHD-Zuordnung muss geprüft werden",
  };
  return reason ? (labels[reason] ?? reason.replace(/_/g, " ")) : "";
}
