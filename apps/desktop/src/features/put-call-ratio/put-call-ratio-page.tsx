import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EChartsOption } from "echarts";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { useState } from "react";
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
import type { PutCallDashboard, PutCallSentiment } from "../../types/domain";

const calibrationWindow = 252;

const sentimentLabels: Record<PutCallSentiment, string> = {
  bullish: "Bullishes Sentiment",
  neutral: "Neutrales Sentiment",
  bearish: "Bearishes Sentiment",
  unavailable: "Noch nicht bewertbar",
};

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Die CME-Daten konnten nicht aktualisiert werden.";
}

function formatUsdNotional(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function sentimentTone(sentiment: PutCallSentiment) {
  if (sentiment === "bullish") return "positive";
  if (sentiment === "bearish") return "negative";
  if (sentiment === "unavailable") return "warning";
  return "neutral";
}

export function buildPutCallChartOption(
  dashboard: PutCallDashboard,
): EChartsOption {
  const thresholds = dashboard.thresholds;
  const values = dashboard.points.flatMap((point) => [
    point.ma5,
    ...(thresholds ? [thresholds.bullish, thresholds.bearish] : []),
  ]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, maximum * 0.16, 0.2);
  const yMin = Math.max(0, minimum - range * 0.08);
  const yMax = maximum + range * 0.08;

  return {
    tooltip: {
      ...tooltip,
      trigger: "axis",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [];
        const dataIndex = Number(
          (rows[0] as { dataIndex?: number } | undefined)?.dataIndex ?? -1,
        );
        const point = dashboard.points[dataIndex];
        if (!point) return "";
        return [
          `<strong>${localDate(point.tradeDate)}</strong>`,
          `5-Tage-Durchschnitt: ${number.format(point.ma5)}`,
          `Tageswert: ${number.format(point.rawRatio)}`,
          `Calls: ${formatUsdNotional(point.callNotionalUsd)}`,
          `Puts: ${formatUsdNotional(point.putNotionalUsd)}`,
        ].join("<br />");
      },
    },
    grid: { left: 54, right: 24, top: 34, bottom: 40 },
    xAxis: {
      type: "category",
      data: dashboard.points.map((point) => point.tradeDate),
      boundaryGap: false,
      axisLabel: {
        ...axisLabel,
        formatter: (value: string) => localDate(value),
        hideOverlap: true,
      },
      axisLine,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      scale: true,
      axisLabel: {
        ...axisLabel,
        formatter: (value: number) => number.format(value),
      },
      splitLine,
    },
    series: [
      {
        name: "Put/Call Ratio (MA5)",
        type: "line",
        data: dashboard.points.map((point) => point.ma5),
        showSymbol: false,
        smooth: 0.24,
        lineStyle: { color: "#dbe7ff", width: 2.4 },
        itemStyle: { color: "#dbe7ff" },
        emphasis: { focus: "series" },
        markLine: thresholds
          ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              data: [
                {
                  name: "Bullish",
                  yAxis: thresholds.bullish,
                  lineStyle: { color: "#37d481", type: "dashed", width: 1.5 },
                },
                {
                  name: "Bearish",
                  yAxis: thresholds.bearish,
                  lineStyle: { color: "#ff5e6c", type: "dashed", width: 1.5 },
                },
              ],
            }
          : undefined,
        markArea: thresholds
          ? {
              silent: true,
              data: [
                [
                  {
                    name: "Bullish",
                    yAxis: yMin,
                    itemStyle: { color: "rgba(55, 212, 129, 0.08)" },
                    label: { show: false },
                  },
                  { yAxis: thresholds.bullish },
                ],
                [
                  {
                    name: "Bearish",
                    yAxis: thresholds.bearish,
                    itemStyle: { color: "rgba(255, 94, 108, 0.08)" },
                    label: { show: false },
                  },
                  { yAxis: yMax },
                ],
              ],
            }
          : undefined,
      },
    ],
  };
}

export function PutCallRatioPage() {
  const queryClient = useQueryClient();
  const [assetSymbol, setAssetSymbol] = useState("EURUSD");
  const dashboard = useQuery({
    queryKey: ["put-call", assetSymbol],
    queryFn: () => api.putCallDashboard(assetSymbol),
  });
  const sync = useMutation({
    mutationFn: api.syncPutCall,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["put-call"] }),
  });

  if (dashboard.isLoading) {
    return (
      <div className="page put-call-page">
        <PageLoading />
      </div>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <div className="page put-call-page">
        <ErrorState message="Put/Call-Daten konnten nicht geladen werden." />
      </div>
    );
  }

  const data = dashboard.data;
  const thresholds = data.thresholds;
  const canSync = isTauri() && !data.nativeOnly;

  return (
    <div className="page put-call-page">
      <PageHeader
        eyebrow="Research"
        title="Put/Call Ratio"
        description="CME-Optionsvolumen als Sentiment-Kontext für FX-Paare. Die Einordnung beschreibt die beobachtete Put-/Call-Dominanz und ist keine Handelsempfehlung."
        actions={
          <Button
            onClick={() => sync.mutate()}
            disabled={sync.isPending || !canSync}
            aria-label="CME aktualisieren"
          >
            <RefreshCw size={14} />
            {sync.isPending ? "CME wird geladen …" : "CME aktualisieren"}
          </Button>
        }
      />

      <Card className="put-call-card">
        <CardHeader
          title="Put/Call-Ratio · 5-Tage-Durchschnitt"
          subtitle="Put-Notional ÷ Call-Notional · asset-spezifische P20-/P80-Schwellen"
          action={
            <label className="put-call-control">
              <span>Asset</span>
              <select
                className="select"
                aria-label="Asset"
                value={assetSymbol}
                onChange={(event) => setAssetSymbol(event.target.value)}
              >
                {data.assets.map((asset) => (
                  <option value={asset.symbol} key={asset.symbol}>
                    {asset.label}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <CardContent>
          {sync.isError && (
            <div className="notice negative" role="alert">
              {errorMessage(sync.error)} Bereits gespeicherte Daten bleiben
              unverändert verfügbar.
            </div>
          )}

          {!canSync && (
            <div className="notice" role="status">
              Der CME-Abruf ist ausschließlich in der nativen Desktop-App
              verfügbar. In der Browser-Vorschau werden keine Marktdaten
              simuliert.
            </div>
          )}

          {data.points.length === 0 ? (
            <EmptyState
              icon={DatabaseZap}
              title="Noch keine CME-Tageswerte"
              description="Nach dem ersten erfolgreichen CME-Abruf baut die App die lokale Historie täglich auf. Für den 5-Tage-Durchschnitt werden mindestens fünf Beobachtungen benötigt."
              availabilityReason={
                data.lastRunMessage ??
                "Fehlende Historie wird nicht als neutraler Wert dargestellt."
              }
            />
          ) : (
            <>
              <div className="put-call-summary">
                <div className="put-call-current">
                  <span>Aktueller MA5</span>
                  <strong>
                    {data.latestValue == null
                      ? "Nicht verfügbar"
                      : number.format(data.latestValue)}
                  </strong>
                  <Badge className={sentimentTone(data.sentiment)}>
                    {sentimentLabels[data.sentiment]}
                  </Badge>
                </div>

                {thresholds ? (
                  <div className="put-call-thresholds">
                    <span className="put-call-threshold bullish">
                      Bullish bis {number.format(thresholds.bullish)}
                    </span>
                    <span className="put-call-threshold bearish">
                      Bearish ab {number.format(thresholds.bearish)}
                    </span>
                  </div>
                ) : (
                  <div className="put-call-calibration">
                    Schwellenkalibrierung: {data.calibrationSampleSize} /{" "}
                    {calibrationWindow} gültige MA5-Werte. Bis dahin keine
                    Bullish-/Bearish-Bewertung.
                  </div>
                )}
              </div>

              <div className="put-call-chart">
                <BaseChart
                  option={buildPutCallChartOption(data)}
                  height={500}
                />
              </div>

              <div className="put-call-meta">
                <span>
                  Quelle: CME Daily FX Options Update ·{" "}
                  {data.selectedAsset.sourceSymbol}
                </span>
                <span>
                  Orientierung:{" "}
                  {data.selectedAsset.sourceOrientation === "inverse"
                    ? "für das gewählte Paar invertiert"
                    : "direkt"}
                </span>
                <span>Letzter Handelstag: {localDate(data.lastTradeDate)}</span>
                <span>
                  Letzter erfolgreicher Abruf:{" "}
                  {dateTime(data.lastSuccessfulSyncAt)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
