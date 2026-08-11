import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import {
  CalendarDays,
  DatabaseZap,
  Maximize2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
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
  const visibleAssets = (dashboard.data?.assets ?? []).filter(
    (item) =>
      (category === "Alle" || item.category === category) &&
      `${item.symbol} ${item.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selectedSymbol = selected ?? visibleAssets[0]?.symbol;
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
    queryKey: ["seasonality", "analysis", analysisInput],
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
      <div className="page">
        <PageLoading />
      </div>
    );
  if (dashboard.isError || !dashboard.data)
    return (
      <div className="page">
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
  return (
    <div className="page">
      <PageHeader
        eyebrow="Marktkontext"
        title="Seasonality Chancen-Explorer"
        description="Lokale, reproduzierbare Muster aus BlackBull-MT5-D1-Historie – mit frei wählbaren Jahreskohorten und Datumsfenstern."
        actions={
          <>
            <Badge className="primary">
              <DatabaseZap size={12} /> {dashboard.data.assets.length} lokale
              Profile
            </Badge>
          </>
        }
      />
      <DataStatusStrip
        status={
          dashboard.data.assets.length
            ? `${dashboard.data.assets.length} lokale Profile`
            : "Noch keine Profile"
        }
        quality={
          dashboard.data.collectionError
            ? "Erhebung prüfen"
            : dashboard.data.collectionStatus === "running"
              ? "Erhebung läuft"
              : "Lokale Quelle"
        }
        detail={
          dashboard.data.assets.length
            ? "Asset auswählen und Zeitfenster vergleichen"
            : "Historie wird lokal aufgebaut"
        }
      />
      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>Datenbasis:</strong> Nur lokal gespeicherte BlackBull-D1-Kurse.
        Wochenenden und Feiertage verwenden den ersten verfügbaren Schlusskurs
        danach; der 29. Februar ist aus Vergleichsfenstern ausgeschlossen.
      </div>
      {!dashboard.data.assets.length && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Lokale Erhebung:</strong>{" "}
          {dashboard.data.collectionError
            ? dashboard.data.collectionError
            : dashboard.data.collectionStatus === "running"
              ? "Die erstmalige Speicherung aller verfügbaren Kernmarkt-Historien läuft im Hintergrund."
              : "Die erstmalige Speicherung aller verfügbaren Kernmarkt-Historien startet automatisch kurz nach dem App-Start."}
        </div>
      )}
      <Card style={{ marginBottom: 14 }}>
        <CardHeader
          title="Saisonaler Chancen-Screener"
          subtitle="Die Rangfolge kombiniert die konservative Wilson-Trefferquote, Medianrendite relativ zur Schwankung und Stichprobengröße."
        />
        <CardContent>
          {screener.isLoading ? (
            <PageLoading />
          ) : screener.isError ? (
            <EmptyState
              icon={DatabaseZap}
              title="Screener benötigt die Desktop-App"
              description="Die automatische Erstsynchronisierung läuft nach dem App-Start im Hintergrund."
            />
          ) : (
            <Screener
              rows={screener.data ?? []}
              onSelect={(symbol, window) => {
                setSelected(symbol);
                setWindowStart(window.startDate);
                setWindowDays(window.tradingDays);
              }}
            />
          )}
        </CardContent>
      </Card>
      <div className="toolbar card" style={{ marginBottom: 14 }}>
        <div className="segmented">
          {categories.map((value) => (
            <button
              key={value}
              className={category === value ? "active" : ""}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <label className="input-with-icon">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Asset suchen"
          />
        </label>
      </div>
      <div className="seasonality-deep-layout">
        <Card>
          <CardHeader
            title="Kernmarkt-Assets"
            subtitle={`${visibleAssets.length} lokal gespeicherte Symbole`}
          />
          <CardContent>
            <div className="seasonality-asset-scroll">
              {visibleAssets.map((item) => {
                const profile = item;
                return (
                  <button
                    key={item.symbol}
                    className={`seasonality-asset-row ${selectedSymbol === item.symbol ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(item.symbol);
                      setWindowStart("");
                    }}
                  >
                    <span>
                      <strong>{item.symbol}</strong>
                      <small>{item.description ?? item.category}</small>
                    </span>
                    <span>
                      {profile ? (
                        <Badge
                          className={
                            profile.qualityStatus === "available"
                              ? "positive"
                              : "warning"
                          }
                        >
                          {profile.completeYears} Jahre
                        </Badge>
                      ) : (
                        <Badge className="neutral">Noch laden</Badge>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title={selectedSymbol ?? "Asset auswählen"}
            subtitle={
              selectedSummary
                ? `${selectedSummary.completeYears} vollständige Jahre · zuletzt ${new Date(selectedSummary.calculatedAt).toLocaleDateString("de-DE")}`
                : "Noch keine lokale Berechnung"
            }
          />
          <CardContent>
            {analysis.isLoading ? (
              <PageLoading />
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
              <EmptyState
                icon={Sparkles}
                title="Noch kein lokales Profil"
                description={
                  analysis.error
                    ? "Die tiefe Analyse benötigt die Desktop-App und gespeicherte D1-Historie."
                    : "Die automatische Erstsynchronisierung läuft nach dem App-Start im Hintergrund."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
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
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Bullisches Fenster</th>
            <th>Bärisches Fenster</th>
            <th>Historie</th>
            <th>Quelle</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row) => (
            <tr key={row.symbol}>
              <td>
                <button
                  className="link-button"
                  onClick={() =>
                    row.bullishWindow && onSelect(row.symbol, row.bullishWindow)
                  }
                >
                  {row.symbol}
                </button>
                <small className="block-muted">
                  {row.description ?? row.category}
                </small>
              </td>
              <td>
                {row.bullishWindow ? (
                  <WindowButton
                    window={row.bullishWindow}
                    onClick={() => onSelect(row.symbol, row.bullishWindow!)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td>
                {row.bearishWindow ? (
                  <WindowButton
                    window={row.bearishWindow}
                    onClick={() => onSelect(row.symbol, row.bearishWindow!)}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td>{row.completeYears} Jahre</td>
              <td>
                <Badge
                  className={
                    row.dataSource.startsWith("Dukascopy")
                      ? "primary"
                      : "warning"
                  }
                >
                  {row.dataSource.startsWith("Dukascopy")
                    ? "Dukascopy"
                    : "Fallback"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <YearFilterBuilder
        value={yearFilter}
        onChange={setYearFilter}
        selectedYears={analysis.selectedYears}
      />
      <div className="toolbar" style={{ margin: "14px 0" }}>
        <label>
          Referenz (MM-TT)
          <input
            value={referenceDate}
            onChange={(event) => setReferenceDate(event.target.value)}
            aria-label="Referenzdatum"
          />
        </label>
        <label>
          Fensterstart (MM-TT)
          <input
            value={windowStart}
            onChange={(event) => setWindowStart(event.target.value)}
            placeholder={analysis.referenceDate}
            aria-label="Fensterstart"
          />
        </label>
        <label>
          Handelstage
          <input
            type="number"
            min={5}
            max={90}
            value={windowDays}
            onChange={(event) =>
              setWindowDays(
                Math.max(5, Math.min(90, Number(event.target.value) || 20)),
              )
            }
            aria-label="Fensterlänge"
          />
        </label>
        <Badge
          className={
            analysis.qualityStatus === "available" ? "positive" : "warning"
          }
        >
          {analysis.qualityStatus === "available"
            ? "Belastbare Kohorte"
            : "Explorative Kohorte"}
        </Badge>
      </div>
      <div className="notice" style={{ marginBottom: 14 }}>
        <strong>{analysis.selectedYears.length} verwendete Jahre:</strong>{" "}
        {analysis.selectedYears.join(", ") || "keine"}. {analysis.qualityReason}
      </div>
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
      <div className="grid stats-grid" style={{ marginBottom: 14 }}>
        <Metric
          label="Gewähltes Fenster"
          value={`${window.startDate} · ${window.tradingDays}T`}
          detail={`${window.samples} historische Beobachtungen`}
        />
        <Metric
          label="Medianrendite"
          value={fmtPct(window.medianReturn)}
          detail={`Ø ${fmtPct(window.averageReturn)} · Vol. ${fmtPct(window.volatility)}`}
          tone={window.direction}
        />
        <Metric
          label="Positiv / Negativ"
          value={`${fmtRate(window.positiveRatio)} / ${fmtRate(window.negativeRatio)}`}
          detail={`Wilson-Untergrenze ${fmtRate(window.wilsonLowerBound)}`}
        />
        <Metric
          label="Spannweite"
          value={`${fmtPct(window.p10)} bis ${fmtPct(window.p90)}`}
          detail={
            window.qualityStatus === "available"
              ? "statistisch bewertbar"
              : "zu kleine Stichprobe"
          }
        />
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, .9fr)",
          gap: 14,
        }}
      >
        <Card>
          <CardHeader
            title="Kalendergenaue Durchschnitts-Saisonkurve"
            subtitle="Eine Linie: arithmetischer Durchschnitt aller ausgewählten vollständigen Jahre · Index 100 zum Jahresbeginn"
          />
          <CardContent>
            <BaseChart option={annualOption(analysis)} height={300} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            title="Aktuelle Vorwärtsfenster"
            subtitle={`Startpunkt ${analysis.referenceDate}`}
          />
          <CardContent>
            <BaseChart option={forwardOption(analysis)} height={300} />
          </CardContent>
        </Card>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}
      >
        <WindowList
          title="Stärkste bullische Fenster"
          subtitle="konservativ nach Trefferwahrscheinlichkeit gerankt"
          values={analysis.bullishWindows}
          onSelect={(value) => {
            setWindowStart(value.startDate);
            setWindowDays(value.tradingDays);
          }}
        />
        <WindowList
          title="Stärkste bärische Fenster"
          subtitle="konservativ nach Trefferwahrscheinlichkeit gerankt"
          values={analysis.bearishWindows}
          onSelect={(value) => {
            setWindowStart(value.startDate);
            setWindowDays(value.tradingDays);
          }}
        />
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}
      >
        <Card>
          <CardHeader
            title="Monatsrenditen"
            subtitle="Mittelwert und positive Jahre"
          />
          <CardContent>
            <BaseChart option={periodOption(analysis)} height={230} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Datenherkunft" subtitle="Lokal persistiert" />
          <CardContent>
            <div className="metric-stack">
              <span>Quelle: {analysis.dataSource}, native D1</span>
              <span>
                Preisbasis: Bid/Ask-Mittelwert · Tagesgrenze{" "}
                {analysis.nativeTimezone ?? "Anbieter nativ"}
              </span>
              <span>
                Historie: {analysis.historyStart ?? "—"} bis{" "}
                {analysis.historyEnd ?? "—"}
              </span>
              <span>
                Profil berechnet:{" "}
                {new Date(analysis.calculatedAt).toLocaleString("de-DE")}
              </span>
              <span>
                {analysis.missingDays} erkannte Datenlücken über Handelspausen
                hinaus.
              </span>
              <span>Fenster können über den Jahreswechsel laufen.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
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
      <Card className="seasonality-annual-card">
        <CardHeader
          title="Jährliche Durchschnitts-Seasonality"
          subtitle={`${analysis.selectedYears.length} ausgewählte Jahre werden zu einer Linie gemittelt · ${window.startDate} · ${window.tradingDays} Handelstage`}
        />
        <CardContent>
          <div className="seasonality-chart-frame">
            <Button
              className="seasonality-fullscreen-trigger"
              size="icon"
              variant="ghost"
              onClick={onOpenFullscreen}
              aria-label="Seasonality-Chart im Vollbild öffnen"
              title="Vollbild"
            >
              <Maximize2 size={16} />
            </Button>
            <BaseChart option={annualOption(analysis)} height={355} />
          </div>
          <div className="seasonality-chart-note">
            Eine Linie: Durchschnitt aller gewählten Jahre · 15-Kalendertage
            geglättet, nur zur besseren Lesbarkeit.
          </div>
        </CardContent>
      </Card>
      <Card className="seasonality-roadmap-card">
        <CardHeader
          title="Saisonaler Fahrplan"
          subtitle="Grün = historische Aufbauphase · Rot = historische Abbauphase"
        />
        <CardContent>
          <SeasonalRoadmap analysis={analysis} />
        </CardContent>
      </Card>
      <Card className="seasonality-heatmap-card">
        <CardHeader
          title="Chancen-Explorer"
          subtitle="Vertiefung: Startdatum × Haltedauer · Klick übernimmt das Fenster"
        />
        <CardContent>
          <BaseChart
            option={opportunityHeatmapOption(analysis)}
            height={310}
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
      <div className="seasonality-insight-rail">
        <Card>
          <CardHeader
            title="Richtungs-Verteilung"
            subtitle="Gewinn- gegen Verlustjahre"
          />
          <CardContent>
            <BaseChart option={winLossOption(window)} height={165} />
          </CardContent>
        </Card>
        <Card className="seasonality-side-kpis">
          <Metric
            label="Pattern Return"
            value={fmtPct(totalReturn)}
            detail={`${window.samples} historische Fenster`}
            tone={window.direction}
          />
          <Metric
            label="Trefferquote"
            value={fmtRate(
              window.direction === -1
                ? window.negativeRatio
                : window.positiveRatio,
            )}
            detail={`Wilson ${fmtRate(window.wilsonLowerBound)}`}
          />
        </Card>
        <Card className="seasonality-gain-loss">
          <CardHeader
            title="Gewinne / Verluste"
            subtitle="Einzelne historische Jahresfenster"
          />
          <CardContent>
            <div className="seasonality-gain-loss-grid">
              <div className="positive-text">
                <strong>{gains.length}</strong>
                <span>Gewinnjahre</span>
                <small>
                  {fmtPct(meanReturn(gains.map((item) => item.returnValue)))} Ø
                  Gewinn
                </small>
              </div>
              <div className="negative-text">
                <strong>{losses.length}</strong>
                <span>Verlustjahre</span>
                <small>
                  {fmtPct(meanReturn(losses.map((item) => item.returnValue)))} Ø
                  Verlust
                </small>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Kumulierte Pattern-Rendite"
          subtitle="Chronologisch über die gewählte Jahreskohorte"
        />
        <CardContent>
          <BaseChart option={cumulativePatternOption(window)} height={220} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          title="Pattern Returns"
          subtitle="Interaktive Auswahl oben aktualisiert alle Jahreswerte"
        />
        <CardContent>
          <BaseChart option={patternReturnsOption(window)} height={220} />
        </CardContent>
      </Card>
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
  const chartHeight =
    typeof window === "undefined"
      ? 650
      : Math.max(520, window.innerHeight - 190);
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
            <BaseChart option={annualOption(analysis)} height={chartHeight} />
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
    </div>
  );
}

function YearFilterBuilder({
  value,
  onChange,
  selectedYears,
}: {
  value: SeasonalityYearFilter;
  onChange: (value: SeasonalityYearFilter) => void;
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
    <Card>
      <CardHeader
        title="Kohorte & Berechnung"
        subtitle="Alle aktiven Regeln wirken als Schnittmenge. Mehrere Jahresendziffern ergeben immer eine gemeinsame Durchschnittskurve. Wahljahre: Zyklus 4, Anker 2024."
      />
      <CardContent>
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
              value={value.includeYears.join(", ")}
              onChange={(event) =>
                update({
                  includeYears: parseSeasonalityYears(event.target.value),
                })
              }
              placeholder="z. B. 2016, 2020"
            />
          </label>
          <label>
            Diese Jahre ausnehmen
            <input
              value={value.excludeYears.join(", ")}
              onChange={(event) =>
                update({
                  excludeYears: parseSeasonalityYears(event.target.value),
                })
              }
              placeholder="z. B. 2020"
            />
          </label>
        </div>
        <div className="seasonality-digit-filter">
          <span>Jahresendziffer:</span>
          {Array.from({ length: 10 }, (_, digit) => (
            <button
              key={digit}
              className={value.endingDigits.includes(digit) ? "active" : ""}
              onClick={() => toggleDigit(digit)}
            >
              {digit}
            </button>
          ))}
          <span className="block-muted">
            {selectedYears.length} Jahre gewählt
          </span>
        </div>
      </CardContent>
    </Card>
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
      className={`seasonality-window ${window.direction === 1 ? "positive" : "negative"}`}
      onClick={onClick}
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
          label: { color: "#858585", formatter: "Index 100" },
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
function opportunityHeatmapOption(
  analysis: SeasonalityAnalysis,
): EChartsOption {
  const cells = analysis.heatmap ?? [];
  const starts = [...new Set(cells.map((cell) => cell.startDate))];
  const durations = Array.from({ length: 86 }, (_, index) => index + 5);
  const data = cells.map((cell) => ({
    value: [
      starts.indexOf(cell.startDate),
      durations.indexOf(cell.tradingDays),
      cell.score ?? 0,
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
            color: (item.medianReturn ?? 0) >= 0 ? "#37d481" : "#ff5e6c",
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
            color: (item.averageReturn ?? 0) >= 0 ? "#37d481" : "#ff5e6c",
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
function meanReturn(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
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
        .map((item) => Number(item.trim()))
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
