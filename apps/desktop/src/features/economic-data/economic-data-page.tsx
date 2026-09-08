import { ChartColumn as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { EChartsOption } from "echarts";
import {
  Activity,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  ExternalLink,
  Factory,
  Gauge,
  Info,
  RefreshCw,
  ScanSearch,
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
import { dateTime, localDate, number } from "../../lib/utils";
import { api, isTauri } from "../../services/commands";
import type {
  EconomicValueUnit,
  EodhdIndicatorHistory,
  EodhdIndicatorHistoryPoint,
  MacroFundamentalsDashboard,
} from "../../types/domain";
import {
  chartMode,
  economicCategories,
  economicIndicatorsFor,
  economyLabel,
  indicatorLabel,
  indicatorSupportsCurrency,
  isPairComparableIndicator,
  supportedEconomies,
  unitLabel,
  type EconomicCategoryKey,
} from "./economic-data-config";

const categoryIcons = {
  growth: Factory,
  inflation: Banknote,
  labor: BriefcaseBusiness,
  rates: Activity,
} satisfies Record<EconomicCategoryKey, typeof Activity>;

const periodOptions = [12, 24, 36, 60, 120, 240] as const;

export function parseEconomicValue(value?: string | null) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEconomicValue(
  value: number | null,
  canonicalKey: string,
  unit?: EconomicValueUnit | null,
) {
  if (value == null) return "—";
  return `${number.format(value)} ${unitLabel(canonicalKey, unit)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function releaseLabel(point: EodhdIndicatorHistoryPoint) {
  return point.period?.trim() || localDate(point.releasedAt);
}

export function buildEconomicChartOption(
  history: EodhdIndicatorHistory,
): EChartsOption {
  const mode = chartMode(history);
  const actual = history.points.map((point) =>
    parseEconomicValue(point.actualText),
  );
  const forecast = history.points.map((point) =>
    parseEconomicValue(point.forecastText),
  );
  const previous = history.points.map((point) =>
    parseEconomicValue(point.previousText),
  );
  const values = [...actual, ...forecast, ...previous].filter(
    (value): value is number => value != null,
  );
  const hasNegative = values.some((value) => value < 0);
  const showZoom = history.points.length > 48;
  const isPmi = [
    "manufacturing_pmi",
    "services_pmi",
    "china_private_manufacturing_pmi",
    "china_private_services_pmi",
  ].includes(history.canonicalKey);
  const commonActual = {
    name: "Actual",
    data: actual,
    emphasis: { focus: "series" as const },
    markLine: isPmi
      ? {
          silent: true,
          symbol: "none",
          label: {
            show: true,
            formatter: "Neutral 50",
            color: "#8c9cb1",
            fontSize: 9,
          },
          lineStyle: {
            color: "rgba(177,191,211,.45)",
            type: "dashed" as const,
          },
          data: [{ yAxis: 50 }],
        }
      : undefined,
  };
  const actualSeries =
    mode === "bar"
      ? {
          ...commonActual,
          type: "bar" as const,
          barMaxWidth: 28,
          itemStyle: {
            color: "#278cff",
            borderColor: "#62aaff",
            borderWidth: 0.7,
            borderRadius: [3, 3, 0, 0],
          },
        }
      : {
          ...commonActual,
          type: "line" as const,
          step: (mode === "step" ? "end" : false) as false | "end",
          connectNulls: false,
          showSymbol: history.points.length <= 36,
          symbol: "circle",
          symbolSize: 6,
          smooth: mode === "line" ? 0.12 : false,
          lineStyle: { color: "#278cff", width: 2.2 },
          itemStyle: {
            color: "#278cff",
            borderColor: "#b9d8ff",
            borderWidth: 1,
          },
        };

  return {
    color: ["#278cff", "#f7b84b", "#7f8da3"],
    legend: {
      top: 2,
      left: 8,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { color: "#9aacc3", fontSize: 10 },
      data: ["Actual", "Forecast", "Previous"],
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        const dataIndex = Number(
          (rows[0] as { dataIndex?: number } | undefined)?.dataIndex ?? -1,
        );
        const point = history.points[dataIndex];
        if (!point) return "";
        const actualValue = parseEconomicValue(point.actualText);
        const forecastValue = parseEconomicValue(point.forecastText);
        const previousValue = parseEconomicValue(point.previousText);
        const surprise =
          actualValue != null && forecastValue != null
            ? actualValue - forecastValue
            : null;
        return [
          `<strong>${escapeHtml(releaseLabel(point))}</strong>`,
          `Release: ${escapeHtml(dateTime(point.releasedAt))}`,
          `Actual: ${formatEconomicValue(actualValue, history.canonicalKey, history.unit)}`,
          `Forecast: ${formatEconomicValue(forecastValue, history.canonicalKey, history.unit)}`,
          `Previous: ${formatEconomicValue(previousValue, history.canonicalKey, history.unit)}`,
          `Überraschung: ${formatEconomicValue(surprise, history.canonicalKey, history.unit)}`,
        ].join("<br />");
      },
    },
    grid: {
      left: 62,
      right: 24,
      top: 48,
      bottom: showZoom ? 68 : 42,
      containLabel: false,
    },
    xAxis: {
      type: "category",
      data: history.points.map((point) => point.releasedAt),
      boundaryGap: mode === "bar",
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        formatter: (value: string) =>
          new Intl.DateTimeFormat("de-DE", {
            month: "short",
            year: "2-digit",
          }).format(new Date(value)),
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: mode === "bar" && !hasNegative ? 0 : undefined,
      scale: mode !== "bar",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          `${number.format(value)} ${unitLabel(history.canonicalKey, history.unit)}`,
      },
      splitLine,
    },
    dataZoom: showZoom
      ? [
          { type: "inside", start: 48, end: 100 },
          {
            type: "slider",
            start: 48,
            end: 100,
            height: 16,
            bottom: 13,
            borderColor: "rgba(128,160,201,.14)",
            backgroundColor: "rgba(5,13,26,.42)",
            fillerColor: "rgba(76,120,255,.16)",
            handleStyle: { color: "#6b8cff", borderColor: "#a5b7ff" },
            textStyle: { color: "#71829a", fontSize: 8 },
          },
        ]
      : undefined,
    series: [
      actualSeries,
      {
        name: "Forecast",
        type: "scatter",
        data: forecast,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: {
          color: "#0b1526",
          borderColor: "#f7b84b",
          borderWidth: 2,
        },
        emphasis: { focus: "series", scale: 1.4 },
      },
      {
        name: "Previous",
        type: "line",
        data: previous,
        connectNulls: false,
        showSymbol: false,
        smooth: 0.08,
        lineStyle: { color: "#7f8da3", width: 1.3, type: "dashed" },
        itemStyle: { color: "#7f8da3" },
        emphasis: { focus: "series" },
      },
    ],
  };
}

export interface EconomicInsightMetrics {
  releaseCount: number;
  actualCount: number;
  completeSurpriseCount: number;
  forecastCoverage: number | null;
  directionalPositiveRate: number | null;
  meanAbsoluteError: number | null;
  momentum: number | null;
  revisionCount: number;
  ageDays: number | null;
}

export function calculateEconomicMetrics(
  history: EodhdIndicatorHistory,
): EconomicInsightMetrics {
  const actualValues = history.points
    .map((point) => ({
      point,
      value: parseEconomicValue(point.actualText),
    }))
    .filter(
      (item): item is { point: EodhdIndicatorHistoryPoint; value: number } =>
        item.value != null,
    );
  const surprises = history.points
    .map((point) => {
      const actual = parseEconomicValue(point.actualText);
      const forecast = parseEconomicValue(point.forecastText);
      return actual != null && forecast != null ? actual - forecast : null;
    })
    .filter((value): value is number => value != null);
  const latestActual = actualValues[actualValues.length - 1];
  const previousActual = actualValues[actualValues.length - 2];
  const forecastCoverage =
    actualValues.length > 0
      ? (surprises.length / actualValues.length) * 100
      : null;
  const directionalPositiveRate =
    surprises.length > 0
      ? (surprises.filter((value) => value * history.direction > 0).length /
          surprises.length) *
        100
      : null;
  const meanAbsoluteError =
    surprises.length > 0
      ? surprises.reduce((sum, value) => sum + Math.abs(value), 0) /
        surprises.length
      : null;
  const asOf = new Date(history.to).getTime();
  const latestRelease = latestActual
    ? new Date(latestActual.point.releasedAt).getTime()
    : Number.NaN;

  return {
    releaseCount: history.points.length,
    actualCount: actualValues.length,
    completeSurpriseCount: surprises.length,
    forecastCoverage,
    directionalPositiveRate,
    meanAbsoluteError,
    momentum:
      latestActual && previousActual
        ? latestActual.value - previousActual.value
        : null,
    revisionCount: history.points.reduce(
      (sum, point) => sum + point.revisionCount,
      0,
    ),
    ageDays:
      Number.isFinite(asOf) && Number.isFinite(latestRelease)
        ? Math.max(0, Math.floor((asOf - latestRelease) / 86_400_000))
        : null,
  };
}

function rollingAverage(values: Array<number | null>, windowSize: number) {
  return values.map((_, index) => {
    const window = values
      .slice(Math.max(0, index - windowSize + 1), index + 1)
      .filter((value): value is number => value != null);
    return window.length === windowSize
      ? window.reduce((sum, value) => sum + value, 0) / window.length
      : null;
  });
}

export function buildEconomicSurpriseChartOption(
  history: EodhdIndicatorHistory,
  currencyDirectional = true,
): EChartsOption {
  const surprises = history.points.map((point) => {
    const actual = parseEconomicValue(point.actualText);
    const forecast = parseEconomicValue(point.forecastText);
    return actual != null && forecast != null ? actual - forecast : null;
  });
  const movingAverage = rollingAverage(surprises, 3);

  return {
    legend: {
      top: 2,
      left: 8,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { color: "#9aacc3", fontSize: 10 },
      data: ["Actual − Forecast", "3-Release-Mittel"],
    },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        const dataIndex = Number(
          (rows[0] as { dataIndex?: number } | undefined)?.dataIndex ?? -1,
        );
        const point = history.points[dataIndex];
        const value = surprises[dataIndex];
        if (!point) return "";
        const directional =
          value == null
            ? null
            : value * (currencyDirectional ? history.direction : 1);
        return [
          `<strong>${escapeHtml(releaseLabel(point))}</strong>`,
          `Überraschung: ${formatEconomicValue(value, history.canonicalKey, history.unit)}`,
          directional == null
            ? currencyDirectional
              ? "Währungssignal: nicht verfügbar"
              : "Forecastabweichung: nicht verfügbar"
            : directional > 0
              ? currencyDirectional
                ? "Währungssignal: positiv"
                : "Forecastabweichung: über Konsens"
              : directional < 0
                ? currencyDirectional
                  ? "Währungssignal: negativ"
                  : "Forecastabweichung: unter Konsens"
                : currencyDirectional
                  ? "Währungssignal: neutral"
                  : "Forecastabweichung: exakt im Konsens",
        ].join("<br />");
      },
    },
    grid: { left: 58, right: 20, top: 46, bottom: 42 },
    xAxis: {
      type: "category",
      data: history.points.map((point) => point.releasedAt),
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        formatter: (value: string) =>
          new Intl.DateTimeFormat("de-DE", {
            month: "short",
            year: "2-digit",
          }).format(new Date(value)),
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => number.format(value),
      },
      splitLine,
    },
    series: [
      {
        name: "Actual − Forecast",
        type: "bar",
        barMaxWidth: 24,
        data: surprises.map((value) =>
          value == null
            ? null
            : {
                value,
                itemStyle: {
                  color:
                    value * (currencyDirectional ? history.direction : 1) > 0
                      ? "#35c98b"
                      : value * (currencyDirectional ? history.direction : 1) <
                          0
                        ? "#ef6573"
                        : "#7f8da3",
                  borderRadius: value >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
                },
              },
        ),
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: "rgba(177,191,211,.35)", width: 1 },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: "3-Release-Mittel",
        type: "line",
        data: movingAverage,
        connectNulls: false,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: { color: "#f7b84b", width: 1.8 },
        itemStyle: { color: "#f7b84b" },
      },
    ],
  };
}

export function buildCurrencySignalChartOption(
  dashboard: MacroFundamentalsDashboard,
  canonicalKey: string,
): EChartsOption {
  const rows = supportedEconomies.map((economy) => {
    const indicator = dashboard.currencies
      .find((item) => item.currency === economy.currency)
      ?.indicators.find((item) => item.key === canonicalKey);
    const available =
      indicator?.status === "scored" || indicator?.status === "neutral";
    return { economy, indicator, available };
  });

  return {
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const entries = Array.isArray(params) ? params : [];
        const dataIndex = Number(
          (entries[0] as { dataIndex?: number } | undefined)?.dataIndex ?? -1,
        );
        const row = rows[dataIndex];
        if (!row) return "";
        if (!row.available || !row.indicator) {
          return `<strong>${escapeHtml(row.economy.shortLabel)}</strong><br />Kein vergleichbarer vollständiger Release`;
        }
        return [
          `<strong>${escapeHtml(row.economy.shortLabel)}</strong>`,
          `Signal: ${row.indicator.score > 0 ? "+" : ""}${row.indicator.score}`,
          `Reihe: ${escapeHtml(row.indicator.sourceLabel ?? "EODHD")}`,
          `Release: ${escapeHtml(dateTime(row.indicator.releasedAt))}`,
        ].join("<br />");
      },
    },
    grid: { left: 42, right: 16, top: 22, bottom: 38 },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.economy.currency),
      axisLabel: { ...axisLabel, fontWeight: 700 },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: -1.25,
      max: 1.25,
      interval: 1,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) =>
          value === 1 ? "+1" : value === -1 ? "−1" : "0",
      },
      splitLine,
    },
    series: [
      {
        name: "Währungssignal",
        type: "bar",
        barMaxWidth: 30,
        data: rows.map((row) =>
          row.available && row.indicator
            ? {
                value: row.indicator.score,
                itemStyle: {
                  color:
                    row.indicator.score > 0
                      ? "#35c98b"
                      : row.indicator.score < 0
                        ? "#ef6573"
                        : "#7f8da3",
                  borderRadius:
                    row.indicator.score >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
                },
                label: {
                  show: true,
                  position: row.indicator.score < 0 ? "bottom" : "top",
                  color: "#b9c5d6",
                  fontSize: 9,
                  formatter:
                    row.indicator.score > 0 ? "+1" : `${row.indicator.score}`,
                },
              }
            : null,
        ),
      },
      {
        name: "Nicht verfügbar",
        type: "scatter",
        symbol: "emptyCircle",
        symbolSize: 8,
        data: rows
          .map((row, index) => (!row.available ? [index, 0] : null))
          .filter((value): value is [number, number] => value != null),
        itemStyle: { color: "#71829a" },
        label: {
          show: true,
          position: "top",
          color: "#71829a",
          fontSize: 8,
          formatter: "n/v",
        },
      },
    ],
  };
}

function queryErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Die historischen Wirtschaftsdaten konnten nicht geladen werden.";
}

function latestActualPoint(points: EodhdIndicatorHistoryPoint[]) {
  return [...points]
    .reverse()
    .find((point) => parseEconomicValue(point.actualText) != null);
}

export function EconomicDataPage() {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState<EconomicCategoryKey>("inflation");
  const [indicatorKey, setIndicatorKey] = useState("cpi_yoy");
  const [months, setMonths] = useState<(typeof periodOptions)[number]>(24);

  const categoryIndicators = economicIndicatorsFor(currency, category);
  const pairComparable = isPairComparableIndicator(indicatorKey);
  const history = useQuery({
    queryKey: ["economic-data", currency, indicatorKey, months],
    queryFn: () =>
      api.eodhdIndicatorHistory({
        currency,
        canonicalKey: indicatorKey,
        months,
      }),
    enabled: isTauri(),
  });
  const feedStatus = useQuery({
    queryKey: ["macro", "eodhd-status"],
    queryFn: api.eodhdFeedStatus,
    staleTime: 30_000,
  });
  const fundamentals = useQuery({
    queryKey: ["macro", "eodhd-fundamentals"],
    queryFn: api.macroFundamentalsDashboard,
    enabled: isTauri(),
  });
  const syncHistory = useMutation({
    mutationFn: () =>
      api.syncEodhdIndicatorHistory({
        currency,
        canonicalKey: indicatorKey,
        months,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["economic-data", result.currency, result.canonicalKey, result.months],
        result,
      );
      void queryClient.invalidateQueries({ queryKey: ["macro"] });
    },
  });
  const chartOption = useMemo(
    () => (history.data ? buildEconomicChartOption(history.data) : null),
    [history.data],
  );
  const surpriseChartOption = useMemo(
    () =>
      history.data
        ? buildEconomicSurpriseChartOption(history.data, pairComparable)
        : null,
    [history.data, pairComparable],
  );
  const currencySignalOption = useMemo(
    () =>
      pairComparable && fundamentals.data
        ? buildCurrencySignalChartOption(fundamentals.data, indicatorKey)
        : null,
    [fundamentals.data, indicatorKey, pairComparable],
  );

  const changeCategory = (nextCategory: EconomicCategoryKey) => {
    setCategory(nextCategory);
    const firstIndicator = economicIndicatorsFor(currency, nextCategory)[0];
    if (firstIndicator) setIndicatorKey(firstIndicator.key);
  };

  const changeCurrency = (nextCurrency: string) => {
    setCurrency(nextCurrency);
    if (!indicatorSupportsCurrency(indicatorKey, nextCurrency)) {
      const firstIndicator = economicIndicatorsFor(nextCurrency, category)[0];
      if (firstIndicator) setIndicatorKey(firstIndicator.key);
    }
  };

  const data = history.data;
  const latestPoint = data ? latestActualPoint(data.points) : undefined;
  const latestActual = parseEconomicValue(latestPoint?.actualText);
  const latestForecast = parseEconomicValue(latestPoint?.forecastText);
  const latestPrevious = parseEconomicValue(latestPoint?.previousText);
  const latestSurprise =
    latestActual != null && latestForecast != null
      ? latestActual - latestForecast
      : null;
  const displayLabel = indicatorLabel(indicatorKey, currency);
  const metrics = data ? calculateEconomicMetrics(data) : null;
  const displayUnit = data?.unit ?? null;
  const staleHistory =
    metrics?.ageDays != null &&
    data != null &&
    metrics.ageDays > data.freshnessDays;
  const currencySignalCoverage =
    pairComparable && fundamentals.data
      ? fundamentals.data.currencies.filter((item) => {
          const indicator = item.indicators.find(
            (candidate) => candidate.key === indicatorKey,
          );
          return (
            indicator?.status === "scored" || indicator?.status === "neutral"
          );
        }).length
      : 0;
  const historyCoverageIncomplete =
    data != null &&
    data.points.length > 0 &&
    new Date(data.points[0].releasedAt).getTime() -
      new Date(data.from).getTime() >
      120 * 24 * 60 * 60 * 1000;

  return (
    <div className="page economic-data-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Macro Workspace · EODHD Historie"
        title="Wirtschaftsdaten"
        description="Vergleiche reale EODHD-Releases über Wachstum, Inflation, Arbeitsmarkt und Zinsen – inklusive zusätzlicher China-Reihen, Prognoseüberraschungen und Datenqualität."
        actions={
          isTauri() ? (
            <Button
              onClick={() => syncHistory.mutate()}
              disabled={syncHistory.isPending}
            >
              <RefreshCw
                size={14}
                className={syncHistory.isPending ? "spin" : undefined}
              />
              {syncHistory.isPending
                ? "Historie wird geladen …"
                : months >= 120
                  ? `${months / 12} Jahre aktualisieren`
                  : `${months} Monate aktualisieren`}
            </Button>
          ) : undefined
        }
      />

      <section className="economic-category-grid" aria-label="Datenkategorien">
        {economicCategories.map((item) => {
          const Icon = categoryIcons[item.key];
          const selected = item.key === category;
          return (
            <button
              key={item.key}
              type="button"
              className={`economic-category${selected ? " selected" : ""}`}
              onClick={() => changeCategory(item.key)}
              aria-pressed={selected}
            >
              <span className="economic-category-icon">
                <Icon size={17} />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          );
        })}
      </section>

      <Card className="economic-controls-card">
        <CardContent className="economic-controls">
          <div className="field">
            <label htmlFor="economic-currency">Währung</label>
            <select
              id="economic-currency"
              className="select"
              value={currency}
              onChange={(event) => changeCurrency(event.target.value)}
            >
              {supportedEconomies.map((economy) => (
                <option key={economy.currency} value={economy.currency}>
                  {economy.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="economic-indicator">Indikator</label>
            <select
              id="economic-indicator"
              className="select"
              value={indicatorKey}
              onChange={(event) => setIndicatorKey(event.target.value)}
            >
              {categoryIndicators.map((indicator) => (
                <option key={indicator.key} value={indicator.key}>
                  {indicatorLabel(indicator.key, currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="economic-period">Zeitraum</label>
            <select
              id="economic-period"
              className="select"
              value={months}
              onChange={(event) =>
                setMonths(Number(event.target.value) as typeof months)
              }
            >
              {periodOptions.map((period) => (
                <option key={period} value={period}>
                  {period >= 120
                    ? `Letzte ${period / 12} Jahre`
                    : `Letzte ${period} Monate`}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {syncHistory.isError && (
        <ErrorState message={queryErrorMessage(syncHistory.error)} />
      )}

      {historyCoverageIncomplete && !syncHistory.isPending && (
        <div className="economic-context-note" role="note">
          <Info size={14} />
          Die lokale Reihe beginnt erst am{" "}
          {localDate(data?.points[0].releasedAt)}. Mit „
          {months >= 120 ? `${months / 12} Jahre` : `${months} Monate`}{" "}
          aktualisieren“ werden die fehlenden EODHD-Releases gezielt für{" "}
          {economyLabel(currency)} nachgeladen.
        </div>
      )}

      {staleHistory && !syncHistory.isPending && (
        <div className="economic-context-note" role="note">
          <Info size={14} />
          Der letzte Actual-Release liegt {metrics?.ageDays} Tage zurück und
          überschreitet das Frischefenster von {data?.freshnessDays} Tagen. Der
          Wert bleibt in der Historie sichtbar, wird aber nicht als aktuelles
          Heatmap-Signal verwendet.
        </div>
      )}

      {!isTauri() ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Historische EODHD-Daten benötigen die Desktop-App"
            description="Die Browser-Vorschau zeigt hier bewusst keine Mock-Releases. Starte Personal Macro als Tauri-App, um die lokale EODHD-Historie zu verwenden."
          />
        </Card>
      ) : history.isPending ? (
        <PageLoading />
      ) : history.isError ? (
        <ErrorState message={queryErrorMessage(history.error)} />
      ) : data ? (
        <>
          <Card className="economic-chart-card">
            <CardHeader
              title={`${displayLabel} – ${economyLabel(currency)}`}
              subtitle={`${data.frequency ?? "Frequenz nicht verfügbar"} · ${unitLabel(indicatorKey, displayUnit)} · ${localDate(data.from)} bis ${localDate(data.to)}`}
              action={
                <div className="economic-chart-meta">
                  <Badge className="primary">{currency}</Badge>
                  <span>
                    Letzter Datenabgleich:{" "}
                    {dateTime(feedStatus.data?.lastSuccessAt)}
                  </span>
                  <span>Nächster Release: {dateTime(data.nextReleaseAt)}</span>
                </div>
              }
            />
            <CardContent>
              <div className="economic-kpi-grid">
                <EconomicKpi
                  label="Actual"
                  value={formatEconomicValue(
                    latestActual,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta={
                    latestPoint
                      ? localDate(latestPoint.releasedAt)
                      : "Kein Release"
                  }
                />
                <EconomicKpi
                  label="Forecast"
                  value={formatEconomicValue(
                    latestForecast,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta="Konsens desselben Release"
                />
                <EconomicKpi
                  label="Previous"
                  value={formatEconomicValue(
                    latestPrevious,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta="Vom Provider gelieferter Vorwert"
                />
                <EconomicKpi
                  label="Überraschung"
                  value={formatEconomicValue(
                    latestSurprise,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta="Actual − Forecast"
                />
                <EconomicKpi
                  label="Release-Momentum"
                  value={formatEconomicValue(
                    metrics?.momentum ?? null,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta="Letzter Actual gegen vorherigen Actual"
                />
                <EconomicKpi
                  label="Ø Prognosefehler"
                  value={formatEconomicValue(
                    metrics?.meanAbsoluteError ?? null,
                    indicatorKey,
                    displayUnit,
                  )}
                  meta={`Mittlerer absoluter Fehler · n=${metrics?.completeSurpriseCount ?? 0}`}
                />
                <EconomicKpi
                  label={
                    pairComparable
                      ? "Währungspositive Releases"
                      : "Forecast-Übertreffungen"
                  }
                  value={
                    metrics?.directionalPositiveRate == null
                      ? "—"
                      : `${number.format(metrics.directionalPositiveRate)} %`
                  }
                  meta={
                    pairComparable
                      ? "Richtungsbereinigte Überraschungen"
                      : "Actual über Forecast; ohne Paar-Score"
                  }
                />
                <EconomicKpi
                  label="Forecast-Abdeckung"
                  value={
                    metrics?.forecastCoverage == null
                      ? "—"
                      : `${number.format(metrics.forecastCoverage)} %`
                  }
                  meta={`${metrics?.actualCount ?? 0} Actuals · ${metrics?.revisionCount ?? 0} Revisionen`}
                />
              </div>

              {data.points.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Keine historische Reihe verfügbar"
                  description={`Für ${displayLabel} in ${economyLabel(currency)} liegen im gewählten Zeitraum keine eindeutig zugeordneten Releases vor.`}
                  availabilityReason="Fehlende Daten werden nicht als neutral oder null dargestellt."
                />
              ) : data.points.length < 4 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Zu wenige Releases für einen belastbaren Verlauf"
                  description={`${data.points.length} Release${data.points.length === 1 ? "" : "s"} sind vorhanden. Die exakten Werte stehen unten in den Release-Details.`}
                />
              ) : chartOption ? (
                <>
                  <BaseChart option={chartOption} height={410} />
                  <div className="economic-chart-caption">
                    <span>Actual als veröffentlichter Wert</span>
                    <span>Forecast als Konsenspunkt</span>
                    <span>
                      Previous als Vorwert, nicht als Revisionshistorie
                    </span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <section
            className="economic-insight-grid"
            aria-label="Vertiefende Wirtschaftsdaten-Charts"
          >
            <Card className="economic-insight-card">
              <CardHeader
                title="Überraschungsdynamik"
                subtitle={
                  pairComparable
                    ? "Actual − Forecast; Grün/Rot folgt der Wirkung auf die Währung"
                    : "Actual − Forecast; Grün über, Rot unter dem Konsens"
                }
                action={<Gauge size={16} />}
              />
              <CardContent>
                {(metrics?.completeSurpriseCount ?? 0) < 3 ||
                !surpriseChartOption ? (
                  <EmptyState
                    icon={Gauge}
                    title="Zu wenige vollständige Prognosepaare"
                    description="Mindestens drei Releases mit Actual und Forecast sind für die Überraschungsdynamik erforderlich."
                  />
                ) : (
                  <BaseChart option={surpriseChartOption} height={300} />
                )}
              </CardContent>
            </Card>

            <Card className="economic-insight-card">
              <CardHeader
                title={
                  pairComparable
                    ? "Währungsvergleich"
                    : "China-spezifische Kontextreihe"
                }
                subtitle={
                  pairComparable
                    ? `Einfaches Signal −1 / 0 / +1 · ${currencySignalCoverage}/9 Volkswirtschaften verfügbar`
                    : "Historie und Überraschungssignal nur für CNY"
                }
                action={
                  pairComparable ? <ScanSearch size={16} /> : <Info size={16} />
                }
              />
              <CardContent>
                {!pairComparable ? (
                  <EmptyState
                    icon={Info}
                    title="Bewusst nicht im Paar-Scoring"
                    description="Diese Veröffentlichung besitzt keine belastbare Gegenreihe für alle neun Volkswirtschaften. Sie ergänzt die China-Analyse, verändert aber weder die 17 fundamentalen Heatmap-Zellen noch bestehende Paar-Scores."
                    availabilityReason="Actual, Forecast und Previous bleiben vollständig in der China-Historie sichtbar."
                  />
                ) : fundamentals.isError ? (
                  <EmptyState
                    icon={ScanSearch}
                    title="Währungsvergleich nicht verfügbar"
                    description={queryErrorMessage(fundamentals.error)}
                  />
                ) : fundamentals.isPending || !currencySignalOption ? (
                  <PageLoading />
                ) : (
                  <BaseChart option={currencySignalOption} height={300} />
                )}
                {pairComparable ? (
                  <p className="economic-insight-note">
                    Fehlende Gegenreihen erscheinen als „n/v“ und bleiben im
                    Paar-Scoring numerisch 0. Die Balken vergleichen
                    ausschließlich Actual mit dem Forecast desselben
                    freigegebenen Provider-Releases.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <Card className="economic-release-card">
            <details>
              <summary>
                <span>Release-Details</span>
                <small>{data.points.length} Veröffentlichungen</small>
              </summary>
              <div className="table-wrap economic-release-table-wrap">
                <table className="data-table economic-release-table">
                  <thead>
                    <tr>
                      <th>Release</th>
                      <th>Periode</th>
                      <th>Actual</th>
                      <th>Forecast</th>
                      <th>Previous</th>
                      <th>Überraschung</th>
                      <th>Revisionen</th>
                      <th>Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.points].reverse().map((point) => {
                      const actualValue = parseEconomicValue(point.actualText);
                      const forecastValue = parseEconomicValue(
                        point.forecastText,
                      );
                      const surprise =
                        actualValue != null && forecastValue != null
                          ? actualValue - forecastValue
                          : null;
                      return (
                        <tr key={point.id}>
                          <td className="tabular">
                            {localDate(point.releasedAt)}
                          </td>
                          <td>{point.period || "—"}</td>
                          <td className="tabular economic-actual-cell">
                            {formatEconomicValue(
                              actualValue,
                              indicatorKey,
                              point.unit,
                            )}
                          </td>
                          <td className="tabular">
                            {formatEconomicValue(
                              forecastValue,
                              indicatorKey,
                              point.unit,
                            )}
                          </td>
                          <td className="tabular">
                            {formatEconomicValue(
                              parseEconomicValue(point.previousText),
                              indicatorKey,
                              point.unit,
                            )}
                          </td>
                          <td className="tabular">
                            {formatEconomicValue(
                              surprise,
                              indicatorKey,
                              point.unit,
                            )}
                          </td>
                          <td className="tabular">
                            {point.revisionCount > 0
                              ? `${point.revisionCount}×`
                              : "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="economic-source-link"
                              onClick={() => void openUrl(point.sourceUrl)}
                              aria-label={`Quelle für ${releaseLabel(point)} öffnen`}
                            >
                              EODHD <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function EconomicKpi({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="economic-kpi">
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
      <small>{meta}</small>
    </div>
  );
}
