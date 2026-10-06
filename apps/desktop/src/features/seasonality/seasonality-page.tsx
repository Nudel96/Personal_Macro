import { Sparkles as PageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import {
  CalendarDays,
  Check,
  ChevronDown,
  DatabaseZap,
  Info,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  BaseChart,
  axisLabel,
  axisLine,
  splitLine,
  tooltip,
} from "../../charts/base-chart";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { ErrorState, PageLoading } from "../../components/ui/loading";
import { PageHeader } from "../../components/ui/page-header";
import { DataStatusStrip } from "../../components/ui/data-status-strip";
import { dateTime, number, percent } from "../../lib/utils";
import { api } from "../../services/commands";
import { isPrivateWeb } from "../../services/runtime-mode";
import { SeasonalityOpportunities } from "./seasonality-opportunities";
import { SeasonalityInsightChart } from "./seasonality-insight-chart";
import {
  defaultChartSettings,
  type SeasonalityChartSettings,
} from "./seasonality-annual-chart";
export {
  annualOption,
  fullscreenChartHeight,
} from "./seasonality-annual-chart";
import { SeasonalityMarketOpportunities } from "./seasonality-market-opportunities";
import type {
  SeasonalityAnalysis,
  SeasonalityYearFilter,
  SeasonalityWindowMetric,
} from "../../types/domain";

const defaultFilter: SeasonalityYearFilter = {
  endingDigits: [],
  includeYears: [],
  excludeYears: [],
};

export function SeasonalityPage() {
  const privateWeb = isPrivateWeb();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [yearFilter, setYearFilter] =
    useState<SeasonalityYearFilter>(defaultFilter);
  const [referenceDate, setReferenceDate] = useState(currentMonthDay());
  const [windowStart, setWindowStart] = useState("");
  const [windowDays, setWindowDays] = useState(20);
  const [chartSettings, setChartSettings] =
    useState<SeasonalityChartSettings>(defaultChartSettings);
  const dashboard = useQuery({
    queryKey: ["seasonality"],
    queryFn: api.seasonality,
    refetchInterval: privateWeb ? false : 30_000,
    ...(privateWeb
      ? { refetchOnWindowFocus: false, refetchOnReconnect: false }
      : {}),
  });
  const refresh = useMutation({
    mutationFn: api.refreshSeasonality,
    onSuccess: async (result) => {
      queryClient.setQueryData(["seasonality"], result);
      await queryClient.invalidateQueries({ queryKey: ["seasonality"] });
      toast.success("EODHD-Seasonality wurde aktualisiert.");
    },
    onError: (error: { message?: string }) =>
      toast.error(
        error.message ?? "Die Seasonality konnte nicht aktualisiert werden.",
      ),
  });
  const visibleAssets = (dashboard.data?.assets ?? []).filter(
    (item) =>
      (category === "Alle" || item.category === category) &&
      `${item.symbol} ${item.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedSymbol = visibleAssets.some((item) => item.symbol === selected)
    ? selected
    : visibleAssets[0]?.symbol;
  const analysisInput = useMemo(
    () =>
      selectedSymbol
        ? {
            symbol: selectedSymbol,
            referenceDate,
            yearFilter,
            windowStart: windowStart || undefined,
            windowTradingDays: windowDays,
          }
        : undefined,
    [referenceDate, selectedSymbol, windowDays, windowStart, yearFilter],
  );
  const analysis = useQuery({
    queryKey: [
      "seasonality",
      "analysis",
      dashboard.data?.dataVersion,
      dashboard.data?.cloudGeneration,
      analysisInput,
    ],
    queryFn: () =>
      privateWeb
        ? api.analyzeSeasonality(
            analysisInput!,
            dashboard.data?.cloudGeneration,
          )
        : api.analyzeSeasonality(analysisInput!),
    enabled: Boolean(
      analysisInput && (!privateWeb || dashboard.data?.cloudGeneration),
    ),
    ...(privateWeb
      ? { refetchOnWindowFocus: false, refetchOnReconnect: false }
      : {}),
    retry: false,
  });
  if (dashboard.isLoading)
    return (
      <div className="page seasonality-page">
        <PageLoading />
      </div>
    );
  if (dashboard.isError || !dashboard.data)
    return (
      <div className="page seasonality-page">
        <ErrorState message="Die Seasonality-Daten konnten nicht geladen werden." />
      </div>
    );
  const categories = [
    "Alle",
    ...[...new Set(dashboard.data.assets.map((item) => item.category))].sort(),
  ];
  const selectedSummary = dashboard.data.assets.find(
    (item) => item.symbol === selectedSymbol,
  );
  const syncProgress = dashboard.data.collectionTotal
    ? dashboard.data.collectionCompleted / dashboard.data.collectionTotal
    : 0;
  return (
    <div className="page seasonality-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Marktkontext"
        title="Seasonality Explorer"
        description={
          privateWeb
            ? "Historische Marktphasen aus übernommenen EODHD-Tagesreihen – mit transparenter Kohorte, klarer Evidenz und frei wählbaren Analysefenstern."
            : "Historische Marktphasen aus lokal gespeicherten EODHD-Tagesreihen – mit transparenter Kohorte, klarer Evidenz und frei wählbaren Analysefenstern."
        }
        actions={
          <Badge className="primary">
            <DatabaseZap size={12} /> EODHD · {dashboard.data.assets.length}{" "}
            Profile
          </Badge>
        }
      />
      <DataStatusStrip
        status={
          privateWeb
            ? `Privater Datenstand · ${dashboard.data.assets.length} übernommene Profile`
            : `${dashboard.data.collectionCompleted} von ${dashboard.data.collectionTotal || "—"} Profilen`
        }
        quality={
          privateWeb
            ? "EODHD-Tagesreihen aus dem übernommenen Snapshot"
            : dashboard.data.collectionError
              ? "Synchronisierung prüfen"
              : dashboard.data.collectionStatus === "running"
                ? "EODHD-Synchronisierung läuft"
                : "Provider-native D1-Daten"
        }
        detail={
          privateWeb
            ? `${dashboard.data.cloudImportedAt ? `Übernommen am ${dateTime(dashboard.data.cloudImportedAt)}` : "Übernahmezeit nicht verfügbar"} · Keine automatische Cloud-Aktualisierung.`
            : dashboard.data.lastSyncedAt
              ? `Zuletzt aktualisiert ${new Date(dashboard.data.lastSyncedAt).toLocaleString("de-DE")}`
              : "Historische Profile werden lokal aufgebaut"
        }
        action={
          !privateWeb && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw
                size={14}
                className={refresh.isPending ? "spin" : undefined}
              />
              {refresh.isPending ? "Aktualisiere …" : "Jetzt aktualisieren"}
            </Button>
          )
        }
      />
      {!privateWeb && (
        <section
          className="seasonality-sync-overview"
          aria-label="EODHD-Synchronisationsfortschritt"
        >
          <div>
            <span>EODHD-Datenbestand</span>
            <strong>{Math.round(syncProgress * 100)} % synchronisiert</strong>
          </div>
          <progress
            value={dashboard.data.collectionCompleted}
            max={Math.max(1, dashboard.data.collectionTotal)}
          >
            {Math.round(syncProgress * 100)} %
          </progress>
          <p>
            Adjusted Close wird genutzt, wenn EODHD ihn liefert. Fehlende oder
            zu kurze Historien bleiben sichtbar explorativ und werden nicht als
            neutral gewertet.
          </p>
        </section>
      )}
      {!privateWeb && dashboard.data.collectionError && (
        <div className="notice danger" role="alert">
          <strong>EODHD-Synchronisierung:</strong>{" "}
          {dashboard.data.collectionError}
        </div>
      )}
      <SeasonalityOpportunities
        dataVersion={dashboard.data.dataVersion}
        generation={dashboard.data.cloudGeneration}
      />
      <div className="seasonality-workspace">
        <Card className="seasonality-market-panel">
          <CardHeader
            title="Märkte"
            subtitle="Asset wählen, dann Evidenz vertiefen"
          />
          <CardContent>
            <label className="input-with-icon seasonality-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Symbol oder Markt suchen"
                aria-label="Seasonality-Asset suchen"
              />
            </label>
            <div className="seasonality-category-tabs" aria-label="Assetklasse">
              {categories.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={category === value ? "active" : ""}
                  onClick={() => setCategory(value)}
                  aria-pressed={category === value}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="seasonality-result-count" aria-live="polite">
              {visibleAssets.length} passende Profile
            </div>
            <div className="seasonality-asset-scroll">
              {visibleAssets.map((item) => {
                return (
                  <button
                    type="button"
                    key={item.symbol}
                    className={`seasonality-asset-row ${selectedSymbol === item.symbol ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(item.symbol);
                      setWindowStart("");
                    }}
                    aria-pressed={selectedSymbol === item.symbol}
                  >
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.description ?? item.category}</small>
                    </span>
                    <Badge
                      className={
                        item.qualityStatus === "available"
                          ? "positive"
                          : "warning"
                      }
                    >
                      {item.completeYears} J.
                    </Badge>
                  </button>
                );
              })}
              {!visibleAssets.length && (
                <EmptyState
                  icon={Search}
                  title="Kein passendes Asset"
                  description={
                    privateWeb
                      ? "Passe Suche oder Assetklasse an. Hier sind ausschließlich die im Datenstand übernommenen Märkte verfügbar."
                      : "Passe Suche oder Assetklasse an. Noch nicht synchronisierte Märkte erscheinen automatisch."
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>
        <main className="seasonality-analysis-panel">
          {analysis.isLoading ? (
            <Card>
              <CardContent>
                <PageLoading />
              </CardContent>
            </Card>
          ) : analysis.data ? (
            <AnalysisDetail
              analysis={analysis.data}
              chartSettings={chartSettings}
              setChartSettings={setChartSettings}
              yearFilter={yearFilter}
              setYearFilter={setYearFilter}
              referenceDate={referenceDate}
              setReferenceDate={setReferenceDate}
              windowStart={windowStart}
              setWindowStart={setWindowStart}
              windowDays={windowDays}
              setWindowDays={setWindowDays}
            />
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Sparkles}
                  title={
                    privateWeb && selectedSummary
                      ? "Analyse nicht verfügbar"
                      : selectedSummary
                        ? "Profil wird vorbereitet"
                        : "Asset auswählen"
                  }
                  description={
                    privateWeb
                      ? dashboard.data.cloudGeneration
                        ? analysis.error
                          ? "Die Analyse für diesen Datenstand konnte nicht geladen werden. Lade die Seite neu, um den übernommenen Stand erneut zu prüfen."
                          : "Wähle links einen übernommenen Markt."
                        : "Die Versionskennung des übernommenen Datenstands fehlt. Bitte lade die Seite neu."
                      : analysis.error
                        ? "Für dieses Asset ist noch keine nutzbare EODHD-D1-Historie gespeichert."
                        : "Wähle links einen Markt oder starte die EODHD-Aktualisierung."
                  }
                />
              </CardContent>
            </Card>
          )}
        </main>
      </div>
      <SeasonalityMarketOpportunities
        dataVersion={dashboard.data.dataVersion}
        generation={dashboard.data.cloudGeneration}
        profileVersion={dashboard.data.assets
          .map((item) => `${item.symbol}:${item.calculatedAt}`)
          .join("|")}
        hasProfiles={dashboard.data.assets.length > 0}
      />
    </div>
  );
}

function AnalysisDetail({
  analysis,
  chartSettings,
  setChartSettings,
  yearFilter,
  setYearFilter,
  referenceDate,
  setReferenceDate,
  windowStart,
  setWindowStart,
  windowDays,
  setWindowDays,
}: {
  analysis: SeasonalityAnalysis;
  chartSettings: SeasonalityChartSettings;
  setChartSettings: (settings: SeasonalityChartSettings) => void;
  yearFilter: SeasonalityYearFilter;
  setYearFilter: (value: SeasonalityYearFilter) => void;
  referenceDate: string;
  setReferenceDate: (value: string) => void;
  windowStart: string;
  setWindowStart: (value: string) => void;
  windowDays: number;
  setWindowDays: (value: number) => void;
}) {
  const window = analysis.selectedWindow;
  const referenceDay = monthDayToDay(analysis.referenceDate);
  const phase = phaseAtDay(analysis, referenceDay);
  const nextPhase = nextPhaseAfter(analysis, referenceDay);
  return (
    <>
      <Card className="seasonality-context-card">
        <CardHeader
          title={analysis.symbol}
          subtitle={analysis.description ?? analysis.category}
          action={
            <Badge
              className={
                analysis.qualityStatus === "available" ? "positive" : "warning"
              }
            >
              {analysis.qualityStatus === "available"
                ? "Belastbare Kohorte"
                : "Explorative Kohorte"}
            </Badge>
          }
        />
        <CardContent>
          <div className="seasonality-context-meta">
            <span>{analysis.selectedYears.length} ausgewählte Jahre</span>
            <span>
              {analysis.historyStart ?? "—"} bis {analysis.historyEnd ?? "—"}
            </span>
            <span>{analysis.dataSource}</span>
          </div>
          <SeasonalityControls
            yearFilter={yearFilter}
            referenceDate={referenceDate}
            windowStart={windowStart}
            windowDays={windowDays}
            selectedYears={analysis.selectedYears}
            referenceDatePlaceholder={analysis.referenceDate}
            onApply={(next) => {
              setYearFilter(next.yearFilter);
              setReferenceDate(next.referenceDate);
              setWindowStart(next.windowStart);
              setWindowDays(next.windowDays);
            }}
          />
        </CardContent>
      </Card>
      <div className="seasonality-decision-grid">
        <Metric
          label="Saisonale Phase"
          value={phaseLabel(phase?.phase)}
          detail={
            nextPhase
              ? `Nächster Wechsel ab ${dayLabel(nextPhase.startDay)}`
              : "Kein weiterer Wechsel in dieser Jahresansicht"
          }
          tone={phaseTone(phase?.phase)}
        />
        <Metric
          label="Aktives Fenster"
          value={fmtPct(window.medianReturn)}
          detail={`${window.startDate} · ${window.tradingDays} Handelstage · Median`}
          tone={window.direction}
        />
        <Metric
          label="Historische Treffer"
          value={fmtRate(
            window.direction === -1
              ? window.negativeRatio
              : window.positiveRatio,
          )}
          detail={`Wilson-Untergrenze ${fmtRate(window.wilsonLowerBound)}`}
        />
        <Metric
          label="Evidenz"
          value={`${window.samples} Jahre`}
          detail={`Volatilität ${fmtPct(window.volatility)} · ${analysis.qualityStatus === "available" ? "belastbar" : "explorativ"}`}
        />
      </div>
      <SeasonalityVisualDashboard
        analysis={analysis}
        chartSettings={chartSettings}
        setChartSettings={setChartSettings}
        onSelectWindow={(startDate, tradingDays) => {
          setWindowStart(startDate);
          setWindowDays(tradingDays);
        }}
      />
    </>
  );
}

interface SeasonalityControlValues {
  yearFilter: SeasonalityYearFilter;
  referenceDate: string;
  windowStart: string;
  windowDays: number;
}

interface SeasonalityControlDraft extends Omit<
  SeasonalityControlValues,
  "windowDays"
> {
  includeYearsText: string;
  excludeYearsText: string;
  windowDays: string;
}

function createSeasonalityControlDraft(
  yearFilter: SeasonalityYearFilter,
  referenceDate: string,
  windowStart: string,
  windowDays: number,
): SeasonalityControlDraft {
  return {
    yearFilter,
    includeYearsText: yearFilter.includeYears.join(", "),
    excludeYearsText: yearFilter.excludeYears.join(", "),
    referenceDate,
    windowStart,
    windowDays: String(windowDays),
  };
}

export function SeasonalityControls({
  yearFilter,
  referenceDate,
  windowStart,
  windowDays,
  selectedYears,
  referenceDatePlaceholder,
  onApply,
}: SeasonalityControlValues & {
  selectedYears: number[];
  referenceDatePlaceholder: string;
  onApply: (value: SeasonalityControlValues) => void;
}) {
  const [draft, setDraft] = useState(() =>
    createSeasonalityControlDraft(
      yearFilter,
      referenceDate,
      windowStart,
      windowDays,
    ),
  );
  useEffect(() => {
    setDraft(
      createSeasonalityControlDraft(
        yearFilter,
        referenceDate,
        windowStart,
        windowDays,
      ),
    );
  }, [referenceDate, windowDays, windowStart, yearFilter]);
  const committed = createSeasonalityControlDraft(
    yearFilter,
    referenceDate,
    windowStart,
    windowDays,
  );
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(committed);

  return (
    <details className="seasonality-controls">
      <summary>
        <SlidersHorizontal size={15} aria-hidden="true" />
        Kohorte und Analysefenster anpassen
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <form
        className="seasonality-controls-body"
        onSubmit={(event) => {
          event.preventDefault();
          const parsedWindowDays = Number(draft.windowDays);
          onApply({
            yearFilter: {
              ...draft.yearFilter,
              includeYears: parseSeasonalityYears(draft.includeYearsText),
              excludeYears: parseSeasonalityYears(draft.excludeYearsText),
            },
            referenceDate: draft.referenceDate,
            windowStart: draft.windowStart,
            windowDays: Math.max(5, Math.min(90, parsedWindowDays)),
          });
        }}
      >
        <YearFilterBuilder
          value={draft.yearFilter}
          onChange={(nextYearFilter) =>
            setDraft((current) => ({
              ...current,
              yearFilter: nextYearFilter,
            }))
          }
          includeYearsText={draft.includeYearsText}
          setIncludeYearsText={(includeYearsText) =>
            setDraft((current) => ({ ...current, includeYearsText }))
          }
          excludeYearsText={draft.excludeYearsText}
          setExcludeYearsText={(excludeYearsText) =>
            setDraft((current) => ({ ...current, excludeYearsText }))
          }
          selectedYears={selectedYears}
        />
        <div className="seasonality-window-controls">
          <label>
            Referenzdatum
            <input
              value={draft.referenceDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  referenceDate: event.target.value,
                }))
              }
              aria-label="Referenzdatum im Format Monat-Tag"
              inputMode="numeric"
              pattern="[0-1][0-9]-[0-3][0-9]"
              required
            />
            <small>Format MM-TT</small>
          </label>
          <label>
            Fensterstart
            <input
              value={draft.windowStart}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  windowStart: event.target.value,
                }))
              }
              placeholder={referenceDatePlaceholder}
              aria-label="Fensterstart im Format Monat-Tag"
              inputMode="numeric"
              pattern="[0-1][0-9]-[0-3][0-9]"
            />
            <small>Leer = Referenzdatum</small>
          </label>
          <label>
            Handelstage
            <input
              type="number"
              min={5}
              max={90}
              value={draft.windowDays}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  windowDays: event.target.value,
                }))
              }
              aria-label="Fensterlänge in Handelstagen"
              required
            />
            <small>5 bis 90 Tage</small>
          </label>
        </div>
        <div className="seasonality-controls-actions">
          <span aria-live="polite">
            {hasChanges
              ? "Änderungen sind noch nicht angewendet."
              : "Die angezeigte Analyse verwendet diese Werte."}
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!hasChanges}
          >
            <Check size={14} aria-hidden="true" />
            Änderungen übernehmen
          </Button>
        </div>
      </form>
    </details>
  );
}

function SeasonalityVisualDashboard({
  analysis,
  onSelectWindow,
  chartSettings,
  setChartSettings,
}: {
  analysis: SeasonalityAnalysis;
  onSelectWindow: (startDate: string, tradingDays: number) => void;
  chartSettings: SeasonalityChartSettings;
  setChartSettings: (settings: SeasonalityChartSettings) => void;
}) {
  const window = analysis.selectedWindow;
  const gains = window.yearReturns.filter((item) => item.returnValue > 0);
  const losses = window.yearReturns.filter((item) => item.returnValue < 0);
  const totalReturn =
    window.yearReturns.reduce(
      (value, item) => value * (1 + item.returnValue),
      1,
    ) - 1;
  return (
    <div className="seasonality-visual-dashboard">
      <div className="seasonality-hero-grid seasonality-insight-layout">
        <SeasonalityInsightChart
          analysis={analysis}
          settings={chartSettings}
          onSettingsChange={setChartSettings}
        />
        <Card className="seasonality-evidence-card">
          <CardHeader
            title="Evidenz zum Fenster"
            subtitle={`${window.startDate} · ${window.tradingDays} Handelstage`}
          />
          <CardContent>
            <div
              className={`seasonality-direction-callout ${window.direction === 1 ? "positive" : window.direction === -1 ? "negative" : "neutral"}`}
            >
              {window.direction === 1 ? (
                <TrendingUp size={19} aria-hidden="true" />
              ) : window.direction === -1 ? (
                <TrendingDown size={19} aria-hidden="true" />
              ) : (
                <Info size={19} aria-hidden="true" />
              )}
              <span>
                <small>Historische Richtung</small>
                <strong>
                  {window.direction === 1
                    ? "Bullisches Muster"
                    : window.direction === -1
                      ? "Bärisches Muster"
                      : "Keine klare Richtung"}
                </strong>
              </span>
            </div>
            <dl className="seasonality-evidence-list">
              <div>
                <dt>Medianrendite</dt>
                <dd>{fmtPct(window.medianReturn)}</dd>
              </div>
              <div>
                <dt>Trefferquote</dt>
                <dd>
                  {fmtRate(
                    window.direction === -1
                      ? window.negativeRatio
                      : window.positiveRatio,
                  )}
                </dd>
              </div>
              <div>
                <dt>Wilson-Untergrenze</dt>
                <dd>{fmtRate(window.wilsonLowerBound)}</dd>
              </div>
              <div>
                <dt>Volatilität</dt>
                <dd>{fmtPct(window.volatility)}</dd>
              </div>
              <div>
                <dt>10.–90. Perzentil</dt>
                <dd>
                  {fmtPct(window.p10)} bis {fmtPct(window.p90)}
                </dd>
              </div>
              <div>
                <dt>Stichprobe</dt>
                <dd>{window.samples} Jahre</dd>
              </div>
            </dl>
            <div className="seasonality-evidence-quality">
              <Info size={15} aria-hidden="true" />
              <p>{analysis.qualityReason}</p>
            </div>
            <div className="seasonality-source-summary">
              <span>Quelle</span>
              <strong>{analysis.dataSource}</strong>
              <small>
                Adjusted Close, sofern verfügbar · Tagesdefinition{" "}
                {analysis.nativeTimezone ?? "provider-nativ"}
              </small>
              <small>{analysis.missingDays} erkannte größere Datenlücken</small>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="seasonality-roadmap-card">
        <CardHeader
          title="Saisonaler Fahrplan"
          subtitle="Phasen sind zusätzlich beschriftet; Farbe ist nicht die einzige Richtungsinformation."
        />
        <CardContent>
          <SeasonalRoadmap analysis={analysis} />
        </CardContent>
      </Card>
      <Tabs.Root className="seasonality-evidence-tabs" defaultValue="windows">
        <Tabs.List aria-label="Seasonality-Diagnosen">
          <Tabs.Trigger value="windows">Beste Fenster</Tabs.Trigger>
          <Tabs.Trigger value="heatmap">Chancenmatrix</Tabs.Trigger>
          <Tabs.Trigger value="years">Jahresergebnisse</Tabs.Trigger>
          <Tabs.Trigger value="calendar">Zeitstruktur</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="windows" className="seasonality-tab-content">
          <div className="seasonality-window-columns">
            <WindowList
              title="Stärkste bullische Fenster"
              subtitle="konservativ nach Trefferwahrscheinlichkeit gerankt"
              values={analysis.bullishWindows}
              onSelect={(value) =>
                onSelectWindow(value.startDate, value.tradingDays)
              }
            />
            <WindowList
              title="Stärkste bärische Fenster"
              subtitle="konservativ nach Trefferwahrscheinlichkeit gerankt"
              values={analysis.bearishWindows}
              onSelect={(value) =>
                onSelectWindow(value.startDate, value.tradingDays)
              }
            />
          </div>
        </Tabs.Content>
        <Tabs.Content value="heatmap" className="seasonality-tab-content">
          <Card>
            <CardHeader
              title="Startdatum × Haltedauer"
              subtitle="Die Matrix ist explorativ. Dieselben Fenster sind im Tab ‚Beste Fenster‘ vollständig per Tastatur auswählbar."
            />
            <CardContent>
              <BaseChart
                option={opportunityHeatmapOption(analysis)}
                height={390}
                ariaLabel={`Chancenmatrix für ${analysis.symbol} nach Startdatum und Haltedauer.`}
                onEvents={{
                  click: (params) => {
                    const data = (
                      params as {
                        data?: { startDate?: string; tradingDays?: number };
                      }
                    ).data;
                    if (data?.startDate && data.tradingDays)
                      onSelectWindow(data.startDate, data.tradingDays);
                  },
                }}
              />
            </CardContent>
          </Card>
        </Tabs.Content>
        <Tabs.Content value="years" className="seasonality-tab-content">
          <div className="seasonality-diagnostics-grid">
            <Card>
              <CardHeader
                title="Richtungsverteilung"
                subtitle={`${gains.length} Gewinn- und ${losses.length} Verlustjahre`}
              />
              <CardContent>
                <BaseChart
                  option={winLossOption(window)}
                  height={220}
                  ariaLabel="Verteilung historischer Gewinn- und Verlustjahre"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader
                title="Einzeljahresrenditen"
                subtitle={`Kumuliertes Muster ${fmtPct(totalReturn)}`}
              />
              <CardContent>
                <BaseChart
                  option={patternReturnsOption(window)}
                  height={220}
                  ariaLabel="Renditen des gewählten Fensters nach Jahr"
                />
              </CardContent>
            </Card>
            <Card className="seasonality-wide-diagnostic">
              <CardHeader
                title="Kumulierte Pattern-Rendite"
                subtitle="Chronologisch über die gewählte Jahreskohorte"
              />
              <CardContent>
                <BaseChart
                  option={cumulativePatternOption(window)}
                  height={240}
                  ariaLabel="Kumulierte Rendite des historischen Musters"
                />
              </CardContent>
            </Card>
          </div>
        </Tabs.Content>
        <Tabs.Content value="calendar" className="seasonality-tab-content">
          <div className="seasonality-diagnostics-grid">
            <Card>
              <CardHeader
                title="Vorwärtsfenster"
                subtitle={`Startpunkt ${analysis.referenceDate}`}
              />
              <CardContent>
                <BaseChart
                  option={forwardOption(analysis)}
                  height={260}
                  ariaLabel="Historische Vorwärtsrenditen ab Referenzdatum"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader
                title="Monatsrenditen"
                subtitle="Mittelwert der vollständigen Jahreskohorte"
              />
              <CardContent>
                <BaseChart
                  option={periodOption(analysis)}
                  height={260}
                  ariaLabel="Durchschnittliche saisonale Rendite je Monat"
                />
              </CardContent>
            </Card>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function SeasonalRoadmap({ analysis }: { analysis: SeasonalityAnalysis }) {
  const referenceDay = monthDayToDay(analysis.referenceDate);
  const windowStart = monthDayToDay(analysis.selectedWindow.startDate);
  const windowEnd = Math.min(
    365,
    windowStart + Math.round(analysis.selectedWindow.tradingDays * 1.45),
  );
  return (
    <div className="seasonality-roadmap" aria-label="Saisonaler Jahresfahrplan">
      <div className="seasonality-roadmap-track">
        {analysis.trendSegments.map((segment) => (
          <span
            key={`${segment.startDay}-${segment.phase}`}
            className={`seasonality-roadmap-phase ${segment.phase}`}
            style={{
              left: `${((segment.startDay - 1) / 365) * 100}%`,
              width: `${((segment.endDay - segment.startDay + 1) / 365) * 100}%`,
            }}
            title={`${phaseLabel(segment.phase)}: ${dayLabel(segment.startDay)} bis ${dayLabel(segment.endDay)}`}
          />
        ))}
        <span
          className="seasonality-roadmap-window"
          style={{
            left: `${((windowStart - 1) / 365) * 100}%`,
            width: `${((windowEnd - windowStart + 1) / 365) * 100}%`,
          }}
          title="Ungefähre Fensterlage: Handelstage sind nicht identisch mit Kalendertagen"
        />
        <span
          className="seasonality-roadmap-reference"
          style={{ left: `${((referenceDay - 1) / 365) * 100}%` }}
          title={`Referenz: ${analysis.referenceDate}`}
        />
      </div>
      <div className="seasonality-roadmap-months" aria-hidden="true">
        {[1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].map((day) => (
          <span key={day} style={{ left: `${((day - 1) / 365) * 100}%` }}>
            {monthLabel(day)}
          </span>
        ))}
      </div>
      <div className="seasonality-roadmap-legend">
        <span>
          <i className="rising" />
          Aufbau
        </span>
        <span>
          <i className="falling" />
          Abbau
        </span>
        <span>
          <i className="neutral" />
          Übergang
        </span>
        <span>
          <b />
          Fensterlage (ca.)
        </span>
      </div>
      <ul
        className="seasonality-phase-list"
        aria-label="Saisonale Phasen als Text"
      >
        {analysis.trendSegments.map((segment) => (
          <li key={`text-${segment.startDay}-${segment.phase}`}>
            <span className={segment.phase}>{phaseLabel(segment.phase)}</span>
            <strong>
              {dayLabel(segment.startDay)}–{dayLabel(segment.endDay)}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function YearFilterBuilder({
  value,
  onChange,
  includeYearsText,
  setIncludeYearsText,
  excludeYearsText,
  setExcludeYearsText,
  selectedYears,
}: {
  value: SeasonalityYearFilter;
  onChange: (value: SeasonalityYearFilter) => void;
  includeYearsText: string;
  setIncludeYearsText: (value: string) => void;
  excludeYearsText: string;
  setExcludeYearsText: (value: string) => void;
  selectedYears: number[];
}) {
  const update = (patch: Partial<SeasonalityYearFilter>) =>
    onChange({ ...value, ...patch });
  const toggleDigit = (digit: number) =>
    update({
      endingDigits: value.endingDigits.includes(digit)
        ? value.endingDigits.filter((item) => item !== digit)
        : [...value.endingDigits, digit],
    });
  return (
    <section
      className="seasonality-cohort-builder"
      aria-labelledby="seasonality-cohort-title"
    >
      <header>
        <h3 id="seasonality-cohort-title">Jahreskohorte</h3>
        <p>
          Aktive Regeln wirken als Schnittmenge. Mehrere Endziffern bilden
          weiterhin genau eine gemeinsame Durchschnittskurve.
        </p>
      </header>
      <div className="seasonality-filter-grid">
        <label>
          Von
          <input
            type="number"
            value={value.startYear ?? ""}
            onChange={(event) =>
              update({ startYear: optionalNumber(event.target.value) })
            }
          />
        </label>
        <label>
          Bis
          <input
            type="number"
            value={value.endYear ?? ""}
            onChange={(event) =>
              update({ endYear: optionalNumber(event.target.value) })
            }
          />
        </label>
        <label>
          Zyklus
          <input
            type="number"
            min={2}
            value={value.cycleYears ?? ""}
            onChange={(event) =>
              update({ cycleYears: optionalNumber(event.target.value) })
            }
          />
        </label>
        <label>
          Ankerjahr
          <input
            type="number"
            value={value.cycleAnchorYear ?? ""}
            onChange={(event) =>
              update({ cycleAnchorYear: optionalNumber(event.target.value) })
            }
          />
        </label>
        <label>
          Nur diese Jahre
          <input
            value={includeYearsText}
            onChange={(event) => setIncludeYearsText(event.target.value)}
            placeholder="z. B. 2016, 2020"
          />
        </label>
        <label>
          Diese Jahre ausnehmen
          <input
            value={excludeYearsText}
            onChange={(event) => setExcludeYearsText(event.target.value)}
            placeholder="z. B. 2020"
          />
        </label>
      </div>
      <div className="seasonality-digit-filter">
        <span>Jahresendziffer:</span>
        {Array.from({ length: 10 }, (_, digit) => (
          <button
            type="button"
            key={digit}
            className={value.endingDigits.includes(digit) ? "active" : ""}
            onClick={() => toggleDigit(digit)}
            aria-pressed={value.endingDigits.includes(digit)}
            aria-label={`Jahre mit Endziffer ${digit} ${value.endingDigits.includes(digit) ? "entfernen" : "hinzufügen"}`}
          >
            {digit}
          </button>
        ))}
        <span className="block-muted">
          {selectedYears.length} Jahre aktuell angewendet
        </span>
      </div>
    </section>
  );
}

function WindowList({
  title,
  subtitle,
  values,
  onSelect,
}: {
  title: string;
  subtitle: string;
  values: SeasonalityWindowMetric[];
  onSelect: (value: SeasonalityWindowMetric) => void;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardContent>
        {values.length ? (
          <div className="seasonality-window-list">
            {values.map((value) => (
              <WindowButton
                key={`${value.startDate}-${value.tradingDays}`}
                window={value}
                onClick={() => onSelect(value)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Keine belastbaren Fenster"
            description="Mindestens fünf vollständige Beobachtungen sind für ein Ranking nötig."
          />
        )}
      </CardContent>
    </Card>
  );
}
function WindowButton({
  window,
  onClick,
}: {
  window: SeasonalityWindowMetric;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`seasonality-window ${window.direction === 1 ? "positive" : window.direction === -1 ? "negative" : "neutral"}`}
      onClick={onClick}
      aria-label={`${window.direction === 1 ? "Bullisches" : window.direction === -1 ? "Bärisches" : "Neutrales"} Fenster ab ${window.startDate} für ${window.tradingDays} Handelstage auswählen`}
    >
      <strong>
        {window.startDate} · {window.tradingDays}T
      </strong>
      <span>
        {fmtPct(window.medianReturn)} Median ·{" "}
        {window.direction === 1
          ? fmtRate(window.positiveRatio)
          : fmtRate(window.negativeRatio)}{" "}
        Treffer
      </span>
      <small>
        {window.samples} Jahre · Wilson {fmtRate(window.wilsonLowerBound)}
      </small>
    </button>
  );
}
function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: number | null;
}) {
  return (
    <Card className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div
        className={`kpi-value ${tone === 1 ? "positive-text" : tone === -1 ? "negative-text" : ""}`}
      >
        {value}
      </div>
      <div className="kpi-meta">{detail}</div>
    </Card>
  );
}
export function opportunityHeatmapOption(
  analysis: SeasonalityAnalysis,
): EChartsOption {
  const cells = (analysis.heatmap ?? []).filter(
    (cell) => cell.score != null && cell.direction != null,
  );
  const starts = [...new Set(cells.map((cell) => cell.startDate))];
  const durations = Array.from({ length: 86 }, (_, index) => index + 5);
  const data = cells.map((cell) => ({
    value: [
      starts.indexOf(cell.startDate),
      durations.indexOf(cell.tradingDays),
      cell.score,
    ],
    startDate: cell.startDate,
    tradingDays: cell.tradingDays,
    medianReturn: cell.medianReturn,
    wilsonLowerBound: cell.wilsonLowerBound,
    samples: cell.samples,
  }));
  return {
    tooltip: {
      ...tooltip,
      formatter: (params: unknown) => {
        const item = params as {
          data?: {
            startDate?: string;
            tradingDays?: number;
            medianReturn?: number | null;
            wilsonLowerBound?: number | null;
            samples?: number;
          };
        };
        const value = item.data;
        return value
          ? `${value.startDate} · ${value.tradingDays}T<br/>Median ${fmtPct(value.medianReturn)}<br/>Wilson ${fmtRate(value.wilsonLowerBound)} · ${value.samples} Jahre`
          : "Kein Fenster";
      },
    },
    grid: { left: 48, right: 20, top: 10, bottom: 46 },
    xAxis: {
      type: "category",
      data: starts,
      axisLabel: {
        ...axisLabel,
        interval: Math.max(0, Math.floor(starts.length / 8)),
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "category",
      data: durations.map(String),
      axisLabel: { ...axisLabel, interval: 9 },
      axisLine,
      axisTick: { show: false },
    },
    visualMap: {
      min: -2,
      max: 2,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: "#71829a", fontSize: 9 },
      inRange: { color: ["#d45f68", "#263448", "#3ec7b7"] },
    },
    series: [
      {
        type: "heatmap",
        data,
        progressive: 0,
        itemStyle: { borderColor: "rgba(7,16,30,.5)", borderWidth: 1 },
      },
    ],
  };
}
function winLossOption(window: SeasonalityWindowMetric): EChartsOption {
  const wins = window.yearReturns.filter((item) => item.returnValue > 0).length;
  const losses = window.yearReturns.filter(
    (item) => item.returnValue < 0,
  ).length;
  const flat = Math.max(0, window.samples - wins - losses);
  return {
    tooltip: { ...tooltip, formatter: "{b}: {c} Jahre" },
    series: [
      {
        type: "pie",
        radius: ["52%", "76%"],
        label: { show: false },
        data: [
          { value: wins, name: "Gewinne", itemStyle: { color: "#50bfd2" } },
          { value: losses, name: "Verluste", itemStyle: { color: "#ff5e6c" } },
          { value: flat, name: "Neutral", itemStyle: { color: "#59687a" } },
        ],
      },
    ],
    graphic: {
      type: "text",
      left: "center",
      top: "42%",
      style: {
        text: `${wins}/${window.samples}`,
        fill: "#e8edf7",
        fontSize: 18,
        fontWeight: 700,
      },
    },
  };
}
function cumulativePatternOption(
  window: SeasonalityWindowMetric,
): EChartsOption {
  let cumulative = 100;
  const values = [...window.yearReturns]
    .sort((left, right) => left.year - right.year)
    .map((item) => {
      cumulative *= 1 + item.returnValue;
      return { year: item.year, value: cumulative };
    });
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 42, right: 16, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: values.map((item) => String(item.year)),
      axisLabel,
      axisLine,
    },
    yAxis: { type: "value", axisLabel, splitLine },
    series: [
      {
        type: "line",
        data: values.map((item) => item.value),
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#52c5ff", width: 2 },
        areaStyle: { color: "rgba(82,197,255,.12)" },
      },
    ],
  };
}
function patternReturnsOption(window: SeasonalityWindowMetric): EChartsOption {
  const values = [...window.yearReturns].sort(
    (left, right) => left.year - right.year,
  );
  return {
    tooltip: { ...tooltip, trigger: "axis" },
    grid: { left: 42, right: 16, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: values.map((item) => String(item.year)),
      axisLabel,
      axisLine,
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${number.format(value * 100)}%`,
      },
      splitLine,
    },
    series: [
      {
        type: "bar",
        data: values.map((item) => ({
          value: item.returnValue,
          itemStyle: { color: item.returnValue >= 0 ? "#50bfd2" : "#ff5e6c" },
        })),
      },
    ],
  };
}
function forwardOption(analysis: SeasonalityAnalysis): EChartsOption {
  return {
    tooltip: { ...tooltip },
    grid: { left: 42, right: 12, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: analysis.forwardReturns.map((item) => item.label),
      axisLabel,
      axisLine,
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${(value * 100).toFixed(1)}%`,
      },
      splitLine,
    },
    series: [
      {
        type: "bar",
        data: analysis.forwardReturns.map((item) => ({
          value: item.medianReturn,
          itemStyle: {
            color:
              item.medianReturn == null
                ? "#59687a"
                : item.medianReturn >= 0
                  ? "#37d481"
                  : "#ff5e6c",
          },
        })),
      },
    ],
  };
}
function periodOption(analysis: SeasonalityAnalysis): EChartsOption {
  return {
    tooltip: { ...tooltip },
    grid: { left: 42, right: 12, top: 18, bottom: 30 },
    xAxis: {
      type: "category",
      data: analysis.months.map((item) => item.period),
      axisLabel,
      axisLine,
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
      },
      splitLine,
    },
    series: [
      {
        type: "bar",
        data: analysis.months.map((item) => ({
          value: item.averageReturn,
          itemStyle: {
            color:
              item.averageReturn == null
                ? "#59687a"
                : item.averageReturn >= 0
                  ? "#37d481"
                  : "#ff5e6c",
          },
        })),
      },
    ],
  };
}
function dayLabel(day: number) {
  const date = new Date(2025, 0, day);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function monthLabel(day: number) {
  const date = new Date(2025, 0, day);
  return new Intl.DateTimeFormat("de-DE", { month: "short" }).format(date);
}
function phaseAtDay(analysis: SeasonalityAnalysis, day: number) {
  return analysis.trendSegments.find(
    (segment) => day >= segment.startDay && day <= segment.endDay,
  );
}
function nextPhaseAfter(analysis: SeasonalityAnalysis, day: number) {
  return (
    analysis.trendSegments.find((segment) => segment.startDay > day) ??
    analysis.trendSegments[0]
  );
}
function phaseLabel(phase?: "rising" | "falling" | "neutral") {
  if (phase === "rising") return "Aufbauend";
  if (phase === "falling") return "Abbauend";
  return "Übergang";
}
function phaseTone(phase?: "rising" | "falling" | "neutral") {
  return phase === "rising" ? 1 : phase === "falling" ? -1 : undefined;
}
function monthDayToDay(value: string) {
  const [month, day] = value.split("-").map(Number);
  return Math.max(
    1,
    Math.min(
      365,
      Math.round(
        (Date.UTC(2025, month - 1, day) - Date.UTC(2025, 0, 1)) / 86_400_000,
      ) + 1,
    ),
  );
}
function currentMonthDay() {
  const date = new Date();
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function optionalNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isInteger(parsed) ? parsed : undefined;
}
export function parseSeasonalityYears(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(Number)
        .filter((item) => Number.isInteger(item)),
    ),
  ].sort((a, b) => a - b);
}
function fmtPct(value?: number | null) {
  return value == null
    ? "—"
    : `${value > 0 ? "+" : ""}${number.format(value * 100)} %`;
}
function fmtRate(value?: number | null) {
  return value == null ? "—" : percent.format(value);
}
