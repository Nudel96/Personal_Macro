import { Sparkles as PageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import {
  CalendarDays,
  Check,
  ChevronDown,
  DatabaseZap,
  Info,
  Maximize2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
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
import { number, percent } from "../../lib/utils";
import { api } from "../../services/commands";
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
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [yearFilter, setYearFilter] =
    useState<SeasonalityYearFilter>(defaultFilter);
  const [referenceDate, setReferenceDate] = useState(currentMonthDay());
  const [windowStart, setWindowStart] = useState("");
  const [windowDays, setWindowDays] = useState(20);
  const dashboard = useQuery({
    queryKey: ["seasonality"],
    queryFn: api.seasonality,
    refetchInterval: 30_000,
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
      analysisInput,
    ],
    queryFn: () => api.analyzeSeasonality(analysisInput!),
    enabled: Boolean(analysisInput),
    retry: false,
  });
  const screener = useQuery({
    queryKey: [
      "seasonality",
      "screener",
      dashboard.data?.dataVersion,
      dashboard.data?.assets.map(
        (item) => `${item.symbol}:${item.calculatedAt}`,
      ),
    ],
    queryFn: api.seasonalityScreener,
    enabled: (dashboard.data?.assets.length ?? 0) > 0,
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
        description="Historische Marktphasen aus lokal gespeicherten EODHD-Tagesreihen – mit transparenter Kohorte, klarer Evidenz und frei wählbaren Analysefenstern."
        actions={
          <Badge className="primary">
            <DatabaseZap size={12} /> EODHD · {dashboard.data.assets.length}{" "}
            Profile
          </Badge>
        }
      />
      <DataStatusStrip
        status={`${dashboard.data.collectionCompleted} von ${dashboard.data.collectionTotal || "—"} Profilen`}
        quality={
          dashboard.data.collectionError
            ? "Synchronisierung prüfen"
            : dashboard.data.collectionStatus === "running"
              ? "EODHD-Synchronisierung läuft"
              : "Provider-native D1-Daten"
        }
        detail={
          dashboard.data.lastSyncedAt
            ? `Zuletzt aktualisiert ${new Date(dashboard.data.lastSyncedAt).toLocaleString("de-DE")}`
            : "Historische Profile werden lokal aufgebaut"
        }
        action={
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
        }
      />
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
          Adjusted Close wird genutzt, wenn EODHD ihn liefert. Fehlende oder zu
          kurze Historien bleiben sichtbar explorativ und werden nicht als
          neutral gewertet.
        </p>
      </section>
      {dashboard.data.collectionError && (
        <div className="notice danger" role="alert">
          <strong>EODHD-Synchronisierung:</strong>{" "}
          {dashboard.data.collectionError}
        </div>
      )}
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
                  description="Passe Suche oder Assetklasse an. Noch nicht synchronisierte Märkte erscheinen automatisch."
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
                    selectedSummary
                      ? "Profil wird vorbereitet"
                      : "Asset auswählen"
                  }
                  description={
                    analysis.error
                      ? "Für dieses Asset ist noch keine nutzbare EODHD-D1-Historie gespeichert."
                      : "Wähle links einen Markt oder starte die EODHD-Aktualisierung."
                  }
                />
              </CardContent>
            </Card>
          )}
        </main>
      </div>
      <Card className="seasonality-screener-card">
        <CardHeader
          title="Chancen im Markt"
          subtitle="Wöchentlich gestaffelte Startpunkte, konservativ gerankt nach Wilson-Untergrenze, Medianrendite, Schwankung und Stichprobengröße."
        />
        <CardContent>
          {screener.isLoading ? (
            <PageLoading />
          ) : screener.isError ? (
            <EmptyState
              icon={DatabaseZap}
              title="Screener wird aufgebaut"
              description="Sobald EODHD-Profile vorliegen, erscheinen hier die stärksten historischen Fenster."
            />
          ) : (
            <Screener
              rows={screener.data ?? []}
              onSelect={(symbol, window) => {
                setCategory("Alle");
                setSearch("");
                setSelected(symbol);
                setWindowStart(window.startDate);
                setWindowDays(window.tradingDays);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Screener({
  rows,
  onSelect,
}: {
  rows: Awaited<ReturnType<typeof api.seasonalityScreener>>;
  onSelect: (symbol: string, window: SeasonalityWindowMetric) => void;
}) {
  if (!rows.length)
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Noch keine lokalen Seasonality-Profile"
        description="Die dauerhaft lokale Historie wird nach dem App-Start automatisch aufgebaut."
      />
    );
  return (
    <div className="seasonality-screener-grid">
      {rows.slice(0, 12).map((row) => (
        <article className="seasonality-screener-item" key={row.symbol}>
          <header>
            <div>
              <strong>{row.symbol}</strong>
              <span>{row.description ?? row.category}</span>
            </div>
            <Badge
              className={
                row.qualityStatus === "available" ? "positive" : "warning"
              }
            >
              {row.completeYears} Jahre
            </Badge>
          </header>
          <div className="seasonality-screener-directions">
            {row.bullishWindow ? (
              <button
                type="button"
                className="bullish"
                onClick={() => onSelect(row.symbol, row.bullishWindow!)}
                aria-label={`${row.symbol}: bullisches Fenster ${row.bullishWindow.startDate} auswählen`}
              >
                <TrendingUp size={15} aria-hidden="true" />
                <span>
                  <small>Bullisch</small>
                  <strong>{fmtPct(row.bullishWindow.medianReturn)}</strong>
                </span>
                <em>{row.bullishWindow.startDate}</em>
              </button>
            ) : (
              <span className="seasonality-no-window">
                Kein bullisches Fenster
              </span>
            )}
            {row.bearishWindow ? (
              <button
                type="button"
                className="bearish"
                onClick={() => onSelect(row.symbol, row.bearishWindow!)}
                aria-label={`${row.symbol}: bärisches Fenster ${row.bearishWindow.startDate} auswählen`}
              >
                <TrendingDown size={15} aria-hidden="true" />
                <span>
                  <small>Bärisch</small>
                  <strong>{fmtPct(row.bearishWindow.medianReturn)}</strong>
                </span>
                <em>{row.bearishWindow.startDate}</em>
              </button>
            ) : (
              <span className="seasonality-no-window">
                Kein bärisches Fenster
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function AnalysisDetail({
  analysis,
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
  yearFilter: SeasonalityYearFilter;
  setYearFilter: (value: SeasonalityYearFilter) => void;
  referenceDate: string;
  setReferenceDate: (value: string) => void;
  windowStart: string;
  setWindowStart: (value: string) => void;
  windowDays: number;
  setWindowDays: (value: number) => void;
}) {
  const [chartFullscreen, setChartFullscreen] = useState(false);
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
        onOpenFullscreen={() => setChartFullscreen(true)}
        onSelectWindow={(startDate, tradingDays) => {
          setWindowStart(startDate);
          setWindowDays(tradingDays);
        }}
      />
      <SeasonalityChartFullscreen
        analysis={analysis}
        open={chartFullscreen}
        onOpenChange={setChartFullscreen}
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
  onOpenFullscreen,
}: {
  analysis: SeasonalityAnalysis;
  onSelectWindow: (startDate: string, tradingDays: number) => void;
  onOpenFullscreen: () => void;
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
      <div className="seasonality-hero-grid">
        <Card className="seasonality-annual-card">
          <CardHeader
            title="Saisonaler Jahresverlauf"
            subtitle={`${analysis.selectedYears.length} Jahre als eine Index-100-Kurve · aktives Fenster ${window.startDate} / ${window.tradingDays} Handelstage`}
            action={
              <Button
                size="icon"
                variant="ghost"
                onClick={onOpenFullscreen}
                aria-label="Seasonality-Chart im Vollbild öffnen"
                title="Vollbild"
              >
                <Maximize2 size={16} />
              </Button>
            }
          />
          <CardContent>
            <BaseChart
              option={annualOption(analysis)}
              height={390}
              ariaLabel={`Saisonaler Jahresverlauf für ${analysis.symbol}. Eine Durchschnittslinie aus ${analysis.selectedYears.length} Jahren.`}
            />
            <p className="seasonality-chart-note">
              Die 15-Kalendertage-Glättung dient nur der Darstellung. Renditen,
              Trefferquoten, Rankings und Macro-Signale verwenden unveränderte
              Beobachtungen.
            </p>
          </CardContent>
        </Card>
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

function SeasonalityChartFullscreen({
  analysis,
  open,
  onOpenChange,
}: {
  analysis: SeasonalityAnalysis;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [chartHeight, setChartHeight] = useState(650);
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const resize = () =>
      setChartHeight(fullscreenChartHeight(window.innerHeight));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content seasonality-fullscreen-dialog"
          aria-describedby="seasonality-fullscreen-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                {analysis.symbol} · Jährliche Durchschnitts-Seasonality
              </Dialog.Title>
              <Dialog.Description
                id="seasonality-fullscreen-description"
                className="dialog-description"
              >
                {analysis.dataSource} · {analysis.selectedYears.length}{" "}
                ausgewählte Jahre · {analysis.selectedWindow.startDate} /{" "}
                {analysis.selectedWindow.tradingDays} Handelstage
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Vollbild schließen"
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </header>
          <div className="seasonality-fullscreen-chart">
            <BaseChart
              option={annualOption(analysis)}
              height={chartHeight}
              ariaLabel={`Saisonaler Jahresverlauf für ${analysis.symbol} im Vollbild`}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
          title="Aktives Analysefenster"
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
          Aktives Fenster
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
export function annualOption(analysis: SeasonalityAnalysis): EChartsOption {
  const values = analysis.annualCurve;
  const startDay = monthDayToDay(analysis.selectedWindow.startDate);
  const endDay = Math.min(
    365,
    startDay + Math.round(analysis.selectedWindow.tradingDays * 1.45),
  );
  return {
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (items: unknown) => {
        const item = (
          items as Array<{ axisValue?: string; data?: number | null }>
        )[0];
        const day = values.find(
          (value) => dayLabel(value.day) === item?.axisValue,
        );
        return `<strong>${item?.axisValue ?? "—"}</strong><br/>Saisonaler Durchschnitt: ${item?.data == null ? "—" : number.format(item.data)}<br/>${day?.samples ?? 0} verwendete Jahre`;
      },
    },
    grid: { left: 50, right: 20, top: 22, bottom: 36 },
    xAxis: {
      type: "category",
      data: values.map((value) => dayLabel(value.day)),
      axisLabel: {
        ...axisLabel,
        interval: 0,
        formatter: (_value: string, index: number) =>
          [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].includes(
            index + 1,
          )
            ? monthLabel(index + 1)
            : "",
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => `${number.format(value)}`,
      },
      splitLine,
    },
    series: [
      {
        name: "Durchschnitt aller gewählten Jahre",
        type: "line",
        data: values.map((value) => value.smoothedMean ?? value.mean),
        symbol: "none",
        smooth: false,
        lineStyle: { color: "#52c5ff", width: 3 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,.3)", type: "dashed" },
          label: {
            color: "#858585",
            formatter: "Index 100",
            position: "insideEndTop",
          },
          data: [{ yAxis: 100 }],
        },
        markArea: {
          silent: true,
          data: [
            ...analysis.trendSegments
              .filter((segment) => segment.phase !== "neutral")
              .map((segment) => [
                {
                  name: phaseLabel(segment.phase),
                  xAxis: dayLabel(segment.startDay),
                  itemStyle: {
                    color:
                      segment.phase === "rising"
                        ? "rgba(55,212,129,.08)"
                        : "rgba(255,94,108,.08)",
                  },
                  label: {
                    color: segment.phase === "rising" ? "#72dba0" : "#ff9da6",
                    fontSize: 9,
                  },
                },
                { xAxis: dayLabel(segment.endDay) },
              ]),
            [
              {
                name: "Aktives Fenster",
                xAxis: dayLabel(startDay),
                itemStyle: { color: "rgba(82,197,255,.16)" },
                label: { color: "#9edfff", fontSize: 9 },
              },
              { xAxis: dayLabel(endDay) },
            ],
          ] as unknown as never,
        },
      },
    ],
  };
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
export function fullscreenChartHeight(viewportHeight: number) {
  return Math.max(420, viewportHeight - 190);
}
function fmtPct(value?: number | null) {
  return value == null
    ? "—"
    : `${value > 0 ? "+" : ""}${number.format(value * 100)} %`;
}
function fmtRate(value?: number | null) {
  return value == null ? "—" : percent.format(value);
}
