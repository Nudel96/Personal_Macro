import { Scale as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { EChartsOption } from "echarts";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Clock3,
  Database,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { localDate, number } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  AudChinaCpiBias,
  AudChinaCpiConfidence,
  AudChinaCpiRegimeForwardMetric,
  AudChinaCpiRegimeResponse,
  AudChinaCpiRegimeState,
  AudChinaCpiRegimeTimeframe,
} from "../../types/domain";

const stateColors: Record<AudChinaCpiRegimeState, string> = {
  falling: "#31b7ff",
  rising: "#f7b84b",
  transition: "#71829a",
  unavailable: "#52647d",
};

const stateAreaColors: Record<AudChinaCpiRegimeState, string> = {
  falling: "rgba(49,183,255,.055)",
  rising: "rgba(247,184,75,.055)",
  transition: "rgba(113,130,154,.035)",
  unavailable: "rgba(82,100,125,.025)",
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function signed(value?: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${number.format(value)}${suffix}`;
}

function ratio(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${number.format(value * 100)} %`;
}

function timestampDate(value?: number | null) {
  if (value == null) return "—";
  return localDate(new Date(value).toISOString());
}

function stateLabel(state: AudChinaCpiRegimeState) {
  switch (state) {
    case "falling":
      return "Fallende Inflation";
    case "rising":
      return "Steigende Inflation";
    case "transition":
      return "Übergang";
    default:
      return "Nicht verfügbar";
  }
}

function biasLabel(bias: AudChinaCpiBias) {
  switch (bias) {
    case "bullish":
      return "Historisch bullish";
    case "bearish":
      return "Historisch bearish";
    case "mixed":
      return "Historisch gemischt";
    default:
      return "Nicht belastbar";
  }
}

function confidenceLabel(confidence: AudChinaCpiConfidence) {
  switch (confidence) {
    case "high":
      return "hoch";
    case "medium":
      return "mittel";
    case "low":
      return "niedrig";
    default:
      return "nicht verfügbar";
  }
}

function biasTone(bias: AudChinaCpiBias) {
  if (bias === "bullish") return "positive";
  if (bias === "bearish") return "negative";
  return "neutral";
}

function qualityLabel(status: AudChinaCpiRegimeResponse["quality"]["status"]) {
  if (status === "available") return "Belastbar";
  if (status === "exploratory") return "Explorativ";
  return "Nicht verfügbar";
}

function queryErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "Die Regimeanalyse konnte nicht geladen werden.";
}

function chartDate(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function buildAudChinaCpiChartOption(
  data: AudChinaCpiRegimeResponse,
): EChartsOption {
  const dates = data.candles.map((candle) => chartDate(candle.time));
  const timeByDate = new Map(
    data.candles.map((candle) => [chartDate(candle.time), candle.time]),
  );
  const displayDateForTime = (time: number) => {
    const candle =
      data.candles.find((item) => item.time >= time) ??
      data.candles[data.candles.length - 1];
    return candle ? chartDate(candle.time) : chartDate(time);
  };
  const sortedMacro = [...data.macroPoints]
    .filter((point) => point.effectiveAt != null)
    .sort((left, right) => (left.effectiveAt ?? 0) - (right.effectiveAt ?? 0));
  let macroIndex = -1;
  const cpiStep = data.candles.map((candle) => {
    while (
      macroIndex + 1 < sortedMacro.length &&
      (sortedMacro[macroIndex + 1]?.effectiveAt ?? Number.POSITIVE_INFINITY) <=
        candle.time
    ) {
      macroIndex += 1;
    }
    return macroIndex >= 0 ? sortedMacro[macroIndex]?.actual : null;
  });
  const releasesByDate = new Map(
    sortedMacro.map((point) => [
      point.effectiveAt == null ? "" : displayDateForTime(point.effectiveAt),
      point,
    ]),
  );
  const visiblePoints = data.timeframe === "D1" ? 2520 : 780;
  const zoomStart =
    data.candles.length > visiblePoints
      ? ((data.candles.length - visiblePoints) / data.candles.length) * 100
      : 0;

  return {
    animationDuration: 350,
    grid: { left: 58, right: 62, top: 45, bottom: 74 },
    legend: {
      top: 5,
      left: 8,
      textStyle: { color: "#9aacc3", fontSize: 10 },
      itemWidth: 15,
      itemHeight: 8,
      data: ["AUDUSD", "China CPI YoY"],
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [];
        const first = list[0] as { axisValue?: string } | undefined;
        const date = first?.axisValue ?? "";
        const time = timeByDate.get(date);
        const candle = data.candles.find((item) => item.time === time);
        const release = releasesByDate.get(date);
        const effectiveRelease = [...sortedMacro]
          .reverse()
          .find(
            (point) =>
              (point.effectiveAt ?? Number.POSITIVE_INFINITY) <= (time ?? 0),
          );
        const rows = [
          `<strong>${escapeHtml(localDate(date))}</strong>`,
          candle
            ? `AUDUSD O/H/L/C: ${number.format(candle.open)} / ${number.format(candle.high)} / ${number.format(candle.low)} / ${number.format(candle.close)}`
            : "",
          effectiveRelease
            ? `China CPI: ${number.format(effectiveRelease.actual)} % · ${escapeHtml(stateLabel(effectiveRelease.state))}`
            : "China CPI: —",
          release
            ? `<span style="color:#8ea5cf">Release ${escapeHtml(localDate(release.releasedAt))} · 3M ${escapeHtml(signed(release.momentum3m, " PP"))} · 6M-Steigung ${escapeHtml(signed(release.slope6m, " PP/Release"))}</span>`
            : "",
        ].filter(Boolean);
        return rows.join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: true,
      axisLine,
      axisTick: { show: false },
      axisLabel: {
        ...axisLabel,
        formatter: (value: string) => value.slice(0, 7),
      },
    },
    yAxis: [
      {
        type: "value",
        name: "AUDUSD",
        nameTextStyle: { color: "#8ea5cf", fontSize: 9 },
        scale: true,
        position: "left",
        axisLine: { show: false },
        axisLabel: {
          ...axisLabel,
          formatter: (value: number) => number.format(value),
        },
        splitLine,
      },
      {
        type: "value",
        name: "China CPI YoY",
        nameTextStyle: { color: "#9fc2ff", fontSize: 9 },
        scale: true,
        position: "right",
        axisLine: { show: false },
        axisLabel: {
          ...axisLabel,
          color: "#8fb9ed",
          formatter: (value: number) => `${number.format(value)} %`,
        },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside", start: zoomStart, end: 100 },
      {
        type: "slider",
        start: zoomStart,
        end: 100,
        height: 20,
        bottom: 18,
        borderColor: "rgba(128,160,201,.12)",
        backgroundColor: "rgba(5,11,22,.45)",
        fillerColor: "rgba(76,120,255,.12)",
        handleStyle: { color: "#526fbe", borderColor: "#7894dc" },
        textStyle: { color: "#71829a", fontSize: 9 },
      },
    ],
    series: [
      {
        name: "AUDUSD",
        type: "candlestick",
        yAxisIndex: 0,
        data: data.candles.map((candle) => [
          candle.open,
          candle.close,
          candle.low,
          candle.high,
        ]),
        itemStyle: {
          color: "#37d481",
          color0: "#ff5e6c",
          borderColor: "#37d481",
          borderColor0: "#ff5e6c",
        },
        emphasis: { itemStyle: { borderWidth: 1.5 } },
        markArea: {
          silent: true,
          label: { show: false },
          data: data.intervals.map((interval) => [
            {
              xAxis: displayDateForTime(interval.startAt),
              itemStyle: { color: stateAreaColors[interval.state] },
            },
            { xAxis: displayDateForTime(interval.endAt) },
          ]),
        },
      },
      {
        name: "China CPI YoY",
        type: "line",
        yAxisIndex: 1,
        data: cpiStep,
        step: "end",
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: "#83b9ff", width: 2.2 },
        itemStyle: { color: "#83b9ff" },
        emphasis: { focus: "series" },
        z: 5,
      },
      {
        name: "CPI-Releases",
        type: "scatter",
        yAxisIndex: 1,
        data: dates.map((date) => {
          const point = releasesByDate.get(date);
          return point
            ? {
                value: point.actual,
                itemStyle: { color: stateColors[point.state] },
              }
            : null;
        }),
        symbolSize: data.timeframe === "D1" ? 4 : 6,
        z: 7,
      },
    ],
  };
}

function RegimeIcon({ state }: { state: AudChinaCpiRegimeState }) {
  if (state === "falling") return <TrendingDown size={18} />;
  if (state === "rising") return <TrendingUp size={18} />;
  return <ArrowRightLeft size={18} />;
}

function CurrentRegimePanel({ data }: { data: AudChinaCpiRegimeResponse }) {
  const current = data.current;
  return (
    <Card
      className="regime-insights-current"
      data-state={current.state}
      data-bias={current.audBias}
    >
      <CardContent className="regime-insights-current-grid">
        <div className="regime-insights-current-summary">
          <div className="regime-insights-kicker">
            <span className="regime-insights-state-icon">
              <RegimeIcon state={current.state} />
            </span>
            <span>Aktuelles China-CPI-Regime</span>
          </div>
          <h2>{current.label}</h2>
          <p>{current.description}</p>
          <div className="regime-insights-meta-row">
            <Badge>{localDate(current.lastReleaseAt)}</Badge>
            <span>{current.durationReleases} Releases in dieser Phase</span>
            <span>Wirksam ab {timestampDate(current.effectiveAt)}</span>
          </div>
        </div>

        <div className="regime-insights-current-aud">
          <div className="regime-insights-kicker">
            <Activity size={15} />
            <span>AUD-Kontext · {current.referenceHorizonWeeks} Wochen</span>
          </div>
          <strong data-tone={biasTone(current.audBias)}>
            {biasLabel(current.audBias)}
          </strong>
          <p>
            Median {signed(current.medianForwardReturnPct, " %")} · Trefferquote{" "}
            {ratio(current.positiveRatio)} · n={current.historicalSamples}
          </p>
          <small>
            Konfidenz {confidenceLabel(current.confidence)} · MFE{" "}
            {signed(current.averageMfePct, " %")} · MAE{" "}
            {signed(current.averageMaePct, " %")}
          </small>
        </div>
      </CardContent>
    </Card>
  );
}

function MacroMetricStrip({ data }: { data: AudChinaCpiRegimeResponse }) {
  const current = data.current;
  const metrics = [
    {
      label: "China CPI YoY",
      value: signed(current.actual, " %"),
      detail: `Release ${localDate(current.lastReleaseAt)}`,
    },
    {
      label: "1M-Veränderung",
      value: signed(current.change1m, " PP"),
      detail: "gegenüber dem vorherigen Release",
    },
    {
      label: "3M-Momentum",
      value: signed(current.momentum3m, " PP"),
      detail: "aktueller CPI minus drei Releases zuvor",
    },
    {
      label: "6M-Steigung",
      value: signed(current.slope6m, " PP"),
      detail: "lineare Steigung je Release",
    },
  ];
  return (
    <section
      className="regime-insights-metrics"
      aria-label="CPI-Regimemetriken"
    >
      {metrics.map((metric) => (
        <Card key={metric.label} className="regime-insights-metric">
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </Card>
      ))}
    </section>
  );
}

function ForwardMetricRow({
  label,
  metric,
}: {
  label: string;
  metric: AudChinaCpiRegimeForwardMetric;
}) {
  return (
    <tr>
      <td>
        <strong>{label}</strong>
        <small>{metric.horizonWeeks} Wochen</small>
      </td>
      <td className="num">{signed(metric.medianReturnPct, " %")}</td>
      <td className="num">{ratio(metric.positiveRatio)}</td>
      <td className="num">{signed(metric.p25ReturnPct, " %")}</td>
      <td className="num">{signed(metric.p75ReturnPct, " %")}</td>
      <td className="num positive-text">
        {signed(metric.averageMfePct, " %")}
      </td>
      <td className="num negative-text">
        {signed(metric.averageMaePct, " %")}
      </td>
      <td className="num">{metric.samples}</td>
    </tr>
  );
}

function HistoricalValidation({ data }: { data: AudChinaCpiRegimeResponse }) {
  return (
    <Card className="regime-insights-validation">
      <CardHeader
        title="Historische AUDUSD-Reaktion nach Regimebeginn"
        subtitle="Start am Open des nächsten Handelstags; MFE und MAE verwenden die vollständige OHLC-Spanne des jeweiligen Horizonts."
      />
      <CardContent>
        <div className="regime-insights-state-grids">
          {data.stateStatistics
            .filter((state) => state.state !== "transition")
            .map((state) => (
              <section
                className="regime-insights-state-table"
                data-state={state.state}
                key={state.state}
              >
                <header>
                  <div>
                    <RegimeIcon state={state.state} />
                    <span>
                      <strong>{state.label}</strong>
                      <small>{state.episodes} Regimeepisoden</small>
                    </span>
                  </div>
                  <Badge data-tone={biasTone(state.audBias)}>
                    {biasLabel(state.audBias)}
                  </Badge>
                </header>
                <div className="regime-insights-table-scroll">
                  <table className="data-table regime-insights-forward-table">
                    <thead>
                      <tr>
                        <th>Horizont</th>
                        <th className="num">Median</th>
                        <th className="num">Positiv</th>
                        <th className="num">P25</th>
                        <th className="num">P75</th>
                        <th className="num">MFE</th>
                        <th className="num">MAE</th>
                        <th className="num">n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.horizons.map((metric) => (
                        <ForwardMetricRow
                          key={metric.horizonWeeks}
                          label={`${metric.tradingDays} Handelstage`}
                          metric={metric}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EpisodeHistory({ data }: { data: AudChinaCpiRegimeResponse }) {
  const episodes = [...data.episodes]
    .filter((episode) => episode.state !== "unavailable")
    .reverse()
    .slice(0, 12);
  return (
    <Card>
      <CardHeader
        title="Historische Regimeepisoden"
        subtitle="Realisiertes Verhalten vom ersten handelbaren Open bis zum letzten Bar vor dem nächsten Zustandswechsel."
      />
      <CardContent className="regime-insights-table-scroll">
        {episodes.length === 0 ? (
          <EmptyState
            compact
            icon={Clock3}
            title="Noch keine Episoden verfügbar"
            description="Nach mindestens vier CPI-Releases und einer überlappenden AUDUSD-Historie erscheinen hier die erkannten Phasen."
          />
        ) : (
          <table className="data-table regime-insights-episode-table">
            <thead>
              <tr>
                <th>Regimebeginn</th>
                <th>Zustand</th>
                <th className="num">CPI Δ</th>
                <th className="num">AUDUSD</th>
                <th className="num">MFE</th>
                <th className="num">MAE</th>
                <th className="num">Releases</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr key={`${episode.state}-${episode.effectiveStartAt}`}>
                  <td>
                    <strong>{timestampDate(episode.effectiveStartAt)}</strong>
                    <small>Release {localDate(episode.startReleaseAt)}</small>
                  </td>
                  <td>
                    <span
                      className="regime-insights-state-dot"
                      data-state={episode.state}
                    />
                    {stateLabel(episode.state)}
                  </td>
                  <td className="num">{signed(episode.cpiChangePp, " PP")}</td>
                  <td
                    className={`num ${episode.returnPct > 0 ? "positive-text" : episode.returnPct < 0 ? "negative-text" : ""}`}
                  >
                    {signed(episode.returnPct, " %")}
                  </td>
                  <td className="num positive-text">
                    {signed(episode.maxFavorableExcursionPct, " %")}
                  </td>
                  <td className="num negative-text">
                    {signed(episode.maxAdverseExcursionPct, " %")}
                  </td>
                  <td className="num">{episode.observations}</td>
                  <td>{episode.completed ? "Abgeschlossen" : "Aktiv"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function QualityAndMethodology({ data }: { data: AudChinaCpiRegimeResponse }) {
  return (
    <section className="regime-insights-bottom-grid">
      <Card>
        <CardHeader
          title="Datenqualität"
          subtitle={data.quality.reason}
          action={
            <Badge data-status={data.quality.status}>
              {qualityLabel(data.quality.status)}
            </Badge>
          }
        />
        <CardContent>
          <dl className="regime-insights-quality-grid">
            <div>
              <dt>CPI-Releases</dt>
              <dd>{data.quality.cpiObservations}</dd>
            </div>
            <div>
              <dt>AUDUSD D1-Bars</dt>
              <dd>{data.quality.priceCandles}</dd>
            </div>
            <div>
              <dt>Gerichtete Episoden</dt>
              <dd>{data.quality.directionalEpisodes}</dd>
            </div>
            <div>
              <dt>Gemeinsamer Zeitraum</dt>
              <dd>
                {localDate(data.quality.overlapStart)} –{" "}
                {localDate(data.quality.overlapEnd)}
              </dd>
            </div>
          </dl>
          <div className="regime-insights-warnings">
            {data.quality.warnings.map((warning) => (
              <div key={warning}>
                <AlertTriangle size={14} />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Methodik & Herkunft"
          subtitle={`Modell ${data.modelVersion}`}
        />
        <CardContent className="regime-insights-methodology">
          <div>
            <Database size={15} />
            <span>
              <strong>Regime</strong>
              <small>{data.methodology.regimeBasis}</small>
            </span>
          </div>
          <div>
            <Clock3 size={15} />
            <span>
              <strong>No-look-ahead</strong>
              <small>{data.methodology.effectiveTiming}</small>
            </span>
          </div>
          <div>
            <BarChart3 size={15} />
            <span>
              <strong>Marktvalidierung</strong>
              <small>{data.methodology.validationBasis}</small>
            </span>
          </div>
          <div className="regime-insights-source-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void openUrl(data.macroSourceUrl)}
            >
              China CPI · {data.macroSourceName}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void openUrl(data.marketSourceUrl)}
            >
              AUDUSD · {data.marketSourceName}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function RegimeInsightsPage() {
  const queryClient = useQueryClient();
  const [timeframe, setTimeframe] = useState<AudChinaCpiRegimeTimeframe>("W1");
  const regime = useQuery({
    queryKey: ["regime-insights", "aud-china-cpi", timeframe],
    queryFn: () => api.audChinaCpiRegime({ timeframe }),
    enabled: isTauri(),
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshAudChinaCpiRegime({ timeframe }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["regime-insights", "aud-china-cpi", result.timeframe],
        result,
      );
      void queryClient.invalidateQueries({
        queryKey: ["economic-data", "CNY"],
      });
      void queryClient.invalidateQueries({ queryKey: ["seasonality"] });
      void queryClient.invalidateQueries({ queryKey: ["macro"] });
    },
  });
  const chartOption = useMemo(
    () => (regime.data ? buildAudChinaCpiChartOption(regime.data) : null),
    [regime.data],
  );

  return (
    <div className="page regime-insights-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Regime Insights · AUD"
        title="China-Inflation × Australian Dollar"
        description="Erkenne langfristige China-CPI-Phasen und validiere, wie sich AUDUSD nach vergleichbaren Regimewechseln tatsächlich verhalten hat."
        actions={
          isTauri() ? (
            <Button
              variant="primary"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw
                size={14}
                className={refresh.isPending ? "spin" : undefined}
              />
              {refresh.isPending
                ? "20 Jahre werden abgeglichen …"
                : "CPI & AUDUSD aktualisieren"}
            </Button>
          ) : undefined
        }
      />

      {refresh.isError && (
        <ErrorState message={queryErrorMessage(refresh.error)} />
      )}

      {!isTauri() ? (
        <Card>
          <EmptyState
            icon={Database}
            title="Regimeanalyse benötigt die Desktop-App"
            description="China-CPI und AUDUSD-OHLC werden bewusst aus der lokalen SQLite-Datenbank gelesen. Die Browser-Vorschau erzeugt dafür keine Mocksignale."
          />
        </Card>
      ) : regime.isPending ? (
        <PageLoading />
      ) : regime.isError ? (
        <ErrorState message={queryErrorMessage(regime.error)} />
      ) : regime.data ? (
        <>
          <CurrentRegimePanel data={regime.data} />
          <MacroMetricStrip data={regime.data} />

          <Card className="regime-insights-chart-card">
            <CardHeader
              title="AUDUSD OHLC & China CPI YoY"
              subtitle={`${regime.data.marketProxyLabel} · CPI-Zustand ab dem nächsten Handelstag · ${qualityLabel(regime.data.quality.status)}`}
              action={
                <div className="segmented" aria-label="Chart-Zeiteinheit">
                  {(["D1", "W1"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={timeframe === value ? "active" : undefined}
                      aria-pressed={timeframe === value}
                      onClick={() => setTimeframe(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              }
            />
            <CardContent>
              {regime.data.candles.length === 0 ||
              regime.data.macroPoints.length === 0 ||
              !chartOption ? (
                <EmptyState
                  icon={BarChart3}
                  title="Noch keine gemeinsame Historie"
                  description="Für den Chart werden lokale China-CPI-Releases und AUDUSD-D1-Kerzen benötigt; eine Regimeklassifikation beginnt ab vier Releases."
                  availabilityReason="Mit „CPI & AUDUSD aktualisieren“ lädt die Desktop-App beide EODHD-Reihen gezielt nach."
                  action={
                    <Button
                      onClick={() => refresh.mutate()}
                      disabled={refresh.isPending}
                    >
                      <RefreshCw size={14} /> Daten laden
                    </Button>
                  }
                />
              ) : (
                <>
                  <div
                    className="regime-insights-chart-legend"
                    aria-hidden="true"
                  >
                    <span data-state="falling">Fallende CPI-Phase</span>
                    <span data-state="rising">Steigende CPI-Phase</span>
                    <span data-state="transition">Übergang</span>
                  </div>
                  <BaseChart
                    option={chartOption}
                    height={520}
                    ariaLabel="AUDUSD-Candlestick-Chart mit China-CPI-Regimen"
                  />
                </>
              )}
            </CardContent>
          </Card>

          {regime.data.quality.status !== "unavailable" && (
            <>
              <div className="regime-insights-context-note" role="note">
                <Info size={14} />
                <span>
                  Die AUD-Richtung wird aus historischen Outcomes abgeleitet.
                  Ein fallender China CPI ist daher nicht automatisch bearish;
                  ohne mindestens{" "}
                  {regime.data.methodology.minimumDirectionalSamples}{" "}
                  unabhängige Regimeanfänge bleibt der Kontext nicht belastbar.
                </span>
              </div>
              <HistoricalValidation data={regime.data} />
              <EpisodeHistory data={regime.data} />
            </>
          )}

          <QualityAndMethodology data={regime.data} />
        </>
      ) : null}
    </div>
  );
}
