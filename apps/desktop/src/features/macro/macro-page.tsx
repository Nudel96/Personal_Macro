import { Grid3X3 as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Clock3,
  DatabaseZap,
  Gauge,
  Info,
  Landmark,
  Layers3,
  MoveHorizontal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { dateTime } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { CloudMarketNotice } from "./cloud-market-notice";
import { useCloudCotRefresh } from "../cot/use-cloud-cot-refresh";
import type {
  CotContractView,
  CotDashboard,
  EodhdFeedStatus,
  EodhdMappingCandidate,
  FundamentalCurrencyView,
  FundamentalIndicatorView,
  FundamentalPairCellView,
  FundamentalPairView,
  PairTechnicalDashboard,
  PairTechnicalSignalView,
  TechnicalSignalStatus,
  TimeframeTrendView,
} from "../../types/domain";
import {
  buildInstitutionalAssetActivity,
  buildInstitutionalCurrencyActivity,
  buildInstitutionalPairActivity,
  type InstitutionalPairActivity,
  type InstitutionalSignal,
} from "./institutional-activity";
import {
  buildPreciousMetalUsdViews,
  isAvailableIndicator,
  type PreciousMetalUsdView,
} from "./precious-metals";
import {
  detectMacroRegime,
  type MacroRegimeAssessment,
  type MacroRegimeKey,
  type RegimeDimension,
  type RegimeSignal,
} from "./regime-detection";

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
    shortTitle: "Wachstum & Nachfrage",
    description: "Aktivität, Konsum und Produktionsdynamik",
    icon: TrendingUp,
    columns: [
      "gdp",
      "manufacturing_pmi",
      "services_pmi",
      "retail_sales",
      "consumer_confidence",
      "industrial_production",
      "trade_balance",
    ],
  },
  {
    factor: "inflation",
    title: "Inflation",
    shortTitle: "Inflation",
    description: "Preisdruck gegenüber dem Marktkonsens",
    icon: ThermometerSun,
    columns: ["cpi_yoy", "ppi_yoy", "pce_yoy"],
  },
  {
    factor: "rates",
    title: "Rates",
    shortTitle: "Leitzinsen",
    description: "Zinsentscheid gegenüber der Erwartung",
    icon: Landmark,
    columns: ["interest_rates"],
  },
  {
    factor: "labor",
    title: "Jobs Market",
    shortTitle: "Arbeitsmarkt",
    description: "Beschäftigung, Löhne und Arbeitskräftenachfrage",
    icon: BriefcaseBusiness,
    columns: [
      "nfp",
      "unemployment_rate",
      "unemployment_claims",
      "adp",
      "jolts",
      "wage_growth",
    ],
  },
] as const;

const fields = groups.flatMap((group) => group.columns);
const indicatorTemplate = groups.flatMap((group) =>
  group.columns.map((key) => ({
    key,
    label: fieldLabel(key),
    factor: group.factor,
  })),
);
const stablePairOrder = new Map(
  forexPriority
    .flatMap((base, baseIndex) =>
      forexPriority.slice(baseIndex + 1).map((quote) => `${base}-${quote}`),
    )
    .map((key, index) => [key, index]),
);

export function MacroPage() {
  useCloudCotRefresh();
  const privateWeb = isPrivateWeb();
  const queryClient = useQueryClient();
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [terminalPathDraft, setTerminalPathDraft] = useState<string | null>(
    null,
  );
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
  const technicals = useQuery({
    queryKey: ["macro", "technicals"],
    queryFn: api.pairTechnicalSignals,
    retry: false,
    refetchInterval: privateWeb || !isTauri() ? false : 30_000,
  });
  const feedStatus = useQuery({
    queryKey: ["macro", "eodhd-status"],
    queryFn: api.eodhdFeedStatus,
    retry: false,
    refetchInterval: privateWeb ? false : 60_000,
  });
  const feedReviews = useQuery({
    queryKey: ["macro", "eodhd-reviews"],
    queryFn: api.eodhdMappingCandidates,
    retry: false,
    enabled: !privateWeb,
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
  const syncTechnicals = useMutation({
    mutationFn: api.refreshPairTechnicalSignals,
    onSuccess: (result) => {
      queryClient.setQueryData(["macro", "technicals"], result);
      const available = result.pairs.filter(
        (pair) =>
          pair.chartTrend.daily.signal != null ||
          pair.chartTrend.fourHour.signal != null,
      ).length;
      toast.success(
        `MT5-Tagesstand aktualisiert · ${available} Paare mit auswertbaren Trends.`,
      );
    },
    onError: (error: { message?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["macro", "technicals"] });
      toast.error(
        error.message ??
          "Technische Signale konnten nicht aktualisiert werden.",
      );
    },
  });
  const saveMt5Terminal = useMutation({
    mutationFn: api.setMt5TechnicalTerminal,
    onSuccess: () => {
      setTerminalPathDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["macro", "technicals"] });
      toast.success(
        "MT5-Verbindung gespeichert. Der nächste Kursabruf startet automatisch.",
      );
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "MT5-Verbindung konnte nicht gespeichert werden.",
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
  const usd = dashboard.data?.currencies.find(
    (currency) => currency.currency === "USD",
  );
  const metals = buildPreciousMetalUsdViews(usd, indicatorTemplate);
  const selectedMetal = metals.find(
    (metal) => metal.definition.currency === selectedCurrency,
  );
  const selected =
    selectedMetal?.view ??
    dashboard.data?.currencies.find(
      (currency) => currency.currency === selectedCurrency,
    ) ??
    dashboard.data?.currencies[0];
  const pairs = useMemo(
    () => sortVisiblePairs(dashboard.data?.pairs ?? []),
    [dashboard.data?.pairs],
  );
  const regime = useMemo(
    () => detectMacroRegime(dashboard.data?.currencies ?? []),
    [dashboard.data?.currencies],
  );

  if (dashboard.isLoading) {
    return (
      <div className="page macro-page">
        <PageHeader
          icon={PageIcon}
          eyebrow="Marktkontext"
          title="Macro Heatmap"
          description="Fundamentale Signale und institutionelle Positionierung im Paarvergleich."
        />
        <PageLoading />
      </div>
    );
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="page macro-page">
        <PageHeader
          icon={PageIcon}
          eyebrow="Marktkontext"
          title="Macro Heatmap"
          description="Fundamentale Signale und institutionelle Positionierung im Paarvergleich."
        />
        <ErrorState message="Fundamentaldaten konnten nicht geladen werden. Die bestehenden Technical-, COT-, Seasonality- und Sentiment-Daten bleiben unverändert." />
      </div>
    );
  }

  const imported = Boolean(dashboard.data.snapshotId);
  const availableIndicatorTotal = dashboard.data.currencies.reduce(
    (sum, currency) => sum + availableIndicatorCount(currency.indicators),
    0,
  );
  const indicatorTotal = dashboard.data.currencies.reduce(
    (sum, currency) => sum + currency.indicators.length,
    0,
  );
  const availableCurrencyTotal = dashboard.data.currencies.filter(
    (currency) => availableIndicatorCount(currency.indicators) > 0,
  ).length;
  const snapshotCoverage = indicatorTotal
    ? availableIndicatorTotal / indicatorTotal
    : 0;
  return (
    <div
      className="page macro-scaffold-page"
      aria-label="Fundamentale Macro Heatmap"
    >
      <section className="macro-hero" id="macro-top">
        <PageHeader
          icon={PageIcon}
          eyebrow="Macro Workspace · EODHD Fundamentals"
          title="Fundamentale Forex- & Edelmetall-Heatmap"
          description="Actual, Forecast und Previous werden releasegenau gegenübergestellt. Vergleiche Fiat-Paare und den USD-Einfluss auf Gold und Silber mit ihren eigenen COT- und Kurstrends."
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
                <RefreshCw
                  className={dashboard.isFetching ? "spin" : undefined}
                  size={14}
                />
              </Button>
            </>
          }
        />
        <div className="macro-hero-metrics" aria-label="Snapshot-Übersicht">
          <SnapshotMetric
            icon={ShieldCheck}
            label="Datenabdeckung"
            meta={`${availableIndicatorTotal}/${indicatorTotal} Releases eindeutig bewertet`}
            tone={snapshotCoverage >= 0.8 ? "positive" : "warning"}
            value={percentage(snapshotCoverage)}
          />
          <SnapshotMetric
            icon={Layers3}
            label="Währungsuniversum"
            meta="mit belastbarem Fundamentals Score"
            tone={
              availableCurrencyTotal === dashboard.data.currencies.length
                ? "positive"
                : "warning"
            }
            value={`${availableCurrencyTotal}/${dashboard.data.currencies.length}`}
          />
          <SnapshotMetric
            icon={BarChart3}
            label="Paarmatrix"
            meta={`${fields.length} kanonische Zellen je Paar`}
            tone="info"
            value={`${pairs.length} Paare`}
          />
          <SnapshotMetric
            icon={Clock3}
            label="Snapshot-Zeitpunkt"
            meta={
              privateWeb
                ? "gespeicherter Quellenstand"
                : "lokal gespeicherter Datenstand"
            }
            tone="neutral"
            value={dateTime(dashboard.data.asOf)}
          />
        </div>
      </section>

      <CloudMarketNotice
        importedAt={dashboard.data.cloudImportedAt}
        cotAutomaticRefresh={cot.data?.automaticRefresh}
      />
      {!privateWeb && (
        <MacroFeedOverview
          status={feedStatus.data}
          reviews={feedReviews.data ?? []}
          unavailable={!isTauri()}
          syncing={syncFeed.isPending || Boolean(feedStatus.data?.running)}
          onSync={() => syncFeed.mutate()}
          onReview={(input) => reviewFeedCandidate.mutate(input)}
        />
      )}

      {!imported ? (
        <Card>
          <EmptyState
            icon={DatabaseZap}
            title="Noch keine EODHD-Fundamentaldaten synchronisiert"
            description={
              privateWeb
                ? "Der übernommene Datenstand enthält noch keine freigegebene Fundamentalauswertung. Fehlende Daten erzeugen keine neutralen Ersatzsignale."
                : "Starte den ersten EODHD-Abruf. Eindeutige Releases fließen direkt in die Bewertung; unsichere Provider-Bezeichnungen bleiben bis zur manuellen Freigabe nicht verfügbar."
            }
            action={
              !privateWeb ? (
                <Button
                  onClick={() => syncFeed.mutate()}
                  disabled={syncFeed.isPending || !feedStatus.data?.configured}
                >
                  <RefreshCw size={14} /> EODHD jetzt synchronisieren
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <MacroRegimePanel regime={regime} />

          <Card
            className="macro-scaffold-card macro-workspace-card"
            id="macro-pair-matrix"
          >
            <header className="macro-section-header macro-heatmap-header">
              <div className="macro-section-heading">
                <span className="macro-section-icon" aria-hidden="true">
                  <BarChart3 size={17} />
                </span>
                <div>
                  <span className="page-eyebrow">Relative Stärke</span>
                  <h2>Fundamentale Heatmap</h2>
                  <p>
                    Snapshot {dateTime(dashboard.data.asOf)} · Base minus Quote
                    · sortiert nach Fundamentals Score
                  </p>
                </div>
              </div>
              <div className="macro-technical-actions">
                <Badge className="neutral">{pairs.length} Fiat-Paare</Badge>
                {!privateWeb && (
                  <Button
                    aria-label="Technische Signale aktualisieren"
                    disabled={
                      syncTechnicals.isPending ||
                      technicals.data?.refresh?.status === "running" ||
                      !isTauri()
                    }
                    onClick={() => syncTechnicals.mutate()}
                    size="sm"
                    title="Abgeschlossene 4H- und Daily-Kerzen aus dem lokalen MetaTrader 5 laden"
                  >
                    <RefreshCw
                      className={syncTechnicals.isPending ? "spin" : undefined}
                      size={13}
                    />
                    MT5-Trends
                  </Button>
                )}
              </div>
            </header>
            <div className="macro-heatmap-toolbar">
              <div className="macro-heatmap-legend" aria-label="Signallegende">
                <span data-tone="positive">
                  <i aria-hidden="true" /> Bullish
                </span>
                <span data-tone="negative">
                  <i aria-hidden="true" /> Bearish
                </span>
                <span data-tone="neutral">
                  <i aria-hidden="true" /> Neutral
                </span>
                <span data-tone="unavailable">
                  <i aria-hidden="true" /> Nicht verfügbar
                </span>
                <span data-tone="derived">
                  <i aria-hidden="true" /> Teilweise abgeleitet
                </span>
              </div>
              <span className="macro-scroll-hint">
                <MoveHorizontal size={13} aria-hidden="true" /> Horizontal
                scrollen für alle Treiber
              </span>
            </div>
            {!privateWeb && (
              <div className="macro-technical-status" role="status">
                <span>
                  MT5 · Tagesstand beim ersten App-Start des Tages
                  {technicals.data?.refresh?.lastSuccessAt &&
                    ` · Letzter Abruf ${dateTime(technicals.data.refresh.lastSuccessAt)}`}
                </span>
                <span>
                  {technicals.isError
                    ? "MT5-Trendstatus konnte nicht geladen werden."
                    : technicals.data?.refresh?.status === "running"
                      ? "Abgeschlossene Brokerkerzen werden geladen …"
                      : (technicals.data?.refresh?.message ??
                        (technicals.data?.refresh?.lastSuccessAt
                          ? "Aktualisierung bei laufender App und erreichbarem MT5-Terminal."
                          : "MetaTrader 5 öffnen und anmelden; der tägliche Abruf startet automatisch."))}
                </span>
                {isTauri() && (
                  <details className="macro-mt5-connection">
                    <summary>MT5-Verbindung</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveMt5Terminal.mutate(
                          terminalPathDraft ??
                            technicals.data?.refresh?.terminalPath ??
                            "",
                        );
                      }}
                    >
                      <label htmlFor="mt5-terminal-path">
                        Terminalpfad (optional)
                      </label>
                      <input
                        id="mt5-terminal-path"
                        className="input"
                        placeholder="Automatisch erkennen"
                        value={
                          terminalPathDraft ??
                          technicals.data?.refresh?.terminalPath ??
                          ""
                        }
                        onChange={(event) =>
                          setTerminalPathDraft(event.target.value)
                        }
                        autoComplete="off"
                      />
                      <small>
                        Bei mehreren Installationen den vollständigen Pfad zur
                        gewünschten terminal64.exe angeben.
                      </small>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          saveMt5Terminal.isPending ||
                          syncTechnicals.isPending ||
                          technicals.data?.refresh?.status === "running"
                        }
                      >
                        Verbindung speichern
                      </Button>
                    </form>
                  </details>
                )}
              </div>
            )}
            <CardContent className="macro-scaffold-heatmap-wrap">
              <FundamentalHeatmap
                pairs={pairs}
                cot={cot.data}
                technicals={technicals.data}
              />
            </CardContent>
            <footer className="macro-methodology-note">
              <Info size={15} aria-hidden="true" />
              <p>
                Jede Zelle ist Base minus Quote. Nicht bewertbare
                Währungsindikatoren gehen numerisch mit 0 ein; der konkrete
                Verfügbarkeitsgrund bleibt im Tooltip erhalten. Der Fundamentals
                Score ist die Summe der {fields.length} fundamentalen Zellen.
                4H/Daily und Seasonality dienen separat als technische
                Bestätigung und verändern diesen Score nicht.
              </p>
              <div aria-label="Methodik-Kurzfassung">
                <span>−2 stark bearish</span>
                <span>0 Gleichstand</span>
                <span>+2 stark bullish</span>
              </div>
            </footer>
          </Card>

          <PreciousMetalsHeatmap
            metals={metals}
            usd={usd}
            cot={cot.data}
            technicals={technicals.data}
            onSelect={setSelectedCurrency}
          />

          {selected && (
            <CurrencyOverview
              currencies={dashboard.data.currencies}
              metals={metals}
              selectedMetal={selectedMetal}
              usd={usd}
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

function SnapshotMetric({
  icon: Icon,
  label,
  meta,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  meta: string;
  tone: "positive" | "warning" | "info" | "neutral";
  value: string;
}) {
  return (
    <article className="macro-hero-metric" data-tone={tone}>
      <span className="macro-hero-metric-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{meta}</span>
      </div>
    </article>
  );
}

function MacroRegimePanel({ regime }: { regime: MacroRegimeAssessment }) {
  return (
    <Card
      className="macro-regime-card macro-workspace-card"
      data-regime={regime.key}
      aria-label="Globales Überraschungsregime"
    >
      <header className="macro-section-header">
        <div className="macro-section-heading">
          <span className="macro-section-icon" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <div>
            <span className="page-eyebrow">Konsens-Überraschungen</span>
            <h2>Globales Überraschungsregime</h2>
            <p>
              Gleich gewichtete Länderperspektive aus den letzten vollständigen
              Actual-vs-Forecast-Releases
            </p>
          </div>
        </div>
        <Badge className={regimeTone(regime.key)}>
          <Activity size={12} /> {confidenceLabel(regime.confidence)}
        </Badge>
      </header>
      <CardContent className="macro-regime-content">
        <section className="macro-regime-summary" data-regime={regime.key}>
          <div className="macro-regime-summary-label">
            <span aria-hidden="true">
              <Activity size={15} />
            </span>
            Aktuelle Einordnung
          </div>
          <h3>{regime.label}</h3>
          <p>{regime.summary}</p>
          <div className="macro-regime-coverage">
            <div>
              <span>Gesamt-Coverage</span>
              <strong>{percentage(regime.coverage)}</strong>
            </div>
            <div
              aria-label={`Gesamt-Coverage ${percentage(regime.coverage)}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(regime.coverage * 100)}
              className="macro-coverage-track"
              role="meter"
            >
              <i
                aria-hidden="true"
                style={{ width: `${Math.min(regime.coverage, 1) * 100}%` }}
              />
            </div>
            <small>
              Mindeststandard: 4 Währungen und 40 % Datenabdeckung je
              Kerndimension
            </small>
          </div>
        </section>
        <div className="macro-regime-dimensions">
          <RegimeDimensionCard
            label="Aktivitätsimpuls"
            description="Wachstum + Arbeitsmarkt"
            dimension={regime.growth}
            kind="activity"
          />
          <RegimeDimensionCard
            label="Inflationsimpuls"
            description="Inflation vs. Forecast"
            dimension={regime.inflation}
            kind="inflation"
          />
          <RegimeDimensionCard
            label="Zinsüberraschung"
            description="Actual vs. erwarteter Zins"
            dimension={regime.policy}
            kind="policy"
          />
        </div>
      </CardContent>
      <footer className="macro-regime-note">
        <Info size={14} aria-hidden="true" />
        <p>
          Das Regime beschreibt Überraschungen gegenüber dem Konsens, keine
          absoluten Konjunkturlevel. Es ist weder ein Risk-on/Risk-off- noch ein
          Handelssignal. Neutrale Releases zählen als verfügbare Evidenz;
          fehlende Werte nicht.
        </p>
      </footer>
    </Card>
  );
}

function RegimeDimensionCard({
  label,
  description,
  dimension,
  kind,
}: {
  label: string;
  description: string;
  dimension: RegimeDimension;
  kind: "activity" | "inflation" | "policy";
}) {
  const available = dimension.signal !== "unavailable";
  const strength =
    available && dimension.score !== null
      ? Math.min(Math.abs(dimension.score), 1) * 50
      : 0;
  return (
    <article className="macro-regime-dimension" data-tone={dimension.signal}>
      <header>
        <div>
          <span>{label}</span>
          <small>{description}</small>
        </div>
        <strong>{available ? signedDecimal(dimension.score) : "—"}</strong>
      </header>
      <div
        aria-label={`${label} Score`}
        aria-valuemax={1}
        aria-valuemin={-1}
        aria-valuenow={available ? (dimension.score ?? 0) : undefined}
        className="macro-regime-meter"
        data-direction={dimension.signal}
        role="meter"
      >
        <span aria-hidden="true" />
        {available && dimension.score !== 0 && (
          <i aria-hidden="true" style={{ width: `${strength}%` }} />
        )}
        {available && dimension.score === 0 && (
          <i aria-hidden="true" className="is-neutral" />
        )}
      </div>
      <footer>
        <Badge className={signalTone(dimension.signal)}>
          {dimensionLabel(dimension.signal, kind)}
        </Badge>
        <small>
          {percentage(dimension.coverage)} · {dimension.availableCurrencies}/
          {dimension.totalCurrencies} Währungen
        </small>
      </footer>
    </article>
  );
}

function regimeTone(key: MacroRegimeKey) {
  if (key === "unavailable") return "warning";
  if (
    key === "stagflation" ||
    key === "disinflationary_slowdown" ||
    key === "slowdown"
  ) {
    return "negative";
  }
  if (key === "goldilocks" || key === "expansion") return "positive";
  if (key === "reflation" || key === "inflation_pressure") return "warning";
  return "neutral";
}

function signalTone(signal: RegimeSignal) {
  if (signal === "positive") return "positive";
  if (signal === "negative") return "negative";
  if (signal === "unavailable") return "warning";
  return "neutral";
}

function confidenceLabel(confidence: MacroRegimeAssessment["confidence"]) {
  if (confidence === "high") return "Klare Einordnung";
  if (confidence === "medium") return "Mittlere Regimeklarheit";
  if (confidence === "low") return "Geringe Regimeklarheit";
  return "Nicht belastbar";
}

function dimensionLabel(
  signal: RegimeSignal,
  kind: "activity" | "inflation" | "policy",
) {
  if (signal === "unavailable") return "Nicht verfügbar";
  if (signal === "neutral") return "Ausgeglichen";
  if (kind === "policy") return signal === "positive" ? "Hawkish" : "Dovish";
  if (kind === "inflation") {
    return signal === "positive" ? "Über Erwartung" : "Unter Erwartung";
  }
  return signal === "positive" ? "Stärker" : "Schwächer";
}

function signedDecimal(score: number | null) {
  if (score === null) return "—";
  const value = score.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return score > 0 ? `+${value}` : value;
}

function percentage(value: number) {
  return value.toLocaleString("de-DE", {
    style: "percent",
    maximumFractionDigits: 0,
  });
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
  const failed = status?.lastRun?.status === "failed";
  const feedTone =
    unavailable || !configured
      ? "warning"
      : failed
        ? "negative"
        : syncing
          ? "info"
          : "positive";
  const feedBadge = unavailable
    ? "Nur Desktop"
    : !configured
      ? "Konfiguration fehlt"
      : failed
        ? "Abruf fehlgeschlagen"
        : syncing
          ? "Synchronisiert"
          : "Pipeline bereit";
  return (
    <Card
      aria-label="Economic Feed Status"
      className="macro-feed-card macro-workspace-card"
      data-tone={feedTone}
    >
      <header className="macro-feed-statusbar">
        <span className="macro-feed-status-icon" aria-hidden="true">
          <DatabaseZap size={18} />
        </span>
        <div className="macro-feed-status-copy">
          <span className="page-eyebrow">Datenversorgung</span>
          <h2>Automatischer Economic Feed</h2>
          <p>
            {unavailable
              ? "Die Automation läuft ausschließlich in der geöffneten Desktop-App."
              : configured
                ? `Letzter erfolgreicher Datenstand ${status?.lastSuccessAt ? dateTime(status.lastSuccessAt) : "noch ausstehend"}`
                : "EODHD_API_KEY ist im nativen Backend nicht konfiguriert."}
          </p>
        </div>
        <div className="macro-feed-actions">
          <Badge
            className={
              failed
                ? "negative"
                : configured
                  ? syncing
                    ? "neutral"
                    : "positive"
                  : "warning"
            }
          >
            {failed ? <CircleAlert size={11} /> : <CheckCircle2 size={11} />}
            {feedBadge}
          </Badge>
          <Button onClick={onSync} disabled={!configured || syncing}>
            <RefreshCw size={14} className={syncing ? "spin" : undefined} />
            {syncing ? "Synchronisiert …" : "Jetzt prüfen"}
          </Button>
        </div>
      </header>

      {status?.lastRun && status.lastRun.status !== "failed" && (
        <p className="macro-feed-run-summary">
          Letzter Lauf: {status.lastRun.eventsSeen} Releases geprüft ·{" "}
          {status.lastRun.eventsUpdated} Datensätze aktualisiert ·{" "}
          {status.pendingMappingReviews} Zuordnungen zu prüfen
        </p>
      )}
      {failed && (
        <p className="macro-feed-run-summary is-error">
          Letzter Abruf fehlgeschlagen: {status?.lastRun?.errorMessage}
        </p>
      )}

      <CardContent className="macro-feed-content">
        <div className="macro-feed-metrics" aria-label="Feed-Kennzahlen">
          <div>
            <small>Release-Nachprüfungen</small>
            <strong>{status?.pendingJobs ?? 0}</strong>
            <span>noch ausstehend</span>
          </div>
          <div>
            <small>Nächster geplanter Lauf</small>
            <strong>
              {status?.nextDueAt ? dateTime(status.nextDueAt) : "—"}
            </strong>
            <span>releasegebundener Check</span>
          </div>
          <div>
            <small>Mapping-Prüfliste</small>
            <strong>{pendingReviews.length}</strong>
            <span>offene Bezeichnungen</span>
          </div>
        </div>

        <section className="macro-feed-review-board" aria-label="Prüfliste">
          <div className="macro-feed-panel-title">
            <span>
              <CircleAlert size={14} /> Prüfliste
            </span>
            <Badge className={pendingReviews.length ? "warning" : "neutral"}>
              {pendingReviews.length} offen
            </Badge>
          </div>
          {!pendingReviews.length ? (
            <div className="macro-feed-review-empty">
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>Mapping vollständig</strong>
                <span>Keine unbekannten Bezeichnungen.</span>
              </div>
            </div>
          ) : (
            <div className="macro-feed-review-list">
              {pendingReviews.slice(0, 3).map((review) => (
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
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function FundamentalHeatmap({
  pairs,
  cot,
  technicals,
}: {
  pairs: FundamentalPairView[];
  cot?: CotDashboard;
  technicals?: PairTechnicalDashboard;
}) {
  if (!pairs.length) {
    return (
      <div className="empty-copy" style={{ margin: "16px" }}>
        Noch keine Fiat-Forexpaare verfügbar.
      </div>
    );
  }
  return (
    <table
      className="macro-scaffold-heatmap pair-heatmap-table"
      aria-label="Fiat-Forexpaare"
    >
      <HeatmapHead />
      <tbody>
        {pairs.map((pair) => {
          const institutional = buildInstitutionalPairActivity(
            pair.base,
            pair.quote,
            cot,
          );
          const technical = technicals?.pairs.find(
            (item) => item.base === pair.base && item.quote === pair.quote,
          );
          return (
            <tr
              data-tone={toneKey(pair.fundamentalScore)}
              data-testid="forex-pair-row"
              key={`${pair.base}-${pair.quote}`}
            >
              <th className="heatmap-symbol" scope="row">
                <span className="macro-pair-symbol">
                  <span>{pair.base}</span>
                  <ArrowRight size={11} aria-hidden="true" />
                  <span>{pair.quote}</span>
                </span>
              </th>
              <td className={`macro-bias-cell ${biasTone(pair.biasLabel)}`}>
                <span data-tone={toneKey(pair.fundamentalScore)}>
                  {pair.biasLabel}
                </span>
              </td>
              <td
                className={toneForScore(pair.fundamentalScore)}
                data-intensity={
                  pair.fundamentalScore === 0
                    ? undefined
                    : scoreIntensity(pair.fundamentalScore)
                }
                title={`Fundamentals ${signed(pair.fundamentalScore)}`}
              >
                <HeatmapValue
                  max={fields.length}
                  score={pair.fundamentalScore}
                />
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
              <ChartTrendCell pair={technical} />
              <SeasonalityTrendCell pair={technical} />
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

function HeatmapHead({ metals = false }: { metals?: boolean }) {
  return (
    <>
      <colgroup>
        <col span={6} />
        <col className="macro-chart-trend-column" />
        <col span={fields.length + 1} />
      </colgroup>
      <thead>
        <tr>
          <th
            className="macro-output-group-heading"
            colSpan={4}
            scope="colgroup"
          >
            <span>
              <Gauge size={12} aria-hidden="true" /> Output
            </span>
          </th>
          <th
            className="institutional-group-heading"
            colSpan={2}
            scope="colgroup"
          >
            <span>
              <Activity size={12} aria-hidden="true" /> Institutional Activity
            </span>
          </th>
          <th className="technical-group-heading" colSpan={2} scope="colgroup">
            <span>
              <TrendingUp size={12} aria-hidden="true" /> Technicals
            </span>
          </th>
          {groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <th
                className={`macro-factor-group-heading is-${group.factor}`}
                colSpan={group.columns.length}
                key={group.factor}
                scope="colgroup"
              >
                <span>
                  <GroupIcon size={12} aria-hidden="true" /> {group.title}
                  <small aria-hidden="true">{group.columns.length}</small>
                </span>
              </th>
            );
          })}
        </tr>
        <tr>
          <th className="macro-output-column" scope="col">
            Symbol
          </th>
          <th className="macro-output-column" scope="col">
            {metals ? "USD-Einfluss Bias" : "Fund. Bias"}
          </th>
          <th className="macro-output-column" scope="col">
            {metals ? "USD-Einfluss Score" : "Fundamentals Score"}
          </th>
          <th className="macro-output-column" scope="col">
            Institutional Score
          </th>
          <th className="macro-institutional-column" scope="col">
            Latest Buys/Sells
          </th>
          <th className="macro-institutional-column" scope="col">
            COT Pipeline
          </th>
          <th className="macro-technical-column" scope="col">
            4H / Daily Chart Trend
          </th>
          <th className="macro-technical-column" scope="col">
            Seasonality Trend
          </th>
          {fields.map((key) => (
            <th key={key} scope="col">
              {fieldLabel(key)}
            </th>
          ))}
        </tr>
      </thead>
    </>
  );
}

function PreciousMetalsHeatmap({
  metals,
  usd,
  cot,
  technicals,
  onSelect,
}: {
  metals: PreciousMetalUsdView[];
  usd?: FundamentalCurrencyView;
  cot?: CotDashboard;
  technicals?: PairTechnicalDashboard;
  onSelect: (currency: string) => void;
}) {
  return (
    <Card
      className="macro-scaffold-card macro-workspace-card"
      id="macro-precious-metals"
    >
      <header className="macro-section-header">
        <div className="macro-section-heading">
          <span className="macro-section-icon" aria-hidden="true">
            <Layers3 size={17} />
          </span>
          <div>
            <span className="page-eyebrow">Edelmetalle · USD-Kanal</span>
            <h2>Gold & Silber</h2>
            <p>
              USD-positive Überraschung → Metall −1 · USD-negative Überraschung
              → Metall +1
            </p>
          </div>
        </div>
        <Badge className="neutral">XAU/USD · XAG/USD</Badge>
      </header>
      <div className="macro-metal-context">
        <p>
          Der USD-Einfluss ist eine Modellannahme aus den US-Releases. Gold und
          Silber haben hier denselben USD-Score; ihre eigenen COT-, Kurs- und
          Seasonality-Signale können davon abweichen.
        </p>
        <p>
          Realzinsen, Krisennachfrage und Zentralbankkäufe können den Goldpreis
          anders bewegen. Bei Silber kommen Industrienachfrage und Angebot
          hinzu. Die gesamte Metallrichtung lässt sich daraus nicht ableiten.
        </p>
      </div>
      <CardContent className="macro-scaffold-heatmap-wrap">
        <table
          className="macro-scaffold-heatmap pair-heatmap-table"
          aria-label="Edelmetalle und USD-Einfluss"
        >
          <HeatmapHead metals />
          <tbody>
            {metals.map((metal) => {
              const { definition, view, score, availableIndicators } = metal;
              const activity = buildInstitutionalAssetActivity(
                definition.cotSymbol,
                cot,
              );
              const technical = technicals?.pairs.find(
                (pair) =>
                  pair.base === definition.currency && pair.quote === "USD",
              );
              return (
                <tr
                  key={definition.currency}
                  data-testid="precious-metal-row"
                  data-tone={toneKey(score)}
                >
                  <th className="heatmap-symbol" scope="row">
                    <button
                      type="button"
                      className="macro-metal-symbol"
                      onClick={() => onSelect(definition.currency)}
                      aria-label={`${definition.name} US-Releases ansehen`}
                    >
                      <strong>{definition.name}</strong>
                      <small>{definition.currency}/USD</small>
                    </button>
                  </th>
                  <td
                    className={`macro-bias-cell ${score === null ? "heatmap-unavailable" : biasTone(view.fundamentalsBias)}`}
                  >
                    <span data-tone={toneKey(score)}>
                      {score === null
                        ? "Nicht verfügbar"
                        : view.fundamentalsBias}
                    </span>
                  </td>
                  <td
                    className={
                      score === null
                        ? "heatmap-unavailable"
                        : toneForScore(score)
                    }
                    title={`${definition.name} USD-Einfluss: ${score === null ? "nicht verfügbar" : signed(score)} · ${availableIndicators}/${fields.length} US-Signale`}
                  >
                    {score === null ? (
                      "—"
                    ) : (
                      <HeatmapValue max={fields.length} score={score} />
                    )}
                  </td>
                  <MetalInstitutionalCell
                    activity={activity}
                    label="Institutional Score"
                    score={activity.score}
                    max={2}
                  />
                  <MetalInstitutionalCell
                    activity={activity}
                    label="Latest Buys/Sells"
                    score={activity.latestChangeSignal}
                    max={1}
                  />
                  <MetalInstitutionalCell
                    activity={activity}
                    label="COT Pipeline"
                    score={activity.pipelineSignal}
                    max={1}
                  />
                  <ChartTrendCell pair={technical} />
                  <SeasonalityTrendCell pair={technical} />
                  {fields.map((key) => {
                    const indicator = view.indicators.find(
                      (item) => item.key === key,
                    );
                    const source = usd?.indicators.find(
                      (item) => item.key === key,
                    );
                    const available =
                      indicator && isAvailableIndicator(indicator);
                    const title = `${definition.name} · US ${fieldLabel(key)}: ${available ? `USD ${signed(source!.score)} → Metall ${signed(indicator.score)}` : "nicht verfügbar"} · Actual ${source?.actualText ?? "—"} · Forecast ${source?.forecastText ?? "—"} · Previous ${source?.previousText ?? "—"} · ${source?.releasedAt ? dateTime(source.releasedAt) : "kein Release"}${source?.frequency ? ` · ${source.frequency}` : ""}${indicator?.reasonCodes.length ? ` · ${indicator.reasonCodes.map(reasonLabel).join(", ")}` : ""}`;
                    return (
                      <td
                        key={key}
                        className={
                          available
                            ? toneForScore(indicator.score)
                            : "heatmap-unavailable"
                        }
                        title={title}
                      >
                        {available ? (
                          <HeatmapValue max={1} score={indicator.score} />
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
      <footer className="macro-methodology-note">
        <Info size={15} aria-hidden="true" />
        <p>
          USD-Einfluss = Summe der umgekehrten verfügbaren US-Signale. Fehlende
          oder veraltete Releases bleiben ohne Signal; Coverage steht im
          Score-Tooltip. COT wird direkt aus GOLD bzw. SILVER gelesen. Charts
          und Saisonalität verwenden die eigene Metallhistorie.
        </p>
        <div>
          <a
            href="https://www.gold.org/goldhub/research/what-drives-gold"
            target="_blank"
            rel="noreferrer"
          >
            Gold-Treiber · WGC
          </a>
          <a
            href="https://silverinstitute.org/global-silver-market-forecast-to-remain-in-a-sizeable-deficit-in-2025/"
            target="_blank"
            rel="noreferrer"
          >
            Silber-Treiber · Silver Institute
          </a>
        </div>
      </footer>
    </Card>
  );
}

function MetalInstitutionalCell({
  activity,
  label,
  score,
  max,
}: {
  activity: ReturnType<typeof buildInstitutionalAssetActivity>;
  label: string;
  score: number | null;
  max: number;
}) {
  const title = `${activity.currency} ${label}: ${score === null ? "nicht verfügbar" : signed(score)} · eigener Metall-COT · ${activity.contract?.reportDate ?? "kein Report"} · ${activity.contract?.traderGroup ?? "—"} · Coverage ${activity.coverage}/2`;
  return (
    <td
      className={score === null ? "heatmap-unavailable" : toneForScore(score)}
      title={title}
    >
      {score === null ? "—" : <HeatmapValue score={score} max={max} />}
    </td>
  );
}

function ChartTrendCell({ pair }: { pair?: PairTechnicalSignalView }) {
  const trend = pair?.chartTrend;
  if (!trend) {
    return (
      <td
        className="heatmap-unavailable macro-technical-signal-cell"
        title="4H / Daily Chart Trend: nicht verfügbar"
      >
        —
      </td>
    );
  }
  const source = trend.source;
  const symbol = source?.symbol ?? (source ? null : pair?.sourceSymbol);
  const provider = source?.provider === "mt5" ? "MT5" : "EODHD";
  const inverted = source?.inverted ?? pair?.inverted;
  const available = trend.daily.signal != null || trend.fourHour.signal != null;
  const label =
    trend.signal == null
      ? available
        ? "Teilweise verfügbar"
        : "Nicht verfügbar"
      : trend.signal === 0
        ? trend.daily.signal !== trend.fourHour.signal
          ? "Uneinheitlich"
          : "Neutral"
        : `${technicalSignalLabel(trend.status)} bestätigt`;
  const title = [
    `4H / Daily: ${label}`,
    timeframeTitle("4H", trend.fourHour),
    timeframeTitle("Daily", trend.daily),
    `Quelle ${provider}${source?.label ? ` · ${source.label}` : ""}${symbol ? ` · ${symbol}` : ""}${inverted ? " (invertiert; Indikatoren beziehen sich auf das Quellsymbol)" : ""}`,
    ...(source?.fetchedAt ? [`Abgerufen ${dateTime(source.fetchedAt)}`] : []),
  ].join(" · ");
  return (
    <td
      className={`${trend.signal == null ? "heatmap-unavailable" : toneForScore(trend.signal)} macro-technical-signal-cell`}
      title={title}
    >
      <div className="technical-chart-trend">
        <span className="technical-signal-label">{label}</span>
        {(
          [
            ["Daily", trend.daily],
            ["4H", trend.fourHour],
          ] as const
        ).map(([name, value]) => (
          <span
            className="technical-timeframe"
            key={name}
            title={timeframeTitle(name, value)}
          >
            <span>{name}</span>
            <strong data-signal={value.signal ?? "unavailable"}>
              {technicalSignalLabel(value.status)}
            </strong>
          </span>
        ))}
        {symbol && (
          <small>
            {provider} · {symbol}
            {inverted ? " ↔" : ""}
          </small>
        )}
      </div>
    </td>
  );
}

function SeasonalityTrendCell({ pair }: { pair?: PairTechnicalSignalView }) {
  const trend = pair?.seasonalityTrend;
  if (!trend || trend.signal == null) {
    const reason = trend?.reasonCodes.map(technicalReasonLabel).join(", ");
    return (
      <td
        className="heatmap-unavailable macro-technical-signal-cell"
        title={`Seasonality Trend: nicht verfügbar${reason ? ` · ${reason}` : ""}`}
      >
        —
      </td>
    );
  }
  const source = pair?.sourceSymbol
    ? ` · Quelle ${pair.sourceSymbol}${pair.inverted ? " (invertiert)" : ""}`
    : "";
  const title = [
    `Seasonality: ${technicalSignalLabel(trend.status)}`,
    `20 Handelstage`,
    `Ø ${returnPercent(trend.averageReturn)}`,
    `Median ${returnPercent(trend.medianReturn)}`,
    `Trefferquote ${ratioPercent(trend.positiveRatio)}`,
    `${trend.samples} Beobachtungen aus ${trend.completeYears} vollständigen Jahren`,
  ].join(" · ");
  return (
    <td
      className={`${toneForScore(trend.signal)} macro-technical-signal-cell`}
      title={`${title}${source}`}
    >
      <span className="technical-signal-label">
        {technicalSignalLabel(trend.status)}
      </span>
    </td>
  );
}

function timeframeTitle(label: string, value: TimeframeTrendView) {
  const stamp = value.latestCandleAt
    ? ` · Letzte Kerze ab ${dateTime(value.latestCandleAt)}`
    : "";
  if (value.signal == null) {
    return `${label} nicht verfügbar (${value.reasonCodes.map(technicalReasonLabel).join(", ")})${stamp}`;
  }
  return `${label} ${technicalSignalLabel(value.status)} · EMA20 ${decimal(value.ema20)} · EMA50 ${decimal(value.ema50)} · ADX ${decimal(value.adx14)} · ${value.bars} abgeschlossene Kerzen${stamp}`;
}

function technicalSignalLabel(status: TechnicalSignalStatus) {
  if (status === "bullish") return "Bullish";
  if (status === "bearish") return "Bearish";
  if (status === "neutral") return "Neutral";
  return "Nicht verfügbar";
}

function technicalReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    exact_pair_history_unavailable: "keine direkte oder inverse Paarhistorie",
    insufficient_completed_bars: "zu wenige abgeschlossene Kerzen",
    indicator_warmup_unavailable: "Indikator-Warm-up unvollständig",
    stale_completed_candles: "Kerzendaten sind veraltet",
    timeframe_evidence_unavailable: "ein Zeitrahmen ist nicht verfügbar",
    mt5_not_loaded: "noch kein MT5-Kursabruf",
    mt5_symbol_unavailable: "dieses Währungspaar fehlt im MT5-Forexkatalog",
    mt5_symbol_ambiguous:
      "mehrere Broker-Symbole; bitte genau eine Variante in der MT5-Marktübersicht auswählen",
    mt5_history_unavailable:
      "MT5-Kerzen fehlen; den Chart im Terminal öffnen und erneut aktualisieren",
    mt5_invalid_candles: "MT5-Kerzen sind unvollständig oder ungültig",
    seasonality_profile_invalid: "Seasonality-Profil ist ungültig",
    seasonality_20d_window_unavailable: "20-Tage-Fenster fehlt",
    seasonality_history_insufficient: "zu wenige vollständige Jahre",
  };
  return labels[reason] ?? reason;
}

function decimal(value?: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3);
}

function returnPercent(value?: number | null) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} %`;
}

function ratioPercent(value?: number | null) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${(value * 100).toFixed(0)} %`;
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
      <HeatmapValue max={4} score={activity.score} />
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
    kind === "latest" ? activity.latestChangeScore : activity.pipelineScore;
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
      <HeatmapValue max={2} score={score} />
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
      data-intensity={cell.score === 0 ? undefined : scoreIntensity(cell.score)}
      title={`${cell.label}: Base ${signed(cell.baseScore)}, Quote ${signed(cell.quoteScore)}${releaseContext}${diagnostic}`}
    >
      <HeatmapValue max={2} score={cell.score} />
    </td>
  );
}

function HeatmapValue({ max, score }: { max: number; score: number }) {
  const strength = Math.min(Math.abs(score) / Math.max(max, 1), 1) * 50;
  const direction = toneKey(score);
  return (
    <span className="macro-heatmap-cell-value" data-direction={direction}>
      <strong>{signed(score)}</strong>
      <span aria-hidden="true" className="macro-heatmap-cell-meter">
        <i />
        {score !== 0 && <b style={{ width: `${strength}%` }} />}
        {score === 0 && <b className="is-neutral" />}
      </span>
    </span>
  );
}

function CurrencyOverview({
  currencies,
  metals,
  selectedMetal,
  usd,
  selected,
  onSelect,
  cot,
  cotError,
  cotSyncing,
  cotUnavailable,
  onSyncCot,
}: {
  currencies: FundamentalCurrencyView[];
  metals: PreciousMetalUsdView[];
  selectedMetal?: PreciousMetalUsdView;
  usd?: FundamentalCurrencyView;
  selected: FundamentalCurrencyView;
  onSelect: (currency: string) => void;
  cot?: CotDashboard;
  cotError: boolean;
  cotSyncing: boolean;
  cotUnavailable: boolean;
  onSyncCot: () => void;
}) {
  const institutional = selectedMetal
    ? buildInstitutionalAssetActivity(selectedMetal.definition.cotSymbol, cot)
    : buildInstitutionalCurrencyActivity(selected.currency, cot);
  const scoreLabel = selectedMetal
    ? "USD-Einfluss Score"
    : "Fundamentals Score";
  const selectedAvailableIndicators = availableIndicatorCount(
    selected.indicators,
  );
  const selectedScoreTone =
    selectedAvailableIndicators > 0
      ? toneKey(selected.fundamentalsScore)
      : "unavailable";
  return (
    <section
      className="macro-pipeline"
      aria-labelledby="fundamental-currency-title"
      id="macro-currency-detail"
    >
      <div className="macro-pipeline-heading">
        <div className="macro-section-heading">
          <span className="macro-section-icon" aria-hidden="true">
            <Gauge size={17} />
          </span>
          <div>
            <span className="page-eyebrow">Economic Overview</span>
            <h2 id="fundamental-currency-title">
              Währungen & Edelmetalle im Detail
            </h2>
            <p>
              US-Releases für Gold und Silber, Währungstreiber und eigene
              COT-Aktivität.
            </p>
          </div>
        </div>
        <Badge className="neutral">
          <Layers3 size={11} aria-hidden="true" />
          {`${currencies.length} Währungen + ${metals.length} Metalle · ${selected.indicators.length} Indikatoren`}
        </Badge>
      </div>
      <div className="macro-pipeline-layout">
        <aside className="macro-asset-rail" aria-label="Währung auswählen">
          <section className="macro-asset-group">
            <header>
              <h3>Währungen</h3>
              <span>Score-Richtung</span>
            </header>
            <div>
              {currencies.map((currency) => {
                const available = availableIndicatorCount(currency.indicators);
                const hasScore = available > 0;
                return (
                  <button
                    aria-label={`${currency.currency}, Fundamentals ${hasScore ? signed(currency.fundamentalsScore) : "nicht verfügbar"}${hasScore ? `, ${currency.fundamentalsBias}` : ""}`}
                    aria-pressed={currency.currency === selected.currency}
                    className={
                      currency.currency === selected.currency
                        ? "is-selected"
                        : undefined
                    }
                    data-tone={
                      hasScore
                        ? toneKey(currency.fundamentalsScore)
                        : "unavailable"
                    }
                    key={currency.currency}
                    onClick={() => onSelect(currency.currency)}
                    type="button"
                  >
                    <span className="macro-asset-code">
                      {currency.currency}
                    </span>
                    <small>
                      <strong>
                        {hasScore ? signed(currency.fundamentalsScore) : "—"}
                      </strong>
                      <span>
                        {hasScore ? currency.fundamentalsBias : "Keine Daten"}
                      </span>
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
          <section
            className="macro-asset-group"
            aria-label="Edelmetall auswählen"
          >
            <header>
              <h3>Edelmetalle</h3>
              <span>USD-Einfluss</span>
            </header>
            <div>
              {metals.map((metal) => (
                <button
                  type="button"
                  key={metal.definition.currency}
                  onClick={() => onSelect(metal.definition.currency)}
                  aria-label={`${metal.definition.name}, USD-Einfluss ${metal.score === null ? "nicht verfügbar" : signed(metal.score)}`}
                  aria-pressed={selected.currency === metal.definition.currency}
                  className={
                    selected.currency === metal.definition.currency
                      ? "is-selected"
                      : undefined
                  }
                  data-tone={toneKey(metal.score)}
                >
                  <span className="macro-asset-code">
                    {metal.definition.name}
                  </span>
                  <small>
                    <strong>
                      {metal.score === null ? "—" : signed(metal.score)}
                    </strong>
                    <span>
                      {metal.score === null
                        ? "Keine US-Daten"
                        : metal.view.fundamentalsBias}
                    </span>
                  </small>
                </button>
              ))}
            </div>
          </section>
          <div
            className="macro-scorecard"
            data-tone={selectedScoreTone}
            aria-label={`${selected.currency} ${scoreLabel}`}
          >
            <header className="macro-scorecard-header">
              <div className="macro-scorecard-title">
                <span aria-hidden="true">
                  <Gauge size={15} />
                </span>
                <div>
                  <small>
                    {selectedMetal
                      ? "USD-Einfluss auf das Metall"
                      : "Fundamentaler Gesamtscore"}
                  </small>
                  <strong>{selected.currency}</strong>
                </div>
              </div>
              <div
                className="macro-scorecard-coverage"
                title="Anzahl der aktuell eindeutig bewertbaren Indikatoren"
              >
                <Layers3 size={13} aria-hidden="true" />
                <span>
                  <strong>
                    {selectedAvailableIndicators}/{selected.indicators.length}
                  </strong>
                  <small>bewertet</small>
                </span>
              </div>
            </header>

            <FundamentalScoreGauge
              availableIndicators={selectedAvailableIndicators}
              bias={selected.fundamentalsBias}
              currency={selected.currency}
              scoreLabel={scoreLabel}
              score={selected.fundamentalsScore}
              totalIndicators={selected.indicators.length}
            />

            <div
              className="macro-scorecard-institutional"
              data-tone={toneKey(institutional.score)}
            >
              <span className="macro-scorecard-institutional-icon">
                <Activity size={14} aria-hidden="true" />
              </span>
              <div>
                <strong>Institutionelles Signal</strong>
                <small>Separater COT-Faktor · {institutional.coverage}/2</small>
              </div>
              <span className="macro-scorecard-institutional-value">
                <strong>
                  {institutional.score === null
                    ? "—"
                    : signed(institutional.score)}
                </strong>
                <small>{institutional.biasLabel}</small>
              </span>
            </div>

            <section className="macro-scorecard-drivers">
              <header>
                <span>
                  {selectedMetal
                    ? "US-Treiber · umgekehrte Signale"
                    : "Fundamentale Treiber"}
                </span>
                <small>Score / verfügbare Signale</small>
              </header>
              <dl>
                <FundamentalDriverRow
                  factor="growth"
                  indicators={selected.indicators}
                  label="Wachstum"
                  score={selected.economicGrowthScore}
                />
                <FundamentalDriverRow
                  factor="inflation"
                  indicators={selected.indicators}
                  label="Inflation"
                  score={selected.inflationScore}
                />
                <FundamentalDriverRow
                  factor="labor"
                  indicators={selected.indicators}
                  label="Arbeitsmarkt"
                  score={selected.jobsMarketScore}
                />
                <FundamentalDriverRow
                  factor="rates"
                  indicators={selected.indicators}
                  label="Leitzinsen"
                  score={selected.ratesScore}
                />
              </dl>
            </section>
            <p className="macro-scorecard-method">
              {selectedMetal
                ? "USD-Modell: positive US-Signale werden negativ für das Metall gewertet. Kein Gesamtscore des Metalls."
                : "Ungewichtete Summe · fehlende Werte bleiben ohne Signal."}
            </p>
          </div>
        </aside>
        <div className="macro-pipeline-content">
          <header className="macro-selected-asset">
            <div className="macro-selected-asset-leading">
              <span
                aria-hidden="true"
                className="macro-selected-currency-mark"
                data-tone={selectedScoreTone}
              >
                {selected.currency.slice(0, 1)}
              </span>
              <div>
                <span className="page-eyebrow">
                  {selectedMetal
                    ? "Edelmetall · US-Daten"
                    : "Ausgewählte Währung"}
                </span>
                <h3>
                  {selectedMetal
                    ? `${selectedMetal.definition.name} · ${selected.currency}/USD`
                    : selected.currency}
                </h3>
                <p>
                  {selectedMetal
                    ? "Actual, Forecast und Previous stammen aus den USA; der Status zeigt den umgekehrten USD-Einfluss."
                    : "Releasebasierte Bewertung aus Actual versus Forecast"}
                </p>
              </div>
            </div>
            <div className="macro-selected-asset-summary">
              <span>
                <small>{selectedMetal ? "USD-Einfluss" : "Fundamentals"}</small>
                <strong>
                  {selectedAvailableIndicators
                    ? signed(selected.fundamentalsScore)
                    : "—"}
                </strong>
              </span>
              <span>
                <small>Coverage</small>
                <strong>
                  {selectedAvailableIndicators}/{selected.indicators.length}
                </strong>
              </span>
              <Badge
                className={
                  selectedAvailableIndicators
                    ? biasTone(selected.fundamentalsBias)
                    : "warning"
                }
              >
                {selectedAvailableIndicators
                  ? selected.fundamentalsBias
                  : "Nicht verfügbar"}
              </Badge>
            </div>
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
              const available = availableIndicatorCount(indicators);
              const GroupIcon = group.icon;
              return (
                <section className="macro-pipeline-panel" key={group.factor}>
                  <header
                    data-tone={available ? toneKey(score) : "unavailable"}
                  >
                    <div className="macro-pipeline-panel-title">
                      <span aria-hidden="true">
                        <GroupIcon size={15} />
                      </span>
                      <div>
                        <h4>
                          {selectedMetal
                            ? `USA · ${group.shortTitle}`
                            : group.title}
                        </h4>
                        <small>
                          {`${group.description} · ${available}/${indicators.length} Signale`}
                        </small>
                      </div>
                    </div>
                    <span
                      className="macro-signal-chip"
                      data-tone={available ? toneKey(score) : "unavailable"}
                    >
                      {available
                        ? `${signed(score)} · ${biasForScore(score)}`
                        : "Nicht verfügbar"}
                    </span>
                  </header>
                  <div className="macro-pipeline-columns" aria-hidden="true">
                    <span>{selectedMetal ? "Metall-Signal" : "Status"}</span>
                    <span>Actual</span>
                    <span>Forecast</span>
                    <span>Previous</span>
                    <span>Surprise</span>
                    <span>Release / Grund</span>
                  </div>
                  <div className="macro-pipeline-rows">
                    {indicators.map((indicator) => (
                      <IndicatorRow
                        indicator={indicator}
                        key={indicator.key}
                        usdSource={
                          selectedMetal
                            ? usd?.indicators.find(
                                (source) => source.key === indicator.key,
                              )
                            : undefined
                        }
                      />
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
        <div className="macro-pipeline-panel-title">
          <span aria-hidden="true">
            <Activity size={15} />
          </span>
          <div>
            <h4>Institutional Activity</h4>
            <small>
              {`${activity.score === null ? "—" : signed(activity.score)} · ${activity.biasLabel} · Coverage ${activity.coverage}/2`}
            </small>
          </div>
        </div>
        <div className="institutional-activity-actions">
          <span
            className="macro-signal-chip"
            data-tone={toneKey(activity.score)}
          >
            {activity.biasLabel}
          </span>
          {!isPrivateWeb() && (
            <Button
              aria-label="COT aktualisieren"
              disabled={syncing || unavailable}
              onClick={onSync}
              size="sm"
            >
              <RefreshCw size={13} className={syncing ? "spin" : undefined} />
              {syncing ? "COT wird geladen …" : "COT aktualisieren"}
            </Button>
          )}
        </div>
      </header>
      {error ? (
        <p className="institutional-activity-error">
          COT-Daten konnten nicht geladen werden.
        </p>
      ) : (
        <div className="institutional-activity-rows">
          <div
            className="institutional-activity-row"
            data-tone={toneKey(activity.latestChangeSignal)}
          >
            <strong>Latest Buys/Sells</strong>
            <span
              className="macro-signal-chip"
              data-tone={toneKey(activity.latestChangeSignal)}
            >
              {signalLabel(activity.latestChangeSignal)}
            </span>
            <span>
              {contract
                ? `${reportFamilyLabel(contract.reportFamily)} · ${contract.traderGroup}`
                : "—"}
            </span>
            <span>Long Δ {signedInteger(contract?.longChange)}</span>
            <span>Short Δ {signedInteger(contract?.shortChange)}</span>
            <span>
              Long-Anteil Δ{" "}
              {signedPercentagePoints(contract?.weeklyLongShareChange)}
            </span>
            <span>{contract?.reportDate ?? "—"}</span>
          </div>
          <div
            className="institutional-activity-row"
            data-tone={toneKey(activity.pipelineSignal)}
          >
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
            <span>{assessment?.scoringVersion ?? "—"}</span>
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

function IndicatorRow({
  indicator,
  usdSource,
}: {
  indicator: FundamentalIndicatorView;
  usdSource?: FundamentalIndicatorView;
}) {
  const displayLabel =
    indicator.key === "unemployment_claims"
      ? indicator.label
      : indicator.sourceLabel || indicator.label;
  const releaseOrReason = indicator.releasedAt
    ? `${dateTime(indicator.releasedAt)}${indicator.frequency ? ` · ${indicator.frequency}` : ""}${indicator.pendingNewerReleaseAt ? ` · neuer Release wartet seit ${dateTime(indicator.pendingNewerReleaseAt)}` : ""}${indicator.reasonCodes.length ? ` · ${reasonLabel(indicator.reasonCodes[0])}` : ""}`
    : reasonLabel(indicator.reasonCodes[0]);
  const indicatorTone =
    indicator.status === "scored" || indicator.status === "neutral"
      ? toneKey(indicator.score)
      : "unavailable";
  return (
    <div className="macro-pipeline-row" data-tone={indicatorTone}>
      <strong
        title={`${displayLabel} · Heatmap-Feld: ${indicator.label}${usdSource ? ` · US-Release, USD-Signal ${isAvailableIndicator(usdSource) ? signed(usdSource.score) : "nicht verfügbar"}; umgekehrter Effekt auf das Metall` : ""}`}
      >
        <i aria-hidden="true" />
        {displayLabel}
      </strong>
      <span className="macro-signal-chip" data-tone={indicatorTone}>
        {statusLabel(indicator)}
      </span>
      <span className="macro-pipeline-number" data-label="Actual">
        {indicator.actualText ?? "—"}
      </span>
      <span className="macro-pipeline-number" data-label="Forecast">
        {indicator.forecastText ?? "—"}
      </span>
      <span className="macro-pipeline-number" data-label="Previous">
        {indicator.previousText ?? "—"}
      </span>
      <span
        className="macro-pipeline-surprise"
        data-label="Surprise"
        data-tone={indicatorTone}
      >
        {indicator.surpriseText ?? "—"}
      </span>
      <span
        className="macro-pipeline-release"
        title={indicator.sourceLabel || undefined}
      >
        {releaseOrReason || "—"}
      </span>
    </div>
  );
}

function FundamentalScoreGauge({
  availableIndicators,
  bias,
  currency,
  scoreLabel = "Fundamentals Score",
  score,
  totalIndicators,
}: {
  availableIndicators: number;
  bias: FundamentalCurrencyView["fundamentalsBias"];
  currency: string;
  scoreLabel?: string;
  score: number;
  totalIndicators: number;
}) {
  const range = Math.max(totalIndicators, 1);
  const hasScore = availableIndicators > 0;
  const clampedScore = Math.max(-range, Math.min(range, score));
  const position = hasScore ? (clampedScore / range + 1) / 2 : 0.5;
  const marker = gaugePoint(position, 96);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const valueText = hasScore
    ? `${signed(score)}, ${bias}; ${availableIndicators} von ${totalIndicators} Indikatoren bewertet`
    : `Nicht verfügbar; 0 von ${totalIndicators} Indikatoren bewertet`;

  return (
    <div
      aria-label={`${scoreLabel} ${currency}`}
      aria-valuemax={range}
      aria-valuemin={-range}
      aria-valuenow={hasScore ? score : undefined}
      aria-valuetext={valueText}
      className="macro-score-gauge"
      data-tone={hasScore ? toneKey(score) : "unavailable"}
      role="meter"
    >
      <div className="macro-score-gauge-visual">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 240 126">
          <defs>
            <linearGradient
              id="macro-fundamental-gauge-gradient"
              x1="0%"
              x2="100%"
              y1="0%"
              y2="0%"
            >
              <stop offset="0%" stopColor="var(--negative)" />
              <stop offset="48%" stopColor="var(--warning)" />
              <stop offset="52%" stopColor="var(--warning)" />
              <stop offset="100%" stopColor="var(--positive)" />
            </linearGradient>
          </defs>
          <path
            className="macro-score-gauge-track"
            d="M 24 112 A 96 96 0 0 1 216 112"
            pathLength="100"
          />
          <path
            className="macro-score-gauge-scale"
            d="M 24 112 A 96 96 0 0 1 216 112"
            pathLength="100"
          />
          {ticks.map((tick) => {
            const inner = gaugePoint(tick, 86);
            const outer = gaugePoint(tick, 103);
            return (
              <line
                className="macro-score-gauge-tick"
                key={tick}
                x1={inner.x}
                x2={outer.x}
                y1={inner.y}
                y2={outer.y}
              />
            );
          })}
          {hasScore && (
            <>
              <circle
                className="macro-score-gauge-marker-halo"
                cx={marker.x}
                cy={marker.y}
                r="9"
              />
              <circle
                className="macro-score-gauge-marker"
                cx={marker.x}
                cy={marker.y}
                r="5"
              />
            </>
          )}
        </svg>
        <div className="macro-score-gauge-value">
          <small>
            {scoreLabel === "USD-Einfluss Score"
              ? "USD-Einfluss"
              : "Gesamtscore"}
          </small>
          <strong>{hasScore ? signed(score) : "—"}</strong>
          <span>{hasScore ? bias : "Nicht verfügbar"}</span>
        </div>
      </div>
      <div className="macro-score-gauge-labels" aria-hidden="true">
        <span>
          <strong>−{range}</strong>
          <small>Bearish</small>
        </span>
        <span>
          <strong>0</strong>
          <small>Neutral</small>
        </span>
        <span>
          <strong>+{range}</strong>
          <small>Bullish</small>
        </span>
      </div>
    </div>
  );
}

function FundamentalDriverRow({
  factor,
  indicators,
  label,
  score,
}: {
  factor: FundamentalIndicatorView["factor"];
  indicators: FundamentalIndicatorView[];
  label: string;
  score: number;
}) {
  const factorIndicators = indicators.filter(
    (indicator) => indicator.factor === factor,
  );
  const available = availableIndicatorCount(factorIndicators);
  const total = factorIndicators.length;
  const hasScore = available > 0;
  const strength = Math.min(Math.abs(score) / Math.max(total, 1), 1) * 50;
  const direction = hasScore ? toneKey(score) : "unavailable";
  const valueText = hasScore
    ? `${signed(score)} von ${total}; ${available} Signale bewertet`
    : `Nicht verfügbar; 0 von ${total} Signalen bewertet`;

  return (
    <div className="macro-score-driver" data-tone={direction}>
      <div className="macro-score-driver-heading">
        <dt>
          <strong>{label}</strong>
          <small>
            {available}/{total} Signale
          </small>
        </dt>
        <dd>
          <strong>{hasScore ? signed(score) : "—"}</strong>
          <small>{hasScore ? biasForScore(score) : "Nicht verfügbar"}</small>
        </dd>
      </div>
      <div
        aria-label={`${label} Score`}
        aria-valuemax={Math.max(total, 1)}
        aria-valuemin={-Math.max(total, 1)}
        aria-valuenow={hasScore ? score : undefined}
        aria-valuetext={valueText}
        className="macro-score-driver-meter"
        data-direction={direction}
        role="meter"
      >
        <span aria-hidden="true" />
        {hasScore && score !== 0 && (
          <i aria-hidden="true" style={{ width: `${strength}%` }} />
        )}
        {hasScore && score === 0 && (
          <i aria-hidden="true" className="is-neutral" />
        )}
      </div>
    </div>
  );
}

function availableIndicatorCount(indicators: FundamentalIndicatorView[]) {
  return indicators.filter(isAvailableIndicator).length;
}

function gaugePoint(position: number, radius: number) {
  const angle = Math.PI * (1 - position);
  return {
    x: 120 + Math.cos(angle) * radius,
    y: 112 - Math.sin(angle) * radius,
  };
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
    industrial_production: "Industrial Production",
    trade_balance: "Trade Balance",
    cpi_yoy: "CPI YoY",
    ppi_yoy: "PPI YoY",
    pce_yoy: "PCE YoY",
    interest_rates: "Interest Rates",
    nfp: "NFP",
    unemployment_rate: "Unemployment Rate",
    unemployment_claims: "Unemployment Claims",
    adp: "ADP",
    jolts: "Labor Demand",
    wage_growth: "Wage Growth",
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

function signedPercentagePoints(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const formatted = (value * 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value > 0 ? "+" : ""}${formatted} PP`;
}

function reportFamilyLabel(reportFamily: CotContractView["reportFamily"]) {
  if (reportFamily === "legacy") return "Legacy Futures Only";
  if (reportFamily === "tff") return "Traders in Financial Futures";
  return "Disaggregated Futures Only";
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
    usd_indicator_unavailable: "US-Indikator nicht verfügbar",
    mapping_review_required: "EODHD-Zuordnung muss geprüft werden",
    stale_release: "Release ist älter als das Frischefenster",
  };
  return reason ? (labels[reason] ?? reason.replace(/_/g, " ")) : "";
}
