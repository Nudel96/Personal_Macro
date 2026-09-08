import { ChartNoAxesCombined as PageIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { EChartsOption } from "echarts";
import { DatabaseZap, ExternalLink, FileUp } from "lucide-react";
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

const minimumExtremeSample = 20;
const calibrationWindow = 252;
const cmeReportUrl = "https://www.cmegroup.com/reports/fx-put-call.pdf";
const cmeDailyVolumeArchiveUrl = "https://www.cmegroup.com/ftp/daily_volume/";

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

function formatSourceValue(value: number, unit: string) {
  if (unit === "usd_notional") return formatUsdNotional(value);
  return `${new Intl.NumberFormat("de-DE").format(value)} Kontrakte`;
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
    point.rawRatio,
    ...(point.ma5 == null ? [] : [point.ma5]),
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
          `Tages-PCR: ${number.format(point.rawRatio)}`,
          `5-Tage-PCR: ${point.ma5 == null ? "Noch nicht verfügbar" : number.format(point.ma5)}`,
          `CME-native Calls: ${formatSourceValue(point.callValue, point.valueUnit)}`,
          `CME-native Puts: ${formatSourceValue(point.putValue, point.valueUnit)}`,
          `Methode: ${point.methodLabel}`,
          `Orientierung: ${dashboard.selectedAsset.sourceOrientation === "inverse" ? "für das Anzeigepaar invertiert" : "direkt"}`,
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
        name: "Tages-PCR",
        type: "line",
        data: dashboard.points.map((point) => point.rawRatio),
        showSymbol: dashboard.points.length < 20,
        symbolSize: 5,
        smooth: 0.12,
        lineStyle: { color: "#7186ad", width: 1.4, type: "dashed" },
        itemStyle: { color: "#8ea5cf" },
        emphasis: { focus: "series" },
      },
      {
        name: "5-Tage-PCR (MA5)",
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
              data: [
                {
                  name: "High Call Volume",
                  yAxis: thresholds.bullish,
                  lineStyle: { color: "#6ea8fe", type: "dashed", width: 1.6 },
                  label: {
                    show: true,
                    position: "insideStartBottom",
                    formatter: `High Call Volume · ≤ ${number.format(thresholds.bullish)}`,
                    color: "#9fc2ff",
                    backgroundColor: "rgba(10, 24, 45, 0.9)",
                    borderRadius: 4,
                    padding: [4, 6],
                    fontSize: 10,
                    fontWeight: 700,
                  },
                },
                {
                  name: "High Put Volume",
                  yAxis: thresholds.bearish,
                  lineStyle: { color: "#ff6b78", type: "dotted", width: 1.6 },
                  label: {
                    show: true,
                    position: "insideStartTop",
                    formatter: `High Put Volume · ≥ ${number.format(thresholds.bearish)}`,
                    color: "#ff9aa3",
                    backgroundColor: "rgba(43, 18, 29, 0.9)",
                    borderRadius: 4,
                    padding: [4, 6],
                    fontSize: 10,
                    fontWeight: 700,
                  },
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
                    name: "High Call Volume",
                    yAxis: yMin,
                    itemStyle: { color: "rgba(78, 132, 220, 0.1)" },
                    label: { show: false },
                  },
                  { yAxis: thresholds.bullish },
                ],
                [
                  {
                    name: "High Put Volume",
                    yAxis: thresholds.bearish,
                    itemStyle: { color: "rgba(255, 94, 108, 0.1)" },
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
  const importPdf = useMutation({
    mutationFn: async () => {
      const path = await open({
        multiple: false,
        filters: [{ name: "CME PDF-Report", extensions: ["pdf"] }],
      });
      if (typeof path !== "string") return null;
      return api.importPutCallPdf(path);
    },
    onSuccess: (result) => {
      if (result) {
        return queryClient.invalidateQueries({ queryKey: ["put-call"] });
      }
      return undefined;
    },
  });

  const importXlsx = useMutation({
    mutationFn: async () => {
      const paths = await open({
        multiple: true,
        filters: [{ name: "CME Daily Volume", extensions: ["xlsx"] }],
      });
      if (!Array.isArray(paths) || paths.length === 0) return null;
      return api.importPutCallXlsx(paths);
    },
    onSuccess: (result) => {
      if (result) {
        return queryClient.invalidateQueries({ queryKey: ["put-call"] });
      }
      return undefined;
    },
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
  const latestPoint = data.points[data.points.length - 1];

  return (
    <div className="page put-call-page">
      <PageHeader
        icon={PageIcon}
        eyebrow="Research"
        title="Put/Call Ratio"
        description="CME-Optionsvolumen als Sentiment-Kontext für FX-Paare. Die Einordnung beschreibt die beobachtete Put-/Call-Dominanz und ist keine Handelsempfehlung."
        actions={
          <>
            <Button
              onClick={() => void openUrl(cmeDailyVolumeArchiveUrl)}
              disabled={!canSync}
              aria-label="CME-Archiv öffnen"
            >
              <ExternalLink size={14} />
              CME-Archiv öffnen
            </Button>
            <Button
              onClick={() => importXlsx.mutate()}
              disabled={importXlsx.isPending || !canSync}
              aria-label="XLSX-Dateien importieren"
            >
              <FileUp size={14} />
              {importXlsx.isPending
                ? "XLSX wird importiert …"
                : "XLSX-Dateien importieren"}
            </Button>
            <Button
              onClick={() => void openUrl(cmeReportUrl)}
              disabled={!canSync}
              aria-label="CME-Report öffnen"
            >
              <ExternalLink size={14} />
              CME-Report öffnen
            </Button>
            <Button
              onClick={() => importPdf.mutate()}
              disabled={importPdf.isPending || !canSync}
              aria-label="PDF importieren"
            >
              <FileUp size={14} />
              {importPdf.isPending
                ? "PDF wird importiert …"
                : "PDF importieren"}
            </Button>
          </>
        }
      />

      <Card className="put-call-card">
        <CardHeader
          title="Put/Call-Ratio · Tageswert und 5-Tage-Durchschnitt"
          subtitle="Täglich neu kalibrierte High-Call-/High-Put-Extremzonen · P20/P80 des MA5 · maximal 252 Beobachtungen"
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
          {importPdf.data && (
            <div className="notice positive" role="status">
              CME-Report vom {localDate(importPdf.data.tradeDate)} importiert:{" "}
              {importPdf.data.storedAssets} Assets gespeichert.
            </div>
          )}

          {importXlsx.data && (
            <div className="notice positive" role="status">
              CME-XLSX-Import: {importXlsx.data.validTradingDays} Handelstage,{" "}
              {importXlsx.data.storedObservations} Beobachtungen gespeichert.
              {importXlsx.data.skippedLowerPriority > 0 && (
                <>
                  {" "}
                  {importXlsx.data.skippedLowerPriority} höher priorisierte
                  PDF-Beobachtungen beibehalten.
                </>
              )}
            </div>
          )}

          {importPdf.isError && (
            <div className="notice negative" role="alert">
              {errorMessage(importPdf.error)} Bereits gespeicherte Daten bleiben
              unverändert verfügbar.
            </div>
          )}

          {importXlsx.isError && (
            <div className="notice negative" role="alert">
              {errorMessage(importXlsx.error)} Bereits gespeicherte Daten
              bleiben unverändert verfügbar.
            </div>
          )}

          {!canSync && (
            <div className="notice" role="status">
              Der CME-PDF-Import ist ausschließlich in der nativen Desktop-App
              verfügbar. In der Browser-Vorschau werden keine Marktdaten
              simuliert.
            </div>
          )}

          {data.points.length === 0 ? (
            <EmptyState
              icon={DatabaseZap}
              title="Noch keine CME-Tageswerte"
              description="Nach dem ersten erfolgreichen CME-PDF-Import baut die App die lokale Historie täglich auf. Für den 5-Tage-Durchschnitt werden mindestens fünf Beobachtungen benötigt."
              availabilityReason={
                data.lastRunMessage ??
                "Fehlende Historie wird nicht als neutraler Wert dargestellt."
              }
            />
          ) : (
            <>
              <div className="put-call-summary">
                <div className="put-call-current">
                  <span>Aktuelle Tages-PCR</span>
                  <strong>
                    {data.latestRawRatio == null
                      ? "Nicht verfügbar"
                      : number.format(data.latestRawRatio)}
                  </strong>
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
                    <span className="put-call-threshold high-call">
                      High Call Volume ≤ {number.format(thresholds.bullish)}
                    </span>
                    <span className="put-call-threshold high-put">
                      High Put Volume ≥ {number.format(thresholds.bearish)}
                    </span>
                    <small>P20/P80 · n={thresholds.sampleSize}</small>
                  </div>
                ) : (
                  <div className="put-call-calibration">
                    Extremkalibrierung: {data.calibrationSampleSize} /{" "}
                    {minimumExtremeSample} benötigte MA5-Werte. Bis dahin keine
                    High-Call-/High-Put-Bewertung; das vollständige rollierende
                    Fenster umfasst bis zu {calibrationWindow} Werte.
                  </div>
                )}
              </div>

              <div className="put-call-chart">
                <BaseChart
                  option={buildPutCallChartOption(data)}
                  height={500}
                />
              </div>

              <section
                className="put-call-explanation"
                aria-labelledby="put-call-extremes-title"
              >
                <div>
                  <span className="page-eyebrow">Interpretation</span>
                  <h3 id="put-call-extremes-title">
                    Was bedeuten die Extremzonen?
                  </h3>
                </div>
                <div className="put-call-explanation-grid">
                  <article data-tone="high-call">
                    <strong>High Call Volume</strong>
                    <p>
                      Der paaradjustierte MA5 liegt am oder unter dem
                      historischen P20. Calls dominieren relativ zur jüngsten
                      Historie – ein bullisher Sentiment-Kontext für das
                      gewählte Paar.
                    </p>
                  </article>
                  <article data-tone="neutral">
                    <strong>Normalbereich</strong>
                    <p>
                      Zwischen P20 und P80 besteht keine statistische
                      Volumenextreme. Der Put-/Call-Mix ist relativ zur eigenen
                      Historie unauffällig.
                    </p>
                  </article>
                  <article data-tone="high-put">
                    <strong>High Put Volume</strong>
                    <p>
                      Der paaradjustierte MA5 liegt am oder über dem
                      historischen P80. Puts beziehungsweise Absicherung
                      dominieren – ein bearisher Sentiment-Kontext für das
                      gewählte Paar.
                    </p>
                  </article>
                </div>
                <p className="put-call-explanation-note">
                  Die Grenzen werden nach jedem Import aus mindestens 20 und
                  höchstens den letzten 252 gültigen MA5-Beobachtungen neu
                  berechnet. Sie sind asset-spezifisch, bei USD-Basispaaren
                  richtungsinvertiert und kein eigenständiges Handelssignal.
                </p>
              </section>

              <div className="put-call-meta">
                <span>CME-Underlying: {data.selectedAsset.sourceSymbol}</span>
                {latestPoint && <span>{latestPoint.methodLabel}</span>}
                {latestPoint && (
                  <span>
                    Status:{" "}
                    {latestPoint.isPreliminary
                      ? "vorläufig"
                      : "direkt importiert"}
                  </span>
                )}
                {latestPoint?.sourceFile && (
                  <span>Quelldatei: {latestPoint.sourceFile}</span>
                )}
                <span>
                  Orientierung:{" "}
                  {data.selectedAsset.sourceOrientation === "inverse"
                    ? "für das gewählte Paar invertiert"
                    : "direkt"}
                </span>
                <span>Letzter Handelstag: {localDate(data.lastTradeDate)}</span>
                <span>
                  Letzte erfolgreiche Aktualisierung:{" "}
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
